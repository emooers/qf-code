/**
 * QF CODE Parser
 * Consumes a token stream from the lexer and produces an AST.
 *
 * AST Node shapes — every node has { type, line } plus type-specific fields:
 *
 * Statements:
 *   Program              { body: Statement[] }
 *   VarDecl              { name: string, value: Expr|null, isConst: bool }
 *   Assign               { target: Expr, value: Expr }          (includes index assign)
 *   PrintStmt            { args: Expr[] }
 *   EraseStmt            { arg: Expr|null }                     (null = clear display)
 *   StopStmt             {}
 *   SignalStmt           { message: Expr }
 *   ReturnStmt           { value: Expr|null }
 *   BreakStmt            {}
 *   ContinueStmt         {}
 *   IfStmt               { branches: [{condition:Expr, body:Statement[]}], elseBody:Statement[]|null }
 *   WhileStmt            { condition: Expr, body: Statement[] }
 *   ForStmt              { variable: string, from: Expr, to: Expr, step: Expr|null, body: Statement[] }
 *   ForEachStmt          { variable: string, iterable: Expr, body: Statement[] }
 *   MatchStmt            { subject: Expr, whens: WhenClause[], elseBody: Statement[]|null }
 *   WhenClause           { values: Expr[], range: {from:Expr,to:Expr}|null, body: Statement[] }
 *   FunctionDecl         { name: string, params: string[], body: Statement[] }
 *   AttemptStmt          { tryBody: Statement[], errorVar: string|null, errorBody: Statement[] }
 *   ExprStmt             { expr: Expr }                         (function call as statement)
 *
 * Expressions:
 *   NumberLit            { value: number }
 *   StringLit            { value: string }
 *   BoolLit              { value: bool }
 *   EmptyLit             {}
 *   Identifier           { name: string }
 *   BinaryExpr           { op: string, left: Expr, right: Expr }
 *   UnaryExpr            { op: string, operand: Expr }
 *   CallExpr             { callee: string, args: Expr[] }
 *   IndexExpr            { object: Expr, index: Expr }
 *   PropertyExpr         { object: Expr, property: string }     (LAST_ERROR.MESSAGE etc.)
 *   ArrayLit             { elements: Expr[] }
 */

// ─── Parser Error ─────────────────────────────────────────────────────────────

