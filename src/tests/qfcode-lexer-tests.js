/**
 * QF CODE Lexer Test Suite
 * Tests derived directly from the v1 language specification.
 * Run with: node qfcode-lexer-tests.js
 */

const { tokenize, LexerError } = require('./qfcode-lexer.js');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? '\n     ' + detail : ''}`);
    failed++;
  }
}

function tokens(source) {
  return tokenize(source);
}

// Filter out NEWLINE and EOF for cleaner token-shape assertions
function meaningful(toks) {
  return toks.filter(t => t.type !== 'NEWLINE' && t.type !== 'EOF');
}

function assertLexError(label, source) {
  try {
    tokenize(source);
    console.error(`  ✗  ${label} (expected LexerError, got no error)`);
    failed++;
  } catch (e) {
    if (e instanceof LexerError) {
      console.log(`  ✓  ${label}`);
      passed++;
    } else {
      console.error(`  ✗  ${label} (expected LexerError, got ${e.constructor.name}: ${e.message})`);
      failed++;
    }
  }
}

// ─── Section 2: Lexical Rules ────────────────────────────────────────────────

console.log('\n§2 Lexical Rules');

// 2.2 Case insensitivity — keywords
{
  const variants = ['print', 'PRINT', 'Print', 'pRiNt'];
  for (const v of variants) {
    const t = meaningful(tokens(v));
    assert(`Keyword "${v}" normalizes to KEYWORD:PRINT`,
      t.length === 1 && t[0].type === 'KEYWORD' && t[0].value === 'PRINT');
  }

  // Identifiers also case-insensitive (stored uppercase)
  const id = meaningful(tokens('myScore'));
  assert('Identifier "myScore" stored as "MYSCORE"',
    id[0].type === 'IDENTIFIER' && id[0].value === 'MYSCORE');

  const same1 = meaningful(tokens('score'));
  const same2 = meaningful(tokens('SCORE'));
  assert('"score" and "SCORE" produce the same identifier value',
    same1[0].value === same2[0].value);
}

// 2.3 Whitespace ignored between tokens
{
  const t = meaningful(tokens('VAR   x   =   10'));
  assert('Whitespace between tokens is ignored',
    t.length === 4 &&
    t[0].value === 'VAR' &&
    t[1].value === 'X' &&
    t[2].value === '=' &&
    t[3].value === 10);
}

// 2.5 Comments
{
  const t = meaningful(tokens('// This is a comment'));
  assert('Full-line comment produces no tokens', t.length === 0);

  const t2 = meaningful(tokens('PRINT("Hello")    // inline comment'));
  assert('Inline comment — only PRINT, (, "Hello", ) survive',
    t2.length === 4 &&
    t2[0].value === 'PRINT' &&
    t2[3].value === ')');
}

// 2.6 String literals
{
  const t = meaningful(tokens('"Hello, World!"'));
  assert('String literal value is content without quotes',
    t[0].type === 'STRING' && t[0].value === 'Hello, World!');

  const t2 = meaningful(tokens('"She said \\"hello\\""'));
  assert('Escaped double-quote inside string',
    t2[0].type === 'STRING' && t2[0].value === 'She said "hello"');

  const t3 = meaningful(tokens('""'));
  assert('Empty string literal', t3[0].type === 'STRING' && t3[0].value === '');

  assertLexError('Unterminated string raises LexerError', '"unterminated');
}

// 2.7 Numeric literals
{
  const t1 = meaningful(tokens('42'));
  assert('Integer literal 42', t1[0].type === 'NUMBER' && t1[0].value === 42);

  const t2 = meaningful(tokens('3.14'));
  assert('Decimal literal 3.14', t2[0].type === 'NUMBER' && t2[0].value === 3.14);

  // Unary minus is handled at the parser level — lexer emits separate tokens
  const t3 = meaningful(tokens('-7'));
  assert('Negative number: "-" then 7 (unary minus is parser concern)',
    t3[0].type === 'OPERATOR' && t3[0].value === '-' &&
    t3[1].type === 'NUMBER' && t3[1].value === 7);
}

// 2.8 Identifiers
{
  const valid = ['score', 'player_name', 'x', 'total2', '_private', 'x1y2z3'];
  for (const id of valid) {
    const t = meaningful(tokens(id));
    assert(`Identifier "${id}" recognized`, t[0].type === 'IDENTIFIER');
  }
}

// 2.9 Operators
{
  const ops = [
    ['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['%', '%'],
    ['=', '='], ['==', '=='], ['!=', '!='],
    ['<', '<'], ['>', '>'], ['<=', '<='], ['>=', '>='],
    ['(', '('], [')', ')'], ['[', '['], [']', ']'], [',', ','],
  ];
  for (const [src, expected] of ops) {
    const t = meaningful(tokens(src));
    assert(`Operator "${src}" tokenized correctly`,
      t[0].type === 'OPERATOR' && t[0].value === expected,
      `got type=${t[0]?.type} value=${t[0]?.value}`);
  }

  // // as integer-division operator requires numeric context (not a comment)
  {
    const t = meaningful(tokens('7//2'));
    assert('7//2 (no spaces) — // is integer division operator',
      t.length === 3 && t[1].type === 'OPERATOR' && t[1].value === '//');
  }
}

// ─── Section 3: Data Types / Literals ────────────────────────────────────────

console.log('\n§3 Data Types');

{
  const t = meaningful(tokens('TRUE'));
  assert('TRUE is a KEYWORD', t[0].type === 'KEYWORD' && t[0].value === 'TRUE');

  const t2 = meaningful(tokens('FALSE'));
  assert('FALSE is a KEYWORD', t2[0].type === 'KEYWORD' && t2[0].value === 'FALSE');

  const t3 = meaningful(tokens('EMPTY'));
  assert('EMPTY is a KEYWORD', t3[0].type === 'KEYWORD' && t3[0].value === 'EMPTY');

  const t4 = meaningful(tokens('true'));
  assert('"true" (lowercase) normalizes to KEYWORD:TRUE',
    t4[0].type === 'KEYWORD' && t4[0].value === 'TRUE');
}

// ─── Section 4: Variables ─────────────────────────────────────────────────────

console.log('\n§4 Variables');

{
  // VAR score = 0
  const t = meaningful(tokens('VAR score = 0'));
  assert('VAR declaration tokenizes correctly',
    t[0].value === 'VAR' &&
    t[1].type === 'IDENTIFIER' && t[1].value === 'SCORE' &&
    t[2].value === '=' &&
    t[3].value === 0);

  // CONST MAX_SCORE = 1000
  const t2 = meaningful(tokens('CONST MAX_SCORE = 1000'));
  assert('CONST declaration tokenizes correctly',
    t2[0].value === 'CONST' &&
    t2[1].type === 'IDENTIFIER' && t2[1].value === 'MAX_SCORE' &&
    t2[2].value === '=' &&
    t2[3].value === 1000);
}

// ─── Section 5: Operators (precedence characters) ────────────────────────────

console.log('\n§5 Operators');

{
  const t = meaningful(tokens('AND'));
  assert('AND is a KEYWORD', t[0].type === 'KEYWORD' && t[0].value === 'AND');

  const t2 = meaningful(tokens('OR'));
  assert('OR is a KEYWORD', t2[0].type === 'KEYWORD' && t2[0].value === 'OR');

  const t3 = meaningful(tokens('NOT'));
  assert('NOT is a KEYWORD', t3[0].type === 'KEYWORD' && t3[0].value === 'NOT');

  const t4 = meaningful(tokens('XOR'));
  assert('XOR is a KEYWORD', t4[0].type === 'KEYWORD' && t4[0].value === 'XOR');

  // Integer division vs comment
  const t5 = meaningful(tokens('7 // 2'));
  assert('7 // 2 — operator // between numbers (not comment)',
    t5.length === 3 &&
    t5[0].value === 7 &&
    t5[1].value === '//' &&
    t5[2].value === 2);
}

// ─── Section 6–9: Statements ─────────────────────────────────────────────────

console.log('\n§6-9 Statements & I/O');

{
  // PRINT("Hello, World!")
  const t = meaningful(tokens('PRINT("Hello, World!")'));
  assert('PRINT("Hello, World!") tokenizes',
    t[0].value === 'PRINT' &&
    t[1].value === '(' &&
    t[2].type === 'STRING' && t[2].value === 'Hello, World!' &&
    t[3].value === ')');

  // PRINT("Score:", score)
  const t2 = meaningful(tokens('PRINT("Score:", score)'));
  assert('PRINT with multiple args tokenizes',
    t2[0].value === 'PRINT' &&
    t2[2].value === 'Score:' &&
    t2[3].value === ',' &&
    t2[4].type === 'IDENTIFIER');

  // INPUT("What is your name? ")
  const t3 = meaningful(tokens('INPUT("What is your name? ")'));
  assert('INPUT() tokenizes', t3[0].value === 'INPUT');
}

// ─── Section 7: Control Flow ─────────────────────────────────────────────────

console.log('\n§7 Control Flow');

{
  // IF score > 100 THEN
  const t = meaningful(tokens('IF score > 100 THEN'));
  assert('IF ... THEN statement tokenizes',
    t[0].value === 'IF' &&
    t[1].type === 'IDENTIFIER' &&
    t[2].value === '>' &&
    t[3].value === 100 &&
    t[4].value === 'THEN');

  // END IF
  const t2 = meaningful(tokens('END IF'));
  assert('END IF is a single KEYWORD token',
    t2.length === 1 && t2[0].type === 'KEYWORD' && t2[0].value === 'END IF');

  // END WHILE
  const t3 = meaningful(tokens('END WHILE'));
  assert('END WHILE is a single KEYWORD token',
    t3.length === 1 && t3[0].value === 'END WHILE');

  // END FOR
  const t4 = meaningful(tokens('END FOR'));
  assert('END FOR is a single KEYWORD token',
    t4.length === 1 && t4[0].value === 'END FOR');

  // ELSE IF
  const t5 = meaningful(tokens('ELSE IF score >= 80 THEN'));
  assert('ELSE IF is a single KEYWORD token',
    t5[0].type === 'KEYWORD' && t5[0].value === 'ELSE IF');

  // FOR i = 1 TO 10
  const t6 = meaningful(tokens('FOR i = 1 TO 10'));
  assert('FOR loop header tokenizes',
    t6[0].value === 'FOR' &&
    t6[1].value === 'I' &&
    t6[2].value === '=' &&
    t6[3].value === 1 &&
    t6[4].value === 'TO' &&
    t6[5].value === 10);

  // FOR i = 0 TO 100 STEP 10
  const t7 = meaningful(tokens('FOR i = 0 TO 100 STEP 10'));
  assert('FOR loop with STEP tokenizes',
    t7[4].value === 'TO' && t7[6].value === 'STEP' && t7[7].value === 10);

  // FOR EACH name IN names
  const t8 = meaningful(tokens('FOR EACH name IN names'));
  assert('FOR EACH is a single KEYWORD token',
    t8[0].type === 'KEYWORD' && t8[0].value === 'FOR EACH');
  assert('FOR EACH ... IN ... tokenizes correctly',
    t8[1].type === 'IDENTIFIER' && t8[1].value === 'NAME' &&
    t8[2].value === 'IN' &&
    t8[3].type === 'IDENTIFIER' && t8[3].value === 'NAMES');

  // MATCH / WHEN ELSE / END MATCH
  const t9 = meaningful(tokens('WHEN ELSE'));
  assert('WHEN ELSE is a single KEYWORD token',
    t9.length === 1 && t9[0].value === 'WHEN ELSE');

  const t10 = meaningful(tokens('END MATCH'));
  assert('END MATCH is a single KEYWORD token',
    t10.length === 1 && t10[0].value === 'END MATCH');

  // BREAK / CONTINUE
  const t11 = meaningful(tokens('BREAK'));
  assert('BREAK tokenizes', t11[0].value === 'BREAK');

  const t12 = meaningful(tokens('CONTINUE'));
  assert('CONTINUE tokenizes', t12[0].value === 'CONTINUE');
}

// ─── Section 8: Functions ────────────────────────────────────────────────────

console.log('\n§8 Functions');

{
  // FUNCTION Greet(name)
  const t = meaningful(tokens('FUNCTION Greet(name)'));
  assert('FUNCTION definition header tokenizes',
    t[0].value === 'FUNCTION' &&
    t[1].type === 'IDENTIFIER' && t[1].value === 'GREET' &&
    t[2].value === '(' &&
    t[3].type === 'IDENTIFIER' && t[3].value === 'NAME' &&
    t[4].value === ')');

  // END FUNCTION
  const t2 = meaningful(tokens('END FUNCTION'));
  assert('END FUNCTION is a single KEYWORD token',
    t2.length === 1 && t2[0].value === 'END FUNCTION');

  // RETURN a + b
  const t3 = meaningful(tokens('RETURN a + b'));
  assert('RETURN statement tokenizes',
    t3[0].value === 'RETURN' &&
    t3[1].type === 'IDENTIFIER' &&
    t3[2].value === '+' &&
    t3[3].type === 'IDENTIFIER');
}

// ─── Section 10: Error Handling ──────────────────────────────────────────────

console.log('\n§10 Error Handling');

{
  // ATTEMPT / ERROR / END ATTEMPT
  const t = meaningful(tokens('ATTEMPT'));
  assert('ATTEMPT tokenizes', t[0].value === 'ATTEMPT');

  const t2 = meaningful(tokens('ERROR'));
  assert('ERROR tokenizes', t2[0].value === 'ERROR');

  const t3 = meaningful(tokens('END ATTEMPT'));
  assert('END ATTEMPT is a single KEYWORD token',
    t3.length === 1 && t3[0].value === 'END ATTEMPT');

  const t4 = meaningful(tokens('SIGNAL("Cannot divide by zero.")'));
  assert('SIGNAL() call tokenizes',
    t4[0].value === 'SIGNAL' &&
    t4[2].type === 'STRING');

  // LAST_ERROR.MESSAGE
  const t5 = meaningful(tokens('LAST_ERROR.MESSAGE'));
  assert('LAST_ERROR.MESSAGE tokenizes as KEYWORD . IDENTIFIER',
    t5[0].value === 'LAST_ERROR' &&
    t5[1].value === '.' &&
    t5[2].type === 'IDENTIFIER' && t5[2].value === 'MESSAGE');
}

// ─── Section 11: Arrays ──────────────────────────────────────────────────────

console.log('\n§11 Arrays');

{
  // VAR scores = ARRAY()
  const t = meaningful(tokens('VAR scores = ARRAY()'));
  assert('ARRAY() call tokenizes',
    t[0].value === 'VAR' &&
    t[3].value === 'ARRAY' &&
    t[4].value === '(' &&
    t[5].value === ')');

  // VAR scores = [10, 20, 30]
  const t2 = meaningful(tokens('VAR scores = [10, 20, 30]'));
  assert('Array literal tokenizes',
    t2[3].value === '[' &&
    t2[4].value === 10 &&
    t2[5].value === ',' &&
    t2[6].value === 20 &&
    t2[7].value === ',' &&
    t2[8].value === 30 &&
    t2[9].value === ']');

  // scores[0]
  const t3 = meaningful(tokens('scores[0]'));
  assert('Array index access tokenizes',
    t3[0].type === 'IDENTIFIER' &&
    t3[1].value === '[' &&
    t3[2].value === 0 &&
    t3[3].value === ']');
}

// ─── Multi-line program ───────────────────────────────────────────────────────

console.log('\n§ Multi-line program');

{
  const src = `// QF CODE v1
