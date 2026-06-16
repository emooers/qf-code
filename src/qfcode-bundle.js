/**
 * QF CODE Lexer
 * Tokenizes QF CODE source into a flat array of typed tokens.
 * 
 * Token shape: { type: string, value: any, raw: string, line: number, col: number }
 *
 * Token types:
 *   KEYWORD       — reserved keyword (normalized to UPPERCASE)
 *   IDENTIFIER    — variable/function name (normalized to UPPERCASE internally)
 *   NUMBER        — numeric literal (value is JS number)
 *   STRING        — string literal (value is the string content, without quotes)
 *   OPERATOR      — single or multi-char operator
 *   NEWLINE       — logical line separator (one per logical line end)
 *   EOF           — end of input
 */

// ─── Keyword Sets ─────────────────────────────────────────────────────────────

// Multi-word keywords that must be recognized as single tokens.
// Order matters — longer matches must come first.
const MULTI_WORD_KEYWORDS = [
  'FOR EACH',
  'END FUNCTION',
  'END WHILE',
  'END IF',
  'END FOR',
  'END MATCH',
  'END ATTEMPT',
  'ELSE IF',
  'WHEN ELSE',
];

// Single-word keywords (all uppercase for comparison)
const SINGLE_KEYWORDS = new Set([
  'VAR', 'CONST',
  'IF', 'THEN', 'ELSE', 'END',
  'WHILE',
  'FOR', 'TO', 'STEP', 'NEXT', 'IN',
  'MATCH', 'WHEN',
  'BREAK', 'CONTINUE',
  'FUNCTION', 'RETURN',
  'ATTEMPT', 'ERROR', 'SIGNAL',
  'TRUE', 'FALSE', 'EMPTY',
  'AND', 'OR', 'NOT', 'XOR',
  'PRINT', 'INPUT', 'ERASE', 'STOP',
  'STR', 'NUM', 'BOOL',
  'LENGTH', 'APPEND', 'REMOVE', 'INSERT', 'CONTAINS', 'REVERSE', 'SORT',
  'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
  'RANDOM', 'RANDOMINT',
  'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SPLIT', 'SUBSTRING',
  'STARTSWITH', 'ENDSWITH',
  'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY',
  'ARRAY',
  'LAST_ERROR',
  // Reserved for future use
  'CLASS', 'OBJECT', 'EXTENDS', 'NEW', 'THIS',
  'IMPORT', 'EXPORT', 'MODULE',
  'ASYNC', 'AWAIT',
  'LIST', 'MAP', 'SET',
]);

// Operators — longest first to ensure greedy matching
const OPERATORS = [
  '//', '<=', '>=', '==', '!=',
  '+', '-', '*', '/', '%',
  '=', '<', '>',
  '(', ')', '[', ']', ',', '.',
];

// ─── Lexer ─────────────────────────────────────────────────────────────────────

class LexerError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'LexerError';
    this.line = line;
    this.col = col;
  }
}

/**
 * Tokenizes a QF CODE source string.
 * @param {string} source
 * @returns {Array<{type: string, value: any, raw: string, line: number, col: number}>}
 * @throws {LexerError}
 */
