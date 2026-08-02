/**
 * QF CODE Evaluator
 * Walks the AST produced by the parser and executes the program.
 *
 * Design:
 *   - Environment chain: global scope + per-function local scope (no closures)
 *   - Control flow via JS exceptions (BreakSignal, ContinueSignal, ReturnSignal, QFError)
 *   - I/O via an injected `io` object: { print(str), erase(), async input(prompt) }
 *   - All async operations (INPUT) bubble up via async/await
 *   - LAST_ERROR object is maintained as a plain object in the evaluator
 *
 * Usage:
 *   const ev = new Evaluator({ print: console.log, erase: ()=>{}, input: async (p)=>{ ... } });
 *   await ev.run(ast);
 */

// ─── Control flow signals (thrown as exceptions, caught by enclosing constructs) ──

class BreakSignal    { constructor(line) { this.line = line; } }
class ContinueSignal { constructor(line) { this.line = line; } }
class ReturnSignal   { constructor(value, line) { this.value = value; this.line = line; } }

// Runtime error thrown by SIGNAL() or by the evaluator itself
class QFError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'QFError';
    this.qfLine = line ?? 0;
  }
}

// ─── Environment ──────────────────────────────────────────────────────────────

class Environment {
  constructor(parent = null) {
    this.vars   = Object.create(null); // name → { value, isConst }
    this.parent = parent;
  }

  /** Look up a variable, walking the chain. Returns the env that owns it or null. */
  _ownerOf(name) {
    if (Object.prototype.hasOwnProperty.call(this.vars, name)) return this;
    return this.parent ? this.parent._ownerOf(name) : null;
  }

  get(name, line) {
    const env = this._ownerOf(name);
    if (!env) {
      throw new QFError(
        `'${name.toLowerCase()}' hasn't been declared. Use VAR ${name.toLowerCase()} = ... to create it before using it.`,
        line
      );
    }
    return env.vars[name].value;
  }

  declare(name, value, isConst, line) {
    if (Object.prototype.hasOwnProperty.call(this.vars, name)) {
      // Re-declaration in same scope (e.g. VAR inside a loop body) —
      // update the value. CONST can't be re-declared.
      if (this.vars[name].isConst) {
        throw new QFError(`'${name.toLowerCase()}' is a constant and cannot be changed.`, line);
      }
      this.vars[name].value = value;
      return;
    }
    this.vars[name] = { value, isConst: !!isConst };
  }

  assign(name, value, line) {
    const env = this._ownerOf(name);
    if (!env) {
      throw new QFError(
        `'${name.toLowerCase()}' hasn't been declared. Use VAR ${name.toLowerCase()} = ... to create it before using it.`,
        line
      );
    }
    if (env.vars[name].isConst) {
      throw new QFError(
        `${name.toLowerCase()} is a constant and cannot be changed.`,
        line
      );
    }
    env.vars[name].value = value;
  }

  /** Delete a name from this env only (used for FOR loop variable cleanup) */
  delete(name) {
    delete this.vars[name];
  }
}

// ─── QF VALUE helpers ─────────────────────────────────────────────────────────

const EMPTY = Symbol('EMPTY'); // sentinel for the EMPTY value

function isQFArray(v) {
  return Array.isArray(v);
}

function typeOf(v) {
  if (v === EMPTY)         return 'empty';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number')  return 'number';
  if (typeof v === 'string')  return 'string';
  if (isQFArray(v))           return 'array';
  return 'unknown';
}

function displayValue(v) {
  if (v === EMPTY)            return 'EMPTY';
  if (v === true)             return 'TRUE';
  if (v === false)            return 'FALSE';
  if (isQFArray(v))           return '[' + v.map(displayValue).join(', ') + ']';
  return String(v);
}

// ─── SOUND — note name to frequency ───────────────────────────────────────────
// Equal-tempered scale, A4 = 440 Hz. Accepts "C4", "A#3", "Bb5", etc.
// Returns null if the string isn't a recognizable note name.

const NOTE_SEMITONES_FROM_A = {
  C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2,
};