VAR score = 0
VAR player = ""
PRINT("Hello,", player)
score = score + 10`;

  const toks = tokenize(src);

  // Comment line should produce no tokens except NEWLINE
  // VAR score = 0 → VAR IDENTIFIER = NUMBER NEWLINE
  const firstMeaningful = toks.find(t => t.type !== 'NEWLINE' && t.type !== 'EOF');
  assert('Comment-only first line produces no meaningful tokens',
    firstMeaningful && firstMeaningful.value === 'VAR');

  // Line numbers are tracked
  const varScore = toks.find(t => t.type === 'KEYWORD' && t.value === 'VAR');
  assert('VAR on line 2 has correct line number', varScore && varScore.line === 2);

  const printTok = toks.find(t => t.value === 'PRINT');
  assert('PRINT on line 4 has correct line number', printTok && printTok.line === 4);
}

// ─── Edge cases ───────────────────────────────────────────────────────────────

console.log('\n§ Edge Cases');

{
  // Empty source
  const t = tokenize('');
  assert('Empty source produces only EOF',
    t.length === 1 && t[0].type === 'EOF');

  // Blank lines collapse to single NEWLINE
  const t2 = tokenize('VAR x = 1\n\n\nVAR y = 2');
  const newlines = t2.filter(t => t.type === 'NEWLINE');
  assert('Blank lines collapse — only 1 NEWLINE between statements',
    newlines.length === 2); // one between statements, one at end

  // Tabs as whitespace
  const t3 = meaningful(tokens('VAR\tx\t=\t42'));
  assert('Tabs treated as whitespace',
    t3[0].value === 'VAR' && t3[1].value === 'X' && t3[3].value === 42);

  // Unknown character raises LexerError
  assertLexError('Unknown character @ raises LexerError', 'VAR x = @');
  assertLexError('Unknown character # raises LexerError', '#comment');

  // raw field preserved
  const t4 = meaningful(tokens('Print'));
  assert('raw field preserves original casing for keywords',
    t4[0].type === 'KEYWORD' && t4[0].value === 'PRINT' && t4[0].raw === 'Print');

  // Integer division not confused with comment
  const t5 = meaningful(tokens('result = a // b'));
  assert('a // b (integer division) not parsed as comment',
    t5[3].value === '//' && t5[3].type === 'OPERATOR');

  // Dot operator for property access
  const t6 = meaningful(tokens('LAST_ERROR.LINE'));
  assert('Property access dot is tokenized as OPERATOR',
    t6[1].type === 'OPERATOR' && t6[1].value === '.');

  // Multi-word keyword case insensitivity
  const t7 = meaningful(tokens('end if'));
  assert('end if (lowercase) is KEYWORD:END IF',
    t7.length === 1 && t7[0].value === 'END IF');

  const t8 = meaningful(tokens('End Function'));
  assert('End Function (mixed case) is KEYWORD:END FUNCTION',
    t8.length === 1 && t8[0].value === 'END FUNCTION');

  const t9 = meaningful(tokens('for each'));
  assert('for each (lowercase) is KEYWORD:FOR EACH',
    t9.length === 1 && t9[0].value === 'FOR EACH');
}

// ─── Standard library built-ins spot check ───────────────────────────────────

console.log('\n§12 Standard Library built-ins');

{
  const builtins = [
    'LENGTH', 'APPEND', 'REMOVE', 'INSERT', 'CONTAINS', 'REVERSE', 'SORT',
    'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
    'RANDOM', 'RANDOMINT', 'UPPER', 'LOWER', 'TRIM', 'REPLACE',
    'SPLIT', 'SUBSTRING', 'STARTSWITH', 'ENDSWITH',
    'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY',
    'STR', 'NUM', 'BOOL', 'ERASE', 'STOP',
  ];

  for (const kw of builtins) {
    const t = meaningful(tokens(kw));
    assert(`${kw} recognized as KEYWORD`, t[0].type === 'KEYWORD' && t[0].value === kw);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests pass. Lexer is ready for parser integration.\n');
} else {
  console.log(`${failed} test(s) failed. Review output above.\n`);
  process.exit(1);
}