function tokenize(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  function col() {
    return pos - lineStart + 1;
  }

  function peek(offset = 0) {
    return source[pos + offset];
  }

  function current() {
    return source[pos];
  }

  function advance() {
    const ch = source[pos++];
    if (ch === '\n') {
      line++;
      lineStart = pos;
    }
    return ch;
  }

  function remaining() {
    return source.slice(pos);
  }

  // ── Skip spaces/tabs (not newlines — those are significant) ──────────────
  function skipWhitespace() {
    while (pos < source.length && (current() === ' ' || current() === '\t')) {
      advance();
    }
  }

  // ── Comment: // to end of line ───────────────────────────────────────────
  function skipLineComment() {
    while (pos < source.length && current() !== '\n') {
      advance();
    }
  }

  // ── String literal ───────────────────────────────────────────────────────
  function readString() {
    const startLine = line;
    const startCol = col();
    advance(); // consume opening "
    let value = '';
    let raw = '"';

    while (pos < source.length) {
      const ch = current();
      if (ch === '\\' && peek(1) === '"') {
        value += '"';
        raw += '\\"';
        advance(); advance();
      } else if (ch === '"') {
        raw += '"';
        advance(); // consume closing "
        return { type: 'STRING', value, raw, line: startLine, col: startCol };
      } else if (ch === '\n') {
        throw new LexerError(
          `Unterminated string literal starting at line ${startLine}, col ${startCol}.`,
          startLine, startCol
        );
      } else {
        value += ch;
        raw += ch;
        advance();
      }
    }

    throw new LexerError(
      `Unterminated string literal starting at line ${startLine}, col ${startCol}.`,
      startLine, startCol
    );
  }

  // ── Numeric literal ──────────────────────────────────────────────────────
  function readNumber() {
    const startLine = line;
    const startCol = col();
    let raw = '';
    let hasDot = false;

    while (pos < source.length) {
      const ch = current();
      if (ch >= '0' && ch <= '9') {
        raw += ch;
        advance();
      } else if (ch === '.' && !hasDot && peek(1) >= '0' && peek(1) <= '9') {
        hasDot = true;
        raw += ch;
        advance();
      } else {
        break;
      }
    }

    return { type: 'NUMBER', value: parseFloat(raw), raw, line: startLine, col: startCol };
  }

  // ── Identifier or keyword ────────────────────────────────────────────────
  // Returns the identifier text (normalized to uppercase for comparison).
  // After reading one word, checks if the next word(s) form a multi-word keyword.
  function readWord() {
    const startLine = line;
    const startCol = col();
    let raw = '';

    while (pos < source.length) {
      const ch = current();
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') || ch === '_') {
        raw += ch;
        advance();
      } else {
        break;
      }
    }

    const upper = raw.toUpperCase();

    // Check for multi-word keyword match.
    // We look ahead past whitespace for the next word and try all combinations.
    for (const mw of MULTI_WORD_KEYWORDS) {
      if (!mw.startsWith(upper + ' ')) continue;
      const suffix = mw.slice(upper.length + 1); // e.g. "EACH", "IF", "WHILE"
      
      // Save position in case we don't match
      const savedPos = pos;
      const savedLine = line;
      const savedLineStart = lineStart;

      // Skip spaces/tabs (not newlines)
      let spaceSkipped = 0;
      while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t')) {
        pos++;
        spaceSkipped++;
      }

      // Read next word
      let nextWord = '';
      while (pos < source.length) {
        const ch = source[pos];
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9') || ch === '_') {
          nextWord += ch;
          pos++;
        } else {
          break;
        }
      }

      if (nextWord.toUpperCase() === suffix) {
        // Matched! But check for 3-word keywords (END IF, END FOR, etc.)
        // All our multi-word keywords are exactly 2 words, so we're done.
        const fullRaw = raw + ' ' + nextWord;
        return { type: 'KEYWORD', value: mw, raw: fullRaw, line: startLine, col: startCol };
      }

      // No match — restore position
      pos = savedPos;
      line = savedLine;
      lineStart = savedLineStart;
    }

    // Single word — keyword or identifier
    if (SINGLE_KEYWORDS.has(upper)) {
      return { type: 'KEYWORD', value: upper, raw, line: startLine, col: startCol };
    }

    // Identifier — store normalized (uppercase) value per spec (case-insensitive names)
    return { type: 'IDENTIFIER', value: upper, raw, line: startLine, col: startCol };
  }

  // ── Operator ─────────────────────────────────────────────────────────────
  function readOperator() {
    const startLine = line;
    const startCol = col();

    for (const op of OPERATORS) {
      if (source.startsWith(op, pos)) {
        pos += op.length;
        // Adjust line tracking for multi-char ops (they're all single-line)
        return { type: 'OPERATOR', value: op, raw: op, line: startLine, col: startCol };
      }
    }

    const ch = advance();
    throw new LexerError(
      `Unexpected character '${ch}' at line ${startLine}, col ${startCol}.`,
      startLine, startCol
    );
  }

  // ─── Main loop ────────────────────────────────────────────────────────────
  // Track whether we've emitted a meaningful (non-NEWLINE) token on the current
  // logical line. Used to disambiguate // (comment vs. integer division).
  let meaningfulOnLine = false;

  while (pos < source.length) {
    skipWhitespace();

    if (pos >= source.length) break;

    const ch = current();
    const startLine = line;
    const startCol = col();

    // Comment vs integer-division disambiguation:
    // Rule: "//" is a COMMENT if and only if it appears where a new statement token
    // could start — i.e., no meaningful expression token has been seen yet on this line.
    // "//" after a meaningful token on the same line is always INTEGER DIVISION.
    //
    // This maps cleanly to user expectations:
    //   // comment at line start       → comment
    //   PRINT("x") // inline comment   → comment (PRINT closes expression; // starts comment)
    //   7 // 2                         → integer division (7 is a meaningful token)
    //   a // b                         → integer division (a is a meaningful token)
    //
    // Inline comment after a closing ) or ] or identifier: the ) / ] closes the
    // expression and the // is then at a "comment-start" position — but meaningfulOnLine
    // is true. We resolve by also checking if the char immediately after // is a space
    // AND looking at whether the prior token was a "closing" token (IDENTIFIER, NUMBER,
    // STRING, or closing bracket). If meaningful AND immediately after // is a space,
    // we need to distinguish division from comment.
    //
    // FINAL RULE: // is a COMMENT when:
    //   (a) !meaningfulOnLine (line start comment), OR
    //   (b) meaningfulOnLine AND the // is followed by end-of-line / EOF /
    //       or the text that follows cannot be a valid numeric/identifier operand
    //       (we check: after stripping spaces, is there a number or identifier? if yes,
    //        it MIGHT be division — but if the prior closing token was ) ] STRING,
    //        then it's more likely a comment. We use a simple heuristic: if the last
    //        meaningful token was ) or ] or a STRING, treat // as a comment).
    //
    // This handles the common cases correctly. Edge case (x) // y — ambiguous in the
    // spec; we emit it as a comment, which is more beginner-friendly.
    if (ch === '/' && peek(1) === '/') {
      const lastTok = tokens[tokens.length - 1];
      const lastIsClosingOrValue = lastTok && (
        lastTok.type === 'STRING' ||
        (lastTok.type === 'OPERATOR' && (lastTok.value === ')' || lastTok.value === ']'))
      );
      const isComment = !meaningfulOnLine || lastIsClosingOrValue;
      if (isComment) {
        advance(); advance();
        skipLineComment();
        continue;
      }
      // Fall through to readOperator() — // is integer division
    }

    // Newline
    if (ch === '\n') {
      // Emit NEWLINE only if the last non-whitespace token wasn't already a NEWLINE
      // (collapse blank lines)
      const last = tokens[tokens.length - 1];
      if (last && last.type !== 'NEWLINE') {
        tokens.push({ type: 'NEWLINE', value: '\n', raw: '\n', line: startLine, col: startCol });
      }
      meaningfulOnLine = false;
      advance();
      continue;
    }

    // String
    if (ch === '"') {
      const tok = readString();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Number (digit start)
    if (ch >= '0' && ch <= '9') {
      const tok = readNumber();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Word (identifier or keyword)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const tok = readWord();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Operator / punctuation
    const tok = readOperator();
    tokens.push(tok);
    meaningfulOnLine = true;
  }

  // Final newline if last token wasn't one
  const last = tokens[tokens.length - 1];
  if (last && last.type !== 'NEWLINE') {
    tokens.push({ type: 'NEWLINE', value: '\n', raw: '\n', line, col: col() });
  }

  tokens.push({ type: 'EOF', value: null, raw: '', line, col: col() });
  return tokens;
}

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
        case 'PRINT':     return this.parsePrint();
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

  // ── PRINT ──────────────────────────────────────────────────────────────

  parsePrint() {
    const startTok = this.advance(); // consume PRINT
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
    return this.node('PrintStmt', { args }, startTok);
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
      'PRINT', 'INPUT', 'ERASE', 'STOP', 'SIGNAL',
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

// ─── Evaluator ────────────────────────────────────────────────────────────────

class Evaluator {
  /**
   * @param {{ print: (s:string)=>void, erase: ()=>void, input: (prompt:string)=>Promise<string> }} io
   */
  constructor(io) {
    this.io = io;
    this.globalEnv = new Environment();
    this.functionDefs = Object.create(null); // name → FunctionDecl node
    this.callDepth = 0;
    this.MAX_CALL_DEPTH = 500;
    this.MAX_ITERATIONS = 1_000_000;

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

  // ── PRINT ──────────────────────────────────────────────────────────────────

  async execPrint(node, env) {
    const parts = [];
    for (const arg of node.args) {
      const v = await this.evalExpr(arg, env);
      parts.push(displayValue(v));
    }
    this.io.print(parts.join(' '));
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
      if (++iterations > this.MAX_ITERATIONS) {
        throw new QFError(`Infinite loop detected — WHILE ran more than ${this.MAX_ITERATIONS.toLocaleString()} times.`, node.line);
      }
      const cond = await this.evalExpr(node.condition, env);
      if (!this.isTruthy(cond, node.condition.line)) break;
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
        if (++iterations > this.MAX_ITERATIONS) {
          throw new QFError(`FOR loop ran more than ${this.MAX_ITERATIONS.toLocaleString()} times.`, node.line);
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
  // (e.g. inside a PRINT) we handle it here.
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

      case 'PRINT': {
        const vals = await evalArgs();
        this.io.print(vals.map(displayValue).join(' '));
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