function noteNameToFrequency(name) {
  const m = /^([A-Ga-g])([#b♭♯]?)(-?\d{1,2})$/.exec(name.trim());
  if (!m) return null;

  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);

  let semitone = NOTE_SEMITONES_FROM_A[letter];
  if (accidental === '#' || accidental === '♯') semitone += 1;
  if (accidental === 'b' || accidental === '♭') semitone -= 1;

  const semitonesFromA4 = semitone + (octave - 4) * 12;
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

class Evaluator {
  /**
   * @param {{ print: (s:string)=>void, erase: ()=>void, input: (prompt:string)=>Promise<string>, sound: (freq:number, durationMs:number)=>Promise<void> }} io
   */
  constructor(io) {
    this.io = io;
    this.globalEnv = new Environment();
    this.functionDefs = Object.create(null); // name → FunctionDecl node
    this.callDepth = 0;
    this.MAX_CALL_DEPTH = 500;
    // Browser-safety limits. These are deliberately generous for a teaching
    // language, but low enough to stop an accidental endless loop before it
    // can monopolize the tab or create an enormous output DOM.
    this.MAX_ITERATIONS = 10_000;
    this.MAX_EXECUTION_STEPS = 100_000;
    this.YIELD_EVERY_STEPS = 100;
    this.executionSteps = 0;
    this.stopRequested = false;

    // LAST_ERROR object — always available
    this.lastError = { MESSAGE: '', LINE: 0, CODE: '' };
    // Expose LAST_ERROR in global env as a special slot
    this.globalEnv.declare('LAST_ERROR', this.lastError, false, 0);
  }

  resetLastError() {
    this.lastError.MESSAGE = '';
    this.lastError.LINE    = 0;
    this.lastError.CODE    = '';
  }

  setLastError(message, line, code = 'ERR') {
    this.lastError.MESSAGE = message;
    this.lastError.LINE    = line;
    this.lastError.CODE    = code;
  }

  // ── Cooperative execution guard ───────────────────────────────────────────
  // Ported from the gibiddapress.com QF Code 1.1 build (2026-08-02 reconciliation).
  // Runs once per executed statement (via execBlock) and once per loop
  // iteration (WHILE/FOR/FOR EACH). A pure iteration cap on loops alone isn't
  // enough — a long-running FUNCTION with no loop, or a chain of nested
  // blocks, can still lock up the tab — so this counts total *statements*
  // executed, not just loop turns.

  async checkpoint(line = 0) {
    if (this.stopRequested) throw new StopSignal();

    this.executionSteps++;
    if (this.executionSteps > this.MAX_EXECUTION_STEPS) {
      throw new QFError(
        `Program stopped after ${this.MAX_EXECUTION_STEPS.toLocaleString()} execution steps to keep the browser responsive. Check for a loop or function that never finishes.`,
        line
      );
    }

    // Awaiting an already-resolved promise only yields to the microtask
    // queue, which can still starve painting and button clicks. A
    // zero-delay timer yields to the browser's actual event loop, so Stop
    // and the rest of the UI remain responsive while a program runs.
    if (this.executionSteps % this.YIELD_EVERY_STEPS === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (this.stopRequested) throw new StopSignal();
    }
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  async run(ast) {
    // First pass: hoist function declarations into functionDefs
    for (const node of ast.body) {
      if (node.type === 'FunctionDecl') {
        if (this.functionDefs[node.name]) {
          throw new QFError(`Function '${node.name.toLowerCase()}' is already defined.`, node.line);
        }
        this.functionDefs[node.name] = node;
      }
    }
    // Execute top-level statements
    await this.execBlock(ast.body, this.globalEnv);
  }

  // ── Block execution ────────────────────────────────────────────────────────

  async execBlock(stmts, env, resetErrors = true) {
    for (const stmt of stmts) {
      if (stmt.type === 'FunctionDecl') continue; // already registered
      await this.checkpoint(stmt.line);
      if (resetErrors) this.resetLastError();
      await this.execStmt(stmt, env);
    }
  }

  // ── Statement dispatch ────────────────────────────────────────────────────

  async execStmt(node, env) {
    switch (node.type) {
      case 'VarDecl':      return this.execVarDecl(node, env);
      case 'Assign':       return this.execAssign(node, env);
      case 'PrintStmt':    return this.execPrint(node, env);
      case 'EraseStmt':    return this.execErase(node, env);
      case 'StopStmt':     throw new ReturnSignal(EMPTY, node.line); // reuse as stop
      case 'SignalStmt':   return this.execSignal(node, env);
      case 'ReturnStmt':   return this.execReturn(node, env);
      case 'BreakStmt':    throw new BreakSignal(node.line);
      case 'ContinueStmt': throw new ContinueSignal(node.line);
      case 'IfStmt':       return this.execIf(node, env);
      case 'WhileStmt':    return this.execWhile(node, env);
      case 'ForStmt':      return this.execFor(node, env);
      case 'ForEachStmt':  return this.execForEach(node, env);
      case 'MatchStmt':    return this.execMatch(node, env);
      case 'AttemptStmt':  return this.execAttempt(node, env);
      case 'ExprStmt':     return this.evalExpr(node.expr, env);
      case 'FunctionDecl': return; // no-op (already registered)
      default:
        throw new QFError(`Unknown statement type: ${node.type}`, node.line);
    }
  }

  // ── VAR / CONST ────────────────────────────────────────────────────────────

  async execVarDecl(node, env) {
    const value = node.value ? await this.evalExpr(node.value, env) : EMPTY;
    env.declare(node.name, value, node.isConst, node.line);
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  async execAssign(node, env) {
    const value = await this.evalExpr(node.value, env);
    const target = node.target;

    if (target.type === 'Identifier') {
      env.assign(target.name, value, node.line);
    } else if (target.type === 'IndexExpr') {
      const obj   = await this.evalExpr(target.object, env);
      const index = await this.evalExpr(target.index, env);
      if (isQFArray(obj)) {
        this.checkArrayIndex(obj, index, target.line);
        obj[index] = value;
      } else if (typeof obj === 'string') {
        throw new QFError(`Strings are immutable — you can't assign to a character position. Reassign the whole variable instead.`, node.line);
      } else {
        throw new QFError(`Cannot use index assignment on a ${typeOf(obj)}.`, node.line);
      }
    } else if (target.type === 'PropertyExpr') {
      throw new QFError(`Cannot assign to a property.`, node.line);
    } else {
      throw new QFError(`Invalid assignment target.`, node.line);
    }
  }

  // ── WRITE / WRITELN ────────────────────────────────────────────────────────

  async execPrint(node, env) {
    const parts = [];
    for (const arg of node.args) {
      const v = await this.evalExpr(arg, env);
      parts.push(displayValue(v));
    }
    // node.newline === true  → WRITELN: append newline (default io.print behaviour)
    // node.newline === false → WRITE:   no newline, append to current line
    if (node.newline === false) {
      this.io.write(parts.join(' '));
    } else {
      this.io.print(parts.join(' '));
    }
  }

  // ── ERASE ──────────────────────────────────────────────────────────────────

  async execErase(node, env) {
    if (node.arg === null) {
      this.io.erase();
    } else {
      const v = await this.evalExpr(node.arg, env);
      if (!isQFArray(v)) {
        throw new QFError(`ERASE() with an argument expects an array.`, node.line);
      }
      v.splice(0, v.length);
    }
  }

  // ── SIGNAL ─────────────────────────────────────────────────────────────────

  async execSignal(node, env) {
    const msg = await this.evalExpr(node.message, env);
    throw new QFError(String(msg), node.line);
  }

  // ── RETURN ─────────────────────────────────────────────────────────────────

  async execReturn(node, env) {
    const value = node.value ? await this.evalExpr(node.value, env) : EMPTY;
    throw new ReturnSignal(value, node.line);
  }

  // ── IF ─────────────────────────────────────────────────────────────────────

  async execIf(node, env) {
    for (const branch of node.branches) {
      const cond = await this.evalExpr(branch.condition, env);
      if (this.isTruthy(cond, branch.condition.line)) {
        await this.execBlock(branch.body, env);
        return;
      }
    }
    if (node.elseBody) {
      await this.execBlock(node.elseBody, env);
    }
  }

  // ── WHILE ──────────────────────────────────────────────────────────────────

  async execWhile(node, env) {
    let iterations = 0;
    while (true) {
      await this.checkpoint(node.line);
      const cond = await this.evalExpr(node.condition, env);
      if (!this.isTruthy(cond, node.condition.line)) break;
      if (++iterations > this.MAX_ITERATIONS) {
        throw new QFError(
          `This WHILE loop was stopped after ${this.MAX_ITERATIONS.toLocaleString()} iterations to keep the browser responsive. Its condition may never become FALSE. Check that something inside the loop changes a value used by the condition.`,
          node.line
        );
      }
      try {
        await this.execBlock(node.body, env);
      } catch (e) {
        if (e instanceof BreakSignal)    break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  // ── FOR ────────────────────────────────────────────────────────────────────

  async execFor(node, env) {
    const from = await this.evalExpr(node.from, env);
    const to   = await this.evalExpr(node.to,   env);
    let   step = node.step ? await this.evalExpr(node.step, env) : null;

    if (typeof from !== 'number') throw new QFError(`FOR start value must be a number.`, node.line);
    if (typeof to   !== 'number') throw new QFError(`FOR end value must be a number.`, node.line);

    if (step === null) step = from <= to ? 1 : -1;
    if (typeof step !== 'number') throw new QFError(`FOR STEP value must be a number.`, node.line);
    if (step === 0) throw new QFError(`FOR STEP cannot be zero.`, node.line);

    // Auto-declare loop variable in current env (ceases to exist after END FOR)
    const varName = node.variable;
    env.declare(varName, from, false, node.line);

    let iterations = 0;
    try {
      let i = from;
      while (step > 0 ? i <= to : i >= to) {
        await this.checkpoint(node.line);
        if (++iterations > this.MAX_ITERATIONS) {
          throw new QFError(
            `This FOR loop was stopped after ${this.MAX_ITERATIONS.toLocaleString()} iterations to keep the browser responsive. Use a smaller range or a larger STEP value.`,
            node.line
          );
        }
        env.vars[varName].value = i;
        try {
          await this.execBlock(node.body, env);
        } catch (e) {
          if (e instanceof BreakSignal)    break;
          if (e instanceof ContinueSignal) { i += step; continue; }
          throw e;
        }
        i += step;
      }
    } finally {
      env.delete(varName); // loop variable ceases to exist after END FOR
    }
  }

  // ── FOR EACH ───────────────────────────────────────────────────────────────

  async execForEach(node, env) {
    const iterable = await this.evalExpr(node.iterable, env);
    if (!isQFArray(iterable) && typeof iterable !== 'string') {
      throw new QFError(`FOR EACH requires an array or string, got ${typeOf(iterable)}.`, node.line);
    }

    const varName = node.variable;
    env.declare(varName, EMPTY, false, node.line);

    try {
      for (const item of iterable) {
        await this.checkpoint(node.line);
        env.vars[varName].value = item;
        try {
          await this.execBlock(node.body, env);
        } catch (e) {
          if (e instanceof BreakSignal)    break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
    } finally {
      env.delete(varName);
    }
  }

  // ── MATCH ──────────────────────────────────────────────────────────────────

  async execMatch(node, env) {
    const subject = await this.evalExpr(node.subject, env);

    for (const when of node.whens) {
      let matched = false;

      if (when.range) {
        const lo = await this.evalExpr(when.range.from, env);
        const hi = await this.evalExpr(when.range.to,   env);
        matched = subject >= lo && subject <= hi;
      } else {
        for (const valExpr of when.values) {
          const v = await this.evalExpr(valExpr, env);
          if (this.qfEqual(subject, v)) { matched = true; break; }
        }
      }

      if (matched) {
        await this.execBlock(when.body, env);
        return;
      }
    }

    if (node.elseBody) {
      await this.execBlock(node.elseBody, env);
    }
  }

  // ── ATTEMPT / ERROR ────────────────────────────────────────────────────────

  async execAttempt(node, env) {
    try {
      await this.execBlock(node.tryBody, env);
    } catch (e) {
      if (e instanceof QFError) {
        this.setLastError(e.message, e.qfLine);
        const errEnv = new Environment(env);
        if (node.errorVar) {
          errEnv.declare(node.errorVar, e.message, false, node.line);
        }
        await this.execBlock(node.errorBody, errEnv, false);
      } else {
        throw e; // BreakSignal, ContinueSignal, ReturnSignal pass through
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Expression evaluation
  // ─────────────────────────────────────────────────────────────────────────

  async evalExpr(node, env) {
    switch (node.type) {
      case 'NumberLit':   return node.value;
      case 'StringLit':   return node.value;
      case 'BoolLit':     return node.value;
      case 'EmptyLit':    return EMPTY;

      case 'Identifier':  {
        if (node.name === 'LAST_ERROR') return this.lastError;
        return env.get(node.name, node.line);
      }

      case 'ArrayLit': {
        const elements = [];
        for (const el of node.elements) {
          elements.push(await this.evalExpr(el, env));
        }
        return elements;
      }

      case 'UnaryExpr':   return this.evalUnary(node, env);
      case 'BinaryExpr':  return this.evalBinary(node, env);
      case 'IndexExpr':   return this.evalIndex(node, env);
      case 'PropertyExpr':return this.evalProperty(node, env);
      case 'CallExpr':    return this.evalCall(node, env);

      default:
        throw new QFError(`Unknown expression type: ${node.type}`, node.line);
    }
  }

  // ── Unary ──────────────────────────────────────────────────────────────────

  async evalUnary(node, env) {
    const v = await this.evalExpr(node.operand, env);
    switch (node.op) {
      case '-':
        if (typeof v !== 'number') {
          throw new QFError(`Unary minus requires a number, got ${typeOf(v)}.`, node.line);
        }
        return -v;
      case 'NOT':
        if (typeof v !== 'boolean') {
          // Coerce: 0 → false, 1 → true per spec §3.5
          if (v === 0) return true;
          if (v === 1) return false;
          throw new QFError(
            `NOT requires a boolean value. Got ${displayValue(v)}. Use BOOL() to convert explicitly.`,
            node.line
          );
        }
        return !v;
    }
  }

  // ── Binary ─────────────────────────────────────────────────────────────────

  async evalBinary(node, env) {
    // Short-circuit logical ops
    if (node.op === 'AND') {
      const left = await this.evalExpr(node.left, env);
      const lb = this.coerceBool(left, node.left.line);
      if (!lb) return false;
      const right = await this.evalExpr(node.right, env);
      return this.coerceBool(right, node.right.line);
    }
    if (node.op === 'OR') {
      const left = await this.evalExpr(node.left, env);
      const lb = this.coerceBool(left, node.left.line);
      if (lb) return true;
      const right = await this.evalExpr(node.right, env);
      return this.coerceBool(right, node.right.line);
    }

    const left  = await this.evalExpr(node.left,  env);
    const right = await this.evalExpr(node.right, env);

    switch (node.op) {
      // ── Arithmetic ──────────────────────────────────────────────────────
      case '+': return this.evalPlus(left, right, node.line);
      case '-': return this.requireNumbers(left, right, '-', node.line) && left - right;
      case '*': return this.requireNumbers(left, right, '*', node.line) && left * right;
      case '/': {
        this.requireNumbers(left, right, '/', node.line);
        if (right === 0) throw new QFError(`Division by zero.`, node.line);
        return left / right;
      }
      case '//': {
        this.requireNumbers(left, right, '//', node.line);
        if (right === 0) throw new QFError(`Integer division by zero.`, node.line);
        return Math.trunc(left / right);
      }
      case '%': {
        this.requireNumbers(left, right, '%', node.line);
        if (right === 0) throw new QFError(`Modulo by zero.`, node.line);
        return left % right;
      }

      // ── Comparison ──────────────────────────────────────────────────────
      case '==': return this.qfEqual(left, right);
      case '!=': return !this.qfEqual(left, right);
      case '<':  return this.requireComparable(left, right, '<',  node.line) && left < right;
      case '>':  return this.requireComparable(left, right, '>',  node.line) && left > right;
      case '<=': return this.requireComparable(left, right, '<=', node.line) && left <= right;
      case '>=': return this.requireComparable(left, right, '>=', node.line) && left >= right;

      // ── Logical ─────────────────────────────────────────────────────────
      case 'XOR': {
        const lb = this.coerceBool(left,  node.left.line);
        const rb = this.coerceBool(right, node.right.line);
        return lb !== rb;
      }
    }

    throw new QFError(`Unknown operator: ${node.op}`, node.line);
  }

  // + operator: concatenation vs addition with smart coercion (spec §3.5)
  evalPlus(left, right, line) {
    const lt = typeOf(left);
    const rt = typeOf(right);

    // Number + Number → add
    if (lt === 'number' && rt === 'number') return left + right;

    // Ambiguous case: string that looks like a number + number (e.g. "3" + 4)
    // Spec §3.5: raise a friendly error asking user to be explicit.
    if (lt === 'string' && rt === 'number' && !isNaN(Number(left)) && left.trim() !== '') {
      throw new QFError(
        `Did you want "${left}${right}" (concatenation) or ${Number(left) + right} (addition)? Use STR() or NUM() to be explicit.`,
        line
      );
    }
    if (lt === 'number' && rt === 'string' && !isNaN(Number(right)) && right.trim() !== '') {
      throw new QFError(
        `Did you want "${left}${right}" (concatenation) or ${left + Number(right)} (addition)? Use STR() or NUM() to be explicit.`,
        line
      );
    }

    // String + anything → concatenate (with coercion for numbers/booleans)
    if (lt === 'string') {
      if (rt === 'number' || rt === 'boolean' || rt === 'empty') {
        return left + displayValue(right);
      }
      if (rt === 'string') return left + right;
      throw new QFError(`Cannot concatenate a string with a ${rt}.`, line);
    }
    if (rt === 'string') {
      if (lt === 'number' || lt === 'boolean' || lt === 'empty') {
        return displayValue(left) + right;
      }
      throw new QFError(`Cannot concatenate a ${lt} with a string.`, line);
    }

    throw new QFError(
      `Cannot use + between ${lt} and ${rt}. Use STR() or NUM() to convert explicitly.`,
      line
    );
  }

  requireNumbers(left, right, op, line) {
    if (typeof left  !== 'number') throw new QFError(`'${op}' requires numbers. Left side is ${typeOf(left)}.`, line);
    if (typeof right !== 'number') throw new QFError(`'${op}' requires numbers. Right side is ${typeOf(right)}.`, line);
    return true;
  }

  requireComparable(left, right, op, line) {
    const lt = typeOf(left);
    const rt = typeOf(right);
    if (lt !== rt) throw new QFError(`Cannot compare ${lt} and ${rt} with '${op}'.`, line);
    if (lt !== 'number' && lt !== 'string') {
      throw new QFError(`'${op}' only works with numbers and strings, not ${lt}.`, line);
    }
    return true;
  }

  coerceBool(v, line) {
    if (typeof v === 'boolean') return v;
    if (v === 1) return true;
    if (v === 0) return false;
    throw new QFError(
      `Expected TRUE or FALSE, got ${displayValue(v)}. Use BOOL() to convert explicitly.`,
      line
    );
  }

  isTruthy(v, line) {
    return this.coerceBool(v, line);
  }

  qfEqual(a, b) {
    if (a === EMPTY && b === EMPTY) return true;
    if (a === EMPTY || b === EMPTY) return false;
    if (isQFArray(a) || isQFArray(b)) return false; // arrays never equal by value
    return a === b;
  }

  // ── Index ──────────────────────────────────────────────────────────────────

  async evalIndex(node, env) {
    const obj   = await this.evalExpr(node.object, env);
    const index = await this.evalExpr(node.index,  env);

    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new QFError(`Index must be a whole number, got ${displayValue(index)}.`, node.line);
    }

    if (typeof obj === 'string') {
      if (index < 0 || index >= obj.length) {
        throw new QFError(
          `Index ${index} is out of range. "${obj}" has ${obj.length} character${obj.length !== 1 ? 's' : ''} (0 to ${obj.length - 1}).`,
          node.line
        );
      }
      return obj[index];
    }

    if (isQFArray(obj)) {
      this.checkArrayIndex(obj, index, node.line);
      return obj[index];
    }

    throw new QFError(`Cannot use index access on a ${typeOf(obj)}.`, node.line);
  }

  checkArrayIndex(arr, index, line) {
    if (index < 0 || index >= arr.length) {
      throw new QFError(
        `Index ${index} is out of range. Array has ${arr.length} item${arr.length !== 1 ? 's' : ''} (0 to ${arr.length - 1}).`,
        line
      );
    }
  }

  // ── Property access (LAST_ERROR.MESSAGE etc.) ─────────────────────────────

  async evalProperty(node, env) {
    const obj  = await this.evalExpr(node.object, env);
    const prop = node.property;

    // LAST_ERROR object
    if (obj === this.lastError) {
      if (prop === 'MESSAGE' || prop === 'LINE' || prop === 'CODE') {
        return obj[prop];
      }
      throw new QFError(`LAST_ERROR has no property '${prop}'.`, node.line);
    }

    throw new QFError(`Property access is only supported on LAST_ERROR.`, node.line);
  }

  // ── Function calls ─────────────────────────────────────────────────────────

  async evalCall(node, env) {
    const name = node.callee;

    // User-defined function
    if (this.functionDefs[name]) {
      return this.callUserFunction(name, node.args, env, node.line);
    }

    // Built-in
    return this.callBuiltin(name, node.args, env, node.line);
  }

  async callUserFunction(name, argNodes, callerEnv, line) {
    if (++this.callDepth > this.MAX_CALL_DEPTH) {
      this.callDepth--;
      throw new QFError(`Stack overflow — too many nested function calls. Check for infinite recursion.`, line);
    }

    const def = this.functionDefs[name];
    if (argNodes.length !== def.params.length) {
      throw new QFError(
        `${name.toLowerCase()}() expects ${def.params.length} argument${def.params.length !== 1 ? 's' : ''}, got ${argNodes.length}.`,
        line
      );
    }

    // Evaluate args in caller's env
    const argValues = [];
    for (const a of argNodes) {
      argValues.push(await this.evalExpr(a, callerEnv));
    }

    // Create local env chained to global (not caller — no closures)
    const localEnv = new Environment(this.globalEnv);
    for (let i = 0; i < def.params.length; i++) {
      localEnv.declare(def.params[i], argValues[i], false, line);
    }

    try {
      await this.execBlock(def.body, localEnv);
      this.callDepth--;
      return EMPTY; // implicit return
    } catch (e) {
      this.callDepth--;
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  }

  // ── STOP special handling ─────────────────────────────────────────────────

  // STOP() is handled as a statement; if it appears as an expression
  // (e.g. inside a WRITELN) we handle it here.
  // We throw a special StopSignal that halts the program.

  // ── Built-in functions ────────────────────────────────────────────────────

  async callBuiltin(name, argNodes, env, line) {
    // Evaluate args eagerly for most builtins
    // (INPUT is the exception — it's async and we await inside)
    const evalArgs = async (n) => {
      const vals = [];
      const count = n ?? argNodes.length;
      for (let i = 0; i < count; i++) {
        vals.push(await this.evalExpr(argNodes[i], env));
      }
      return vals;
    };

    const argc = argNodes.length;

    switch (name) {

      // ── I/O ─────────────────────────────────────────────────────────────

      case 'WRITELN': {
        const vals = await evalArgs();
        this.io.print(vals.map(displayValue).join(' '));
        return EMPTY;
      }

      case 'WRITE': {
        const vals = await evalArgs();
        this.io.write(vals.map(displayValue).join(' '));
        return EMPTY;
      }

      case 'ERASE': {
        if (argc === 0) {
          this.io.erase();
        } else {
          const [arr] = await evalArgs();
          if (!isQFArray(arr)) throw new QFError(`ERASE() with an argument expects an array.`, line);
          arr.splice(0, arr.length);
        }
        return EMPTY;
      }

      case 'INPUT': {
        if (argc !== 1) throw new QFError(`INPUT() requires exactly 1 argument (the prompt).`, line);
        const [prompt] = await evalArgs();
        if (typeof prompt !== 'string') throw new QFError(`INPUT() prompt must be a string.`, line);
        const result = await this.io.input(prompt);
        return typeof result === 'string' ? result : String(result);
      }

      case 'STOP': {
        throw new StopSignal();
      }

      // ── Sound ───────────────────────────────────────────────────────────

      case 'SOUND': {
        if (argc !== 2) throw new QFError(`SOUND() requires exactly 2 arguments: a pitch and a duration in milliseconds. Example: SOUND("C4", 300) or SOUND(440, 300).`, line);
        const [pitch, duration] = await evalArgs();

        let freq;
        if (typeof pitch === 'number') {
          if (!(pitch > 0)) throw new QFError(`SOUND() frequency must be a positive number of Hz, got ${displayValue(pitch)}.`, line);
          freq = pitch;
        } else if (typeof pitch === 'string') {
          freq = noteNameToFrequency(pitch);
          if (freq === null) throw new QFError(`"${pitch}" isn't a note SOUND() understands. Tip: use a note name like "C4" or "A#3", or a frequency in Hz like 440.`, line);
        } else {
          throw new QFError(`SOUND()'s first argument must be a number (Hz) or a note name like "C4", got ${typeOf(pitch)}.`, line);
        }

        if (typeof duration !== 'number' || !(duration > 0)) {
          throw new QFError(`SOUND()'s second argument must be a positive number of milliseconds, got ${displayValue(duration)}.`, line);
        }

        await this.io.sound(freq, duration);
        return EMPTY;
      }

      case 'BELL': {
        if (argc !== 0) throw new QFError(`BELL() takes no arguments. Did you mean SOUND(pitch, duration)?`, line);
        await this.io.sound(880, 150);
        return EMPTY;
      }

      // ── Type conversion ──────────────────────────────────────────────────

      case 'STR': {
        if (argc !== 1) throw new QFError(`STR() requires 1 argument.`, line);
        const [v] = await evalArgs();
        return displayValue(v);
      }

      case 'NUM': {
        if (argc !== 1) throw new QFError(`NUM() requires 1 argument.`, line);
        const [v] = await evalArgs();
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'string') {
          const n = Number(v);
          if (isNaN(n)) throw new QFError(`"${v}" cannot be converted to a number. Tip: Use NUM() only when you're sure the value is numeric.`, line);
          return n;
        }
        throw new QFError(`Cannot convert ${typeOf(v)} to a number.`, line);
      }

      case 'BOOL': {
        if (argc !== 1) throw new QFError(`BOOL() requires 1 argument.`, line);
        const [v] = await evalArgs();
        if (typeof v === 'boolean') return v;
        if (v === 1 || v === 'TRUE'  || v === 'true')  return true;
        if (v === 0 || v === 'FALSE' || v === 'false') return false;
        if (v === EMPTY) return false;
        throw new QFError(`Cannot convert ${displayValue(v)} to a boolean. Use TRUE, FALSE, 1, or 0.`, line);
      }

      // ── Type checking ────────────────────────────────────────────────────

      case 'ISNUMBER': { const [v] = await evalArgs(); return typeof v === 'number'; }
      case 'ISSTRING': { const [v] = await evalArgs(); return typeof v === 'string'; }
      case 'ISBOOL':   { const [v] = await evalArgs(); return typeof v === 'boolean'; }
      case 'ISEMPTY':  { const [v] = await evalArgs(); return v === EMPTY; }
      case 'ISARRAY':  { const [v] = await evalArgs(); return isQFArray(v); }

      // ── String functions ─────────────────────────────────────────────────

      case 'LENGTH': {
        if (argc !== 1) throw new QFError(`LENGTH() requires 1 argument.`, line);
        const [v] = await evalArgs();
        if (typeof v === 'string') return v.length;
        if (isQFArray(v))          return v.length;
        throw new QFError(`LENGTH() requires a string or array, got ${typeOf(v)}.`, line);
      }

      case 'UPPER': {
        const [v] = await evalArgs();
        if (typeof v !== 'string') throw new QFError(`UPPER() requires a string.`, line);
        return v.toUpperCase();
      }

      case 'LOWER': {
        const [v] = await evalArgs();
        if (typeof v !== 'string') throw new QFError(`LOWER() requires a string.`, line);
        return v.toLowerCase();
      }

      case 'TRIM': {
        const [v] = await evalArgs();
        if (typeof v !== 'string') throw new QFError(`TRIM() requires a string.`, line);
        return v.trim();
      }

      case 'CONTAINS': {
        if (argc !== 2) throw new QFError(`CONTAINS() requires 2 arguments.`, line);
        const [obj, needle] = await evalArgs();
        if (typeof obj === 'string') {
          if (typeof needle !== 'string') throw new QFError(`CONTAINS() on a string requires a string to search for.`, line);
          return obj.includes(needle);
        }
        if (isQFArray(obj)) {
          for (const item of obj) {
            if (this.qfEqual(item, needle)) return true;
          }
          return false;
        }
        throw new QFError(`CONTAINS() requires a string or array as the first argument.`, line);
      }

      case 'REPLACE': {
        if (argc !== 3) throw new QFError(`REPLACE() requires 3 arguments: string, old, new.`, line);
        const [str, old_, new_] = await evalArgs();
        if (typeof str !== 'string') throw new QFError(`REPLACE() requires a string as the first argument.`, line);
        if (typeof old_ !== 'string') throw new QFError(`REPLACE() old value must be a string.`, line);
        if (typeof new_ !== 'string') throw new QFError(`REPLACE() new value must be a string.`, line);
        return str.split(old_).join(new_);
      }

      case 'SPLIT': {
        if (argc !== 2) throw new QFError(`SPLIT() requires 2 arguments: string, delimiter.`, line);
        const [str, delim] = await evalArgs();
        if (typeof str   !== 'string') throw new QFError(`SPLIT() requires a string as the first argument.`, line);
        if (typeof delim !== 'string') throw new QFError(`SPLIT() delimiter must be a string.`, line);
        return str.split(delim);
      }

      case 'SUBSTRING': {
        if (argc !== 3) throw new QFError(`SUBSTRING() requires 3 arguments: string, start, length.`, line);
        const [str, start, len] = await evalArgs();
        if (typeof str   !== 'string') throw new QFError(`SUBSTRING() requires a string.`, line);
        if (typeof start !== 'number') throw new QFError(`SUBSTRING() start must be a number.`, line);
        if (typeof len   !== 'number') throw new QFError(`SUBSTRING() length must be a number.`, line);
        return str.substr(start, len);
      }

      case 'STARTSWITH': {
        if (argc !== 2) throw new QFError(`STARTSWITH() requires 2 arguments.`, line);
        const [str, prefix] = await evalArgs();
        if (typeof str    !== 'string') throw new QFError(`STARTSWITH() requires a string.`, line);
        if (typeof prefix !== 'string') throw new QFError(`STARTSWITH() prefix must be a string.`, line);
        return str.startsWith(prefix);
      }

      case 'ENDSWITH': {
        if (argc !== 2) throw new QFError(`ENDSWITH() requires 2 arguments.`, line);
        const [str, suffix] = await evalArgs();
        if (typeof str    !== 'string') throw new QFError(`ENDSWITH() requires a string.`, line);
        if (typeof suffix !== 'string') throw new QFError(`ENDSWITH() suffix must be a string.`, line);
        return str.endsWith(suffix);
      }

      // ── Math functions ───────────────────────────────────────────────────

      case 'ABS': {
        const [v] = await evalArgs();
        if (typeof v !== 'number') throw new QFError(`ABS() requires a number.`, line);
        return Math.abs(v);
      }

      case 'POW': {
        if (argc !== 2) throw new QFError(`POW() requires 2 arguments: base, exponent.`, line);
        const [base, exp] = await evalArgs();
        if (typeof base !== 'number') throw new QFError(`POW() base must be a number.`, line);
        if (typeof exp  !== 'number') throw new QFError(`POW() exponent must be a number.`, line);
        return Math.pow(base, exp);
      }

      case 'ROUND':   { const [v] = await evalArgs(); if (typeof v !== 'number') throw new QFError(`ROUND() requires a number.`, line);   return Math.round(v); }
      case 'FLOOR':   { const [v] = await evalArgs(); if (typeof v !== 'number') throw new QFError(`FLOOR() requires a number.`, line);   return Math.floor(v); }
      case 'CEILING': { const [v] = await evalArgs(); if (typeof v !== 'number') throw new QFError(`CEILING() requires a number.`, line); return Math.ceil(v);  }
      case 'SQRT': {
        const [v] = await evalArgs();
        if (typeof v !== 'number') throw new QFError(`SQRT() requires a number.`, line);
        if (v < 0) throw new QFError(`SQRT() cannot take the square root of a negative number.`, line);
        return Math.sqrt(v);
      }

      case 'MIN': {
        if (argc !== 2) throw new QFError(`MIN() requires 2 arguments.`, line);
        const [a, b] = await evalArgs();
        if (typeof a !== 'number' || typeof b !== 'number') throw new QFError(`MIN() requires two numbers.`, line);
        return Math.min(a, b);
      }

      case 'MAX': {
        if (argc !== 2) throw new QFError(`MAX() requires 2 arguments.`, line);
        const [a, b] = await evalArgs();
        if (typeof a !== 'number' || typeof b !== 'number') throw new QFError(`MAX() requires two numbers.`, line);
        return Math.max(a, b);
      }

      case 'RANDOM': {
        if (argc !== 0) throw new QFError(`RANDOM() takes no arguments.`, line);
        return Math.random();
      }

      case 'RANDOMINT': {
        if (argc !== 2) throw new QFError(`RANDOMINT() requires 2 arguments: min, max.`, line);
        const [min, max] = await evalArgs();
        if (typeof min !== 'number' || typeof max !== 'number') throw new QFError(`RANDOMINT() requires two numbers.`, line);
        if (!Number.isInteger(min) || !Number.isInteger(max)) throw new QFError(`RANDOMINT() requires whole number arguments.`, line);
        if (min > max) throw new QFError(`RANDOMINT() min (${min}) cannot be greater than max (${max}).`, line);
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      // ── Array functions ──────────────────────────────────────────────────

      case 'ARRAY': {
        if (argc === 0) return [];
        if (argc === 1) {
          const [size] = await evalArgs();
          if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
            throw new QFError(`ARRAY() size must be a non-negative whole number.`, line);
          }
          return new Array(size).fill(EMPTY);
        }
        throw new QFError(`ARRAY() takes 0 or 1 arguments.`, line);
      }

      case 'APPEND': {
        if (argc !== 2) throw new QFError(`APPEND() requires 2 arguments: array, value.`, line);
        const [arr, val] = await evalArgs();
        if (!isQFArray(arr)) throw new QFError(`APPEND() requires an array as the first argument.`, line);
        arr.push(val);
        return EMPTY;
      }

      case 'REMOVE': {
        if (argc !== 2) throw new QFError(`REMOVE() requires 2 arguments: array, index.`, line);
        const [arr, idx] = await evalArgs();
        if (!isQFArray(arr)) throw new QFError(`REMOVE() requires an array as the first argument.`, line);
        if (typeof idx !== 'number' || !Number.isInteger(idx)) throw new QFError(`REMOVE() index must be a whole number.`, line);
        this.checkArrayIndex(arr, idx, line);
        arr.splice(idx, 1);
        return EMPTY;
      }

      case 'INSERT': {
        if (argc !== 3) throw new QFError(`INSERT() requires 3 arguments: array, index, value.`, line);
        const [arr, idx, val] = await evalArgs();
        if (!isQFArray(arr)) throw new QFError(`INSERT() requires an array as the first argument.`, line);
        if (typeof idx !== 'number' || !Number.isInteger(idx)) throw new QFError(`INSERT() index must be a whole number.`, line);
        if (idx < 0 || idx > arr.length) throw new QFError(`INSERT() index ${idx} is out of range (0 to ${arr.length}).`, line);
        arr.splice(idx, 0, val);
        return EMPTY;
      }

      case 'REVERSE': {
        if (argc !== 1) throw new QFError(`REVERSE() requires 1 argument.`, line);
        const [arr] = await evalArgs();
        if (!isQFArray(arr)) throw new QFError(`REVERSE() requires an array.`, line);
        arr.reverse();
        return arr;
      }

      case 'SORT': {
        if (argc !== 1) throw new QFError(`SORT() requires 1 argument.`, line);
        const [arr] = await evalArgs();
        if (!isQFArray(arr)) throw new QFError(`SORT() requires an array.`, line);
        arr.sort((a, b) => {
          if (typeof a === 'number' && typeof b === 'number') return a - b;
          return displayValue(a).localeCompare(displayValue(b));
        });
        return arr;
      }

      default:
        throw new QFError(
          `'${name.toLowerCase()}' is not a built-in function. Check the spelling or make sure you've defined it before calling it.`,
          line
        );
    }
  }
}

// StopSignal — separate from ReturnSignal so it halts the entire program
class StopSignal { constructor() {} }

// ─── Exports ──────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Evaluator,
    QFError,
    BreakSignal,
    ContinueSignal,
    ReturnSignal,
    StopSignal,
    EMPTY,
    displayValue,
    typeOf,
  };
}