class ParseError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'ParseError';
    this.line = line;
    this.col = col ?? 0;
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  constructor(tokens) {
    // Strip EOF for easier lookahead; we'll detect end via pos
    this.tokens = tokens;
    this.pos = 0;
  }

  // ── Token navigation ────────────────────────────────────────────────────

  peek(offset = 0) {
    const i = this.pos + offset;
    return this.tokens[i] ?? { type: 'EOF', value: null, raw: '', line: 0, col: 0 };
  }

  current() {
    return this.peek(0);
  }

  advance() {
    const tok = this.tokens[this.pos];
    if (tok && tok.type !== 'EOF') this.pos++;
    return tok;
  }

  // Skip all NEWLINEs at current position
  skipNewlines() {
    while (this.current().type === 'NEWLINE') this.advance();
  }

  // Consume one or more NEWLINEs (required as statement terminator)
  // Also accepts EOF as a valid terminator.
  expectNewlineOrEOF() {
    const tok = this.current();
    if (tok.type === 'EOF') return;
    if (tok.type === 'NEWLINE') {
      while (this.current().type === 'NEWLINE') this.advance();
      return;
    }
    this.error(`Expected end of line, got '${tok.raw || tok.value}'`, tok);
  }

  isKeyword(value, offset = 0) {
    const tok = this.peek(offset);
    return tok.type === 'KEYWORD' && tok.value === value;
  }

  isOperator(value, offset = 0) {
    const tok = this.peek(offset);
    return tok.type === 'OPERATOR' && tok.value === value;
  }

  // Consume a keyword token with the given value; throw if not present
  expectKeyword(value) {
    const tok = this.current();
    if (tok.type !== 'KEYWORD' || tok.value !== value) {
      this.error(`Expected '${value}', got '${tok.raw || tok.value || tok.type}'`, tok);
    }
    return this.advance();
  }

  // Consume an operator token with the given value; throw if not present
  expectOperator(value) {
    const tok = this.current();
    if (tok.type !== 'OPERATOR' || tok.value !== value) {
      this.error(`Expected '${value}', got '${tok.raw || tok.value || tok.type}'`, tok);
    }
    return this.advance();
  }

  // Consume an IDENTIFIER token; throw if not present
  expectIdentifier() {
    const tok = this.current();
    if (tok.type !== 'IDENTIFIER') {
      this.error(`Expected a name (identifier), got '${tok.raw || tok.value || tok.type}'`, tok);
    }
    return this.advance();
  }

  error(message, tok) {
    tok = tok ?? this.current();
    throw new ParseError(message, tok.line, tok.col);
  }

  node(type, fields, tok) {
    return { type, line: (tok ?? this.current()).line, ...fields };
  }

  // ── Top level ───────────────────────────────────────────────────────────

  parse() {
    this.skipNewlines();
    const body = this.parseStatementList([]);  // no terminators — reads until EOF
    return this.node('Program', { body }, { line: 1 });
  }

  /**
   * Parse a list of statements until we hit EOF or one of the stop keywords.
   * stopKeywords: array of KEYWORD values that terminate this block (not consumed).
   */
  parseStatementList(stopKeywords) {
    const body = [];
    while (true) {
      this.skipNewlines();
      const tok = this.current();
      if (tok.type === 'EOF') break;
      if (tok.type === 'KEYWORD' && stopKeywords.includes(tok.value)) break;
      body.push(this.parseStatement());
    }
    return body;
  }

  // ── Statement dispatch ──────────────────────────────────────────────────

  parseStatement() {
    const tok = this.current();

    if (tok.type === 'KEYWORD') {
      switch (tok.value) {
        case 'VAR':       return this.parseVarDecl(false);
        case 'CONST':     return this.parseVarDecl(true);
        case 'IF':        return this.parseIf();
        case 'WHILE':     return this.parseWhile();
        case 'FOR':       return this.parseFor();
        case 'FOR EACH':  return this.parseForEach();
        case 'MATCH':     return this.parseMatch();
        case 'FUNCTION':  return this.parseFunctionDecl();
        case 'RETURN':    return this.parseReturn();
        case 'BREAK':     return this.parseBreak();
        case 'CONTINUE':  return this.parseContinue();
        case 'WRITE':     return this.parseWrite();
        case 'WRITELN':   return this.parseWrite();
        case 'ERASE':     return this.parseErase();
        case 'STOP':      return this.parseStop();
        case 'SIGNAL':    return this.parseSignal();
        case 'ATTEMPT':   return this.parseAttempt();
        default:
          // Could be a built-in function call used as a statement
          // (e.g. APPEND(arr, val), REVERSE(arr))
          if (this.isBuiltinCallable(tok.value)) return this.parseExprStmt();
          this.error(`Unexpected keyword '${tok.value}' at start of statement`, tok);
      }
    }

    if (tok.type === 'IDENTIFIER') {
      // Could be: assignment, function call, or array index assignment
      return this.parseIdentifierStatement();
    }

    this.error(`Unexpected token '${tok.raw || tok.value}' — expected a statement`, tok);
  }

  // Built-in keywords that can appear as statement-level calls
  isBuiltinCallable(kw) {
    return [
      'APPEND', 'REMOVE', 'INSERT', 'REVERSE', 'SORT', 'ERASE',
      'LENGTH', 'CONTAINS',
      // Type conversion / checking used as statements (uncommon but valid)
      'STR', 'NUM', 'BOOL',
      'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY',
      // Math / string functions used as statements (return value discarded)
      'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
      'RANDOM', 'RANDOMINT',
      'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SPLIT', 'SUBSTRING',
      'STARTSWITH', 'ENDSWITH',
      'ARRAY',
      // Sound — always used as statements (side effect, no return value used)
      'SOUND', 'BELL',
    ].includes(kw);
  }

  // ── VAR / CONST ────────────────────────────────────────────────────────

  parseVarDecl(isConst) {
    const startTok = this.advance(); // consume VAR or CONST
    const nameTok = this.expectIdentifier();
    const name = nameTok.value;

    let value = null;
    if (this.isOperator('=')) {
      this.advance(); // consume =
      value = this.parseExpression();
    } else if (isConst) {
      this.error(`CONST '${nameTok.raw}' must have a value`, nameTok);
    }

    this.expectNewlineOrEOF();
    return this.node('VarDecl', { name, value, isConst }, startTok);
  }

  // ── Assignment / function call starting with identifier ────────────────

  parseIdentifierStatement() {
    const tok = this.current();
    // Parse the LHS through postfix to handle scores[0], obj.prop, etc.
    const lhs = this.parsePostfix();

    // Check if this is an assignment
    if (this.isOperator('=')) {
      this.advance(); // consume =
      const value = this.parseExpression();
      this.expectNewlineOrEOF();
      return this.node('Assign', { target: lhs, value }, tok);
    }

    // Otherwise it must be a call expression used as a statement
    if (lhs.type !== 'CallExpr') {
      this.error(`Expected assignment or function call, got '${tok.raw}'`, tok);
    }

    this.expectNewlineOrEOF();
    return this.node('ExprStmt', { expr: lhs }, tok);
  }

  // ── IF ─────────────────────────────────────────────────────────────────

  parseIf() {
    const startTok = this.advance(); // consume IF
    const branches = [];

    // First branch
    const condition = this.parseExpression();
    this.expectKeyword('THEN');
    this.expectNewlineOrEOF();
    const body = this.parseStatementList(['ELSE IF', 'ELSE', 'END IF']);
    branches.push({ condition, body });

    // ELSE IF chains
    while (this.isKeyword('ELSE IF')) {
      this.advance(); // consume ELSE IF
      const eic = this.parseExpression();
      this.expectKeyword('THEN');
      this.expectNewlineOrEOF();
      const eib = this.parseStatementList(['ELSE IF', 'ELSE', 'END IF']);
      branches.push({ condition: eic, body: eib });
    }

    // Optional ELSE
    let elseBody = null;
    if (this.isKeyword('ELSE')) {
      this.advance(); // consume ELSE
      this.expectNewlineOrEOF();
      elseBody = this.parseStatementList(['END IF']);
    }

    this.expectKeyword('END IF');
    this.expectNewlineOrEOF();
    return this.node('IfStmt', { branches, elseBody }, startTok);
  }

  // ── WHILE ──────────────────────────────────────────────────────────────

  parseWhile() {
    const startTok = this.advance(); // consume WHILE
    const condition = this.parseExpression();
    this.expectNewlineOrEOF();
    const body = this.parseStatementList(['END WHILE']);
    this.expectKeyword('END WHILE');
    this.expectNewlineOrEOF();
    return this.node('WhileStmt', { condition, body }, startTok);
  }

  // ── FOR ────────────────────────────────────────────────────────────────

  parseFor() {
    const startTok = this.advance(); // consume FOR
    const varTok = this.expectIdentifier();
    const variable = varTok.value;
    this.expectOperator('=');
    const from = this.parseExpression();
    this.expectKeyword('TO');
    const to = this.parseExpression();
    let step = null;
    if (this.isKeyword('STEP')) {
      this.advance(); // consume STEP
      step = this.parseExpression();
    }
    this.expectNewlineOrEOF();
    const body = this.parseStatementList(['END FOR']);
    this.expectKeyword('END FOR');
    this.expectNewlineOrEOF();
    return this.node('ForStmt', { variable, from, to, step, body }, startTok);
  }

  // ── FOR EACH ───────────────────────────────────────────────────────────

  parseForEach() {
    const startTok = this.advance(); // consume FOR EACH
    const varTok = this.expectIdentifier();
    const variable = varTok.value;
    this.expectKeyword('IN');
    const iterable = this.parseExpression();
    this.expectNewlineOrEOF();
    const body = this.parseStatementList(['END FOR']);
    this.expectKeyword('END FOR');
    this.expectNewlineOrEOF();
    return this.node('ForEachStmt', { variable, iterable, body }, startTok);
  }

  // ── MATCH ──────────────────────────────────────────────────────────────

  parseMatch() {
    const startTok = this.advance(); // consume MATCH
    const subject = this.parseExpression();
    this.expectNewlineOrEOF();
    this.skipNewlines();

    const whens = [];
    let elseBody = null;

    while (!this.isKeyword('END MATCH')) {
      if (this.current().type === 'EOF') {
        this.error('Expected END MATCH', this.current());
      }

      if (this.isKeyword('WHEN ELSE')) {
        this.advance(); // consume WHEN ELSE
        this.expectNewlineOrEOF();
        elseBody = this.parseStatementList(['END MATCH']);
        break;
      }

      if (this.isKeyword('WHEN')) {
        // Collect one or more stacked WHEN clauses that share a body
        const whenValues = [];
        let whenRange = null;

        while (this.isKeyword('WHEN') && !this.isKeyword('WHEN ELSE')) {
          this.advance(); // consume WHEN
          const val = this.parseExpression();

          // Check for range: WHEN 90 TO 99
          if (this.isKeyword('TO')) {
            this.advance(); // consume TO
            const rangeTo = this.parseExpression();
            whenRange = { from: val, to: rangeTo };
            this.expectNewlineOrEOF();
            this.skipNewlines();
            break; // range WHEN can't stack
          }

          this.expectNewlineOrEOF();
          this.skipNewlines();
          whenValues.push(val);
        }

        // Parse the shared body for this group of WHENs
        const whenBody = this.parseStatementList(['WHEN', 'WHEN ELSE', 'END MATCH']);
        whens.push(this.node('WhenClause', {
          values: whenRange ? [] : whenValues,
          range: whenRange,
          body: whenBody
        }, startTok));
        continue;
      }

      this.error(`Expected WHEN, WHEN ELSE, or END MATCH`, this.current());
    }

    this.expectKeyword('END MATCH');
    this.expectNewlineOrEOF();
    return this.node('MatchStmt', { subject, whens, elseBody }, startTok);
  }

  // ── FUNCTION ───────────────────────────────────────────────────────────

  parseFunctionDecl() {
    const startTok = this.advance(); // consume FUNCTION
    const nameTok = this.expectIdentifier();
    const name = nameTok.value;
    this.expectOperator('(');
    const params = [];
    if (!this.isOperator(')')) {
      params.push(this.expectIdentifier().value);
      while (this.isOperator(',')) {
        this.advance(); // consume ,
        params.push(this.expectIdentifier().value);
      }
    }
    this.expectOperator(')');
    this.expectNewlineOrEOF();
    const body = this.parseStatementList(['END FUNCTION']);
    this.expectKeyword('END FUNCTION');
    this.expectNewlineOrEOF();
    return this.node('FunctionDecl', { name, params, body }, startTok);
  }

  // ── RETURN ─────────────────────────────────────────────────────────────

  parseReturn() {
    const startTok = this.advance(); // consume RETURN
    let value = null;
    // If there's something on this line that looks like an expression, parse it
    if (this.current().type !== 'NEWLINE' && this.current().type !== 'EOF') {
      value = this.parseExpression();
    }
    // Skip any trailing comment tokens that the lexer may have left as operators
    // (e.g. `RETURN 42  // comment` — after parsing 42, the // may tokenize as
    // integer-division operator if the lexer's heuristic didn't catch it).
    // Discard everything until we reach a NEWLINE or EOF.
    while (this.current().type !== 'NEWLINE' && this.current().type !== 'EOF') {
      this.advance();
    }
    this.expectNewlineOrEOF();
    return this.node('ReturnStmt', { value }, startTok);
  }

  // ── BREAK / CONTINUE ───────────────────────────────────────────────────

  parseBreak() {
    const tok = this.advance();
    this.expectNewlineOrEOF();
    return this.node('BreakStmt', {}, tok);
  }

  parseContinue() {
    const tok = this.advance();
    this.expectNewlineOrEOF();
    return this.node('ContinueStmt', {}, tok);
  }

  // ── WRITE / WRITELN ────────────────────────────────────────────────────

  parseWrite() {
    const startTok = this.advance(); // consume WRITE or WRITELN
    const newline = startTok.value === 'WRITELN';
    this.expectOperator('(');
    const args = [];
    if (!this.isOperator(')')) {
      args.push(this.parseExpression());
      while (this.isOperator(',')) {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expectOperator(')');
    this.expectNewlineOrEOF();
    return this.node('PrintStmt', { args, newline }, startTok);
  }

  // ── ERASE ──────────────────────────────────────────────────────────────

  parseErase() {
    const startTok = this.advance(); // consume ERASE
    this.expectOperator('(');
    let arg = null;
    if (!this.isOperator(')')) {
      arg = this.parseExpression();
    }
    this.expectOperator(')');
    this.expectNewlineOrEOF();
    return this.node('EraseStmt', { arg }, startTok);
  }

  // ── STOP ───────────────────────────────────────────────────────────────

  parseStop() {
    const startTok = this.advance(); // consume STOP
    this.expectOperator('(');
    this.expectOperator(')');
    this.expectNewlineOrEOF();
    return this.node('StopStmt', {}, startTok);
  }

  // ── SIGNAL ─────────────────────────────────────────────────────────────

  parseSignal() {
    const startTok = this.advance(); // consume SIGNAL
    this.expectOperator('(');
    const message = this.parseExpression();
    this.expectOperator(')');
    this.expectNewlineOrEOF();
    return this.node('SignalStmt', { message }, startTok);
  }

  // ── ATTEMPT ────────────────────────────────────────────────────────────

  parseAttempt() {
    const startTok = this.advance(); // consume ATTEMPT
    this.expectNewlineOrEOF();
    const tryBody = this.parseStatementList(['ERROR']);
    this.expectKeyword('ERROR');

    // Optional: ERROR message — capture variable name
    let errorVar = null;
    if (this.current().type === 'IDENTIFIER') {
      errorVar = this.advance().value;
    }
    this.expectNewlineOrEOF();
    const errorBody = this.parseStatementList(['END ATTEMPT']);
    this.expectKeyword('END ATTEMPT');
    this.expectNewlineOrEOF();
    return this.node('AttemptStmt', { tryBody, errorVar, errorBody }, startTok);
  }

  // ── Expression statement (built-in call as statement) ──────────────────

  parseExprStmt() {
    const tok = this.current();
    const expr = this.parseExpression();
    this.expectNewlineOrEOF();
    return this.node('ExprStmt', { expr }, tok);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Expression parsing — recursive descent with precedence climbing
  //
  // Precedence (low to high per spec §5.6, implemented bottom-up):
  //   OR < XOR < AND < == != < < > <= >= < + - < * / // % < unary NOT/- < postfix
  // ─────────────────────────────────────────────────────────────────────────

  parseExpression() {
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseXor();
    while (this.isKeyword('OR')) {
      const op = this.advance().value;
      const right = this.parseXor();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseXor() {
    let left = this.parseAnd();
    while (this.isKeyword('XOR')) {
      const op = this.advance().value;
      const right = this.parseAnd();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseAnd() {
    let left = this.parseEquality();
    while (this.isKeyword('AND')) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.isOperator('==') || this.isOperator('!=')) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAddSub();
    while (
      this.isOperator('<') || this.isOperator('>') ||
      this.isOperator('<=') || this.isOperator('>=')
    ) {
      const op = this.advance().value;
      const right = this.parseAddSub();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.isOperator('+') || this.isOperator('-')) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parseUnary();
    while (
      this.isOperator('*') || this.isOperator('/') ||
      this.isOperator('//') || this.isOperator('%')
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = this.node('BinaryExpr', { op, left, right });
    }
    return left;
  }

  parseUnary() {
    // Unary NOT
    if (this.isKeyword('NOT')) {
      const tok = this.advance();
      const operand = this.parseUnary();
      return this.node('UnaryExpr', { op: 'NOT', operand }, tok);
    }
    // Unary minus
    if (this.isOperator('-')) {
      const tok = this.advance();
      const operand = this.parseUnary();
      return this.node('UnaryExpr', { op: '-', operand }, tok);
    }
    return this.parsePostfix();
  }

  // Postfix: index access [expr] and property access .PROP
  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.isOperator('[')) {
        const tok = this.advance(); // consume [
        const index = this.parseExpression();
        this.expectOperator(']');
        expr = this.node('IndexExpr', { object: expr, index }, tok);
      } else if (this.isOperator('.')) {
        const tok = this.advance(); // consume .
        // Property name — could be an IDENTIFIER or a KEYWORD like MESSAGE, LINE, CODE
        const propTok = this.current();
        if (propTok.type !== 'IDENTIFIER' && propTok.type !== 'KEYWORD') {
          this.error(`Expected property name after '.'`, propTok);
        }
        const property = this.advance().value;
        expr = this.node('PropertyExpr', { object: expr, property }, tok);
      } else {
        break;
      }
    }

    return expr;
  }

  // ── Primary expressions ─────────────────────────────────────────────────

  parsePrimary() {
    const tok = this.current();

    // Number literal
    if (tok.type === 'NUMBER') {
      this.advance();
      return this.node('NumberLit', { value: tok.value }, tok);
    }

    // String literal
    if (tok.type === 'STRING') {
      this.advance();
      return this.node('StringLit', { value: tok.value }, tok);
    }

    // Boolean literals
    if (tok.type === 'KEYWORD' && tok.value === 'TRUE') {
      this.advance();
      return this.node('BoolLit', { value: true }, tok);
    }
    if (tok.type === 'KEYWORD' && tok.value === 'FALSE') {
      this.advance();
      return this.node('BoolLit', { value: false }, tok);
    }

    // EMPTY literal
    if (tok.type === 'KEYWORD' && tok.value === 'EMPTY') {
      this.advance();
      return this.node('EmptyLit', {}, tok);
    }

    // Array literal: [expr, expr, ...]
    if (this.isOperator('[')) {
      return this.parseArrayLit();
    }

    // Parenthesized expression
    if (this.isOperator('(')) {
      this.advance(); // consume (
      const expr = this.parseExpression();
      this.expectOperator(')');
      return expr;
    }

    // Keyword that acts as a function call (built-ins)
    if (tok.type === 'KEYWORD' && this.isBuiltinFunction(tok.value)) {
      return this.parseBuiltinCall();
    }

    // LAST_ERROR (keyword, but used like an object — postfix handles .prop)
    if (tok.type === 'KEYWORD' && tok.value === 'LAST_ERROR') {
      this.advance();
      return this.node('Identifier', { name: 'LAST_ERROR' }, tok);
    }

    // IDENTIFIER — variable reference or user function call
    if (tok.type === 'IDENTIFIER') {
      this.advance();
      // Function call?
      if (this.isOperator('(')) {
        return this.parseCallArgs(tok.value, tok);
      }
      return this.node('Identifier', { name: tok.value }, tok);
    }

    this.error(
      `Expected a value (number, string, variable, or expression), got '${tok.raw || tok.value || tok.type}'`,
      tok
    );
  }

  // Array literal
  parseArrayLit() {
    const startTok = this.advance(); // consume [
    const elements = [];
    if (!this.isOperator(']')) {
      elements.push(this.parseExpression());
      while (this.isOperator(',')) {
        this.advance();
        if (this.isOperator(']')) break; // trailing comma tolerance
        elements.push(this.parseExpression());
      }
    }
    this.expectOperator(']');
    return this.node('ArrayLit', { elements }, startTok);
  }

  // Call args for a known callee name
  parseCallArgs(callee, tok) {
    this.expectOperator('(');
    const args = [];
    if (!this.isOperator(')')) {
      args.push(this.parseExpression());
      while (this.isOperator(',')) {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expectOperator(')');
    return this.node('CallExpr', { callee, args }, tok);
  }

  // All built-in keywords that take () args and return values
  isBuiltinFunction(kw) {
    return [
      'WRITE', 'WRITELN', 'INPUT', 'ERASE', 'STOP', 'SIGNAL',
      'SOUND', 'BELL',
      'STR', 'NUM', 'BOOL',
      'LENGTH', 'APPEND', 'REMOVE', 'INSERT', 'CONTAINS', 'REVERSE', 'SORT',
      'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
      'RANDOM', 'RANDOMINT',
      'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SPLIT', 'SUBSTRING',
      'STARTSWITH', 'ENDSWITH',
      'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY',
      'ARRAY',
    ].includes(kw);
  }

  // Parse a built-in keyword function call as an expression
  parseBuiltinCall() {
    const tok = this.advance(); // consume keyword
    const callee = tok.value;
    return this.parseCallArgs(callee, tok);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parse, ParseError };
}
