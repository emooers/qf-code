/**
 * QF CODE Parser Test Suite
 * Tests derived from the v1 language specification.
 * Run with: node qfcode-parser-tests.js
 */

const { tokenize } = require('../qfcode-lexer.js');
const { parse, ParseError } = require('../qfcode-parser.js');

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

function assertParseError(label, source) {
  try {
    parse(tokenize(source));
    console.error(`  ✗  ${label} (expected ParseError, got no error)`);
    failed++;
  } catch (e) {
    if (e instanceof ParseError) {
      console.log(`  ✓  ${label}`);
      passed++;
    } else {
      console.error(`  ✗  ${label} (expected ParseError, got ${e.constructor.name}: ${e.message})`);
      failed++;
    }
  }
}

function ast(source) {
  return parse(tokenize(source));
}

function body(source) {
  return ast(source).body;
}

function stmt(source) {
  return body(source)[0];
}

function expr(source) {
  // Wrap in a WRITELN() to get an expression parse
  const s = stmt(`WRITELN(${source})`);
  return s.args[0];
}

// ─── §4 Variables ─────────────────────────────────────────────────────────────

console.log('\n§4 VAR / CONST');

{
  const s = stmt('VAR score = 0');
  assert('VAR decl type', s.type === 'VarDecl');
  assert('VAR name', s.name === 'SCORE');
  assert('VAR not const', s.isConst === false);
  assert('VAR value is NumberLit 0', s.value?.type === 'NumberLit' && s.value.value === 0);

  const s2 = stmt('VAR name = "Alice"');
  assert('VAR string value', s2.value?.type === 'StringLit' && s2.value.value === 'Alice');

  const s3 = stmt('VAR done = FALSE');
  assert('VAR boolean FALSE', s3.value?.type === 'BoolLit' && s3.value.value === false);

  const s4 = stmt('VAR x');
  assert('VAR with no initializer — value is null', s4.value === null);

  const s5 = stmt('CONST MAX_SCORE = 1000');
  assert('CONST type', s5.type === 'VarDecl');
  assert('CONST isConst', s5.isConst === true);
  assert('CONST value', s5.value?.value === 1000);

  assertParseError('CONST without value raises ParseError', 'CONST X');
}

// ─── §5 Expressions ───────────────────────────────────────────────────────────

console.log('\n§5 Expressions');

{
  // Arithmetic
  const e1 = expr('x + 3');
  assert('Binary + node', e1.type === 'BinaryExpr' && e1.op === '+');

  const e2 = expr('7 // 2');
  assert('Integer division //', e2.type === 'BinaryExpr' && e2.op === '//');

  const e3 = expr('7 % 2');
  assert('Modulo %', e3.type === 'BinaryExpr' && e3.op === '%');

  // Comparison
  const e4 = expr('score > 100');
  assert('Comparison >', e4.type === 'BinaryExpr' && e4.op === '>');

  const e5 = expr('x == y');
  assert('Equality ==', e5.type === 'BinaryExpr' && e5.op === '==');

  const e6 = expr('x != y');
  assert('Inequality !=', e6.type === 'BinaryExpr' && e6.op === '!=');

  // Logical
  const e7 = expr('x > 0 AND x < 10');
  assert('AND binary', e7.type === 'BinaryExpr' && e7.op === 'AND');

  const e8 = expr('NOT done');
  assert('NOT unary', e8.type === 'UnaryExpr' && e8.op === 'NOT');

  const e9 = expr('a XOR b');
  assert('XOR binary', e9.type === 'BinaryExpr' && e9.op === 'XOR');

  const e10 = expr('a OR b');
  assert('OR binary', e10.type === 'BinaryExpr' && e10.op === 'OR');

  // Unary minus
  const e11 = expr('-7');
  assert('Unary minus', e11.type === 'UnaryExpr' && e11.op === '-');
  assert('Unary minus operand is 7', e11.operand.value === 7);

  // Parentheses
  const e12 = expr('(x + y) * 2');
  assert('Parenthesized expression', e12.type === 'BinaryExpr' && e12.op === '*');
  assert('Parenthesized left is +', e12.left.op === '+');

  // Precedence: * before +
  const e13 = expr('1 + 2 * 3');
  assert('Precedence: * before +', e13.op === '+' && e13.right.op === '*');

  // Precedence: AND before OR
  const e14 = expr('a OR b AND c');
  assert('Precedence: AND before OR', e14.op === 'OR' && e14.right.op === 'AND');

  // String concatenation
  const e15 = expr('"Hello, " + name');
  assert('String concat +', e15.type === 'BinaryExpr' && e15.op === '+');

  // Chained comparisons (parsed left-associative)
  const e16 = expr('age >= 18');
  assert('>= comparison', e16.op === '>=');
}

// ─── §3 Literals ─────────────────────────────────────────────────────────────

console.log('\n§3 Literals');

{
  assert('NumberLit integer', expr('42').type === 'NumberLit');
  assert('NumberLit decimal', expr('3.14').value === 3.14);
  assert('StringLit', expr('"hello"').type === 'StringLit' && expr('"hello"').value === 'hello');
  assert('BoolLit TRUE', expr('TRUE').type === 'BoolLit' && expr('TRUE').value === true);
  assert('BoolLit FALSE', expr('FALSE').value === false);
  assert('EmptyLit', expr('EMPTY').type === 'EmptyLit');

  // Array literal
  const arr = expr('[10, 20, 30]');
  assert('ArrayLit type', arr.type === 'ArrayLit');
  assert('ArrayLit 3 elements', arr.elements.length === 3);
  assert('ArrayLit first element', arr.elements[0].value === 10);

  // Empty array
  const arr2 = expr('[]');
  assert('Empty ArrayLit', arr2.type === 'ArrayLit' && arr2.elements.length === 0);

  // Mixed array
  const arr3 = expr('[1, "hello", TRUE]');
  assert('Mixed ArrayLit', arr3.elements[1].type === 'StringLit');
}

// ─── §6 Statements ───────────────────────────────────────────────────────────

console.log('\n§6 Statements');

{
  // WRITELN / WRITE
  const s1 = stmt('WRITELN("Hello, World!")');
  assert('PrintStmt type', s1.type === 'PrintStmt');
  assert('PrintStmt single arg', s1.args.length === 1 && s1.args[0].value === 'Hello, World!');
  assert('WRITELN sets newline true', s1.newline === true);

  const s2 = stmt('WRITELN("Score:", score)');
  assert('PrintStmt two args', s2.args.length === 2);

  const s3 = stmt('WRITELN("High score:", MAX_SCORE, "points")');
  assert('PrintStmt three args', s3.args.length === 3);

  const s4 = stmt('WRITELN("")');
  assert('PrintStmt empty string', s4.args[0].value === '');

  const s5 = stmt('WRITE("no newline")');
  assert('WRITE sets newline false', s5.newline === false);
  assert('WRITE single arg', s5.args.length === 1 && s5.args[0].value === 'no newline');

  // ERASE with no arg
  const s6 = stmt('ERASE()');
  assert('EraseStmt no arg', s6.type === 'EraseStmt' && s6.arg === null);

  // ERASE with array arg
  const s7 = stmt('ERASE(scores)');
  assert('EraseStmt with arg', s7.arg?.type === 'Identifier');

  // STOP
  const s8 = stmt('STOP()');
  assert('StopStmt', s8.type === 'StopStmt');

  // Assignment
  const s9 = stmt('score = 100');
  assert('Assign type', s9.type === 'Assign');
  assert('Assign target is Identifier', s9.target.type === 'Identifier' && s9.target.name === 'SCORE');
  assert('Assign value is 100', s9.value.value === 100);

  // Assignment RHS expression
  const s10 = stmt('score = score + 10');
  assert('Assign with expression RHS', s10.value.type === 'BinaryExpr');

  // Array index assignment
  const s11 = stmt('scores[0] = 99');
  assert('Index assign type', s11.type === 'Assign');
  assert('Index assign target is IndexExpr', s11.target.type === 'IndexExpr');
  assert('Index assign index is 0', s11.target.index.value === 0);
}

// ─── §7 Control Flow ─────────────────────────────────────────────────────────

console.log('\n§7 Control Flow');

{
  // IF / THEN / END IF
  const s1 = stmt('IF score > 100 THEN\n  WRITELN("High!")\nEND IF');
  assert('IfStmt type', s1.type === 'IfStmt');
  assert('IfStmt 1 branch', s1.branches.length === 1);
  assert('IfStmt condition is >', s1.branches[0].condition.op === '>');
  assert('IfStmt body has 1 stmt', s1.branches[0].body.length === 1);
  assert('IfStmt no else', s1.elseBody === null);

  // IF / ELSE
  const s2 = stmt('IF score > 100 THEN\n  WRITELN("High!")\nELSE\n  WRITELN("Low!")\nEND IF');
  assert('IfStmt with ELSE', s2.elseBody !== null && s2.elseBody.length === 1);

  // IF / ELSE IF / ELSE
  const src3 = `IF score >= 90 THEN
  WRITELN("A")
ELSE IF score >= 80 THEN
  WRITELN("B")
ELSE
  WRITELN("C")
END IF`;
  const s3 = stmt(src3);
  assert('IfStmt ELSE IF — 2 branches', s3.branches.length === 2);
  assert('IfStmt ELSE IF has else', s3.elseBody !== null);

  // WHILE
  const s4 = stmt('WHILE count <= 10\n  WRITELN(count)\nEND WHILE');
  assert('WhileStmt type', s4.type === 'WhileStmt');
  assert('WhileStmt condition', s4.condition.op === '<=');
  assert('WhileStmt body', s4.body.length === 1);

  // FOR / TO
  const s5 = stmt('FOR i = 1 TO 10\n  WRITELN(i)\nEND FOR');
  assert('ForStmt type', s5.type === 'ForStmt');
  assert('ForStmt variable', s5.variable === 'I');
  assert('ForStmt from', s5.from.value === 1);
  assert('ForStmt to', s5.to.value === 10);
  assert('ForStmt no step', s5.step === null);

  // FOR / TO / STEP
  const s6 = stmt('FOR i = 0 TO 100 STEP 10\n  WRITELN(i)\nEND FOR');
  assert('ForStmt with STEP', s6.step?.value === 10);

  // FOR / TO / STEP negative
  const s7 = stmt('FOR i = 10 TO 1 STEP -1\n  WRITELN(i)\nEND FOR');
  assert('ForStmt STEP -1 is UnaryExpr', s7.step?.type === 'UnaryExpr');

  // FOR EACH
  const s8 = stmt('FOR EACH name IN names\n  WRITELN(name)\nEND FOR');
  assert('ForEachStmt type', s8.type === 'ForEachStmt');
  assert('ForEachStmt variable', s8.variable === 'NAME');
  assert('ForEachStmt iterable', s8.iterable.name === 'NAMES');

  // BREAK
  const breakSrc = `WHILE TRUE
  IF done THEN
    BREAK
  END IF
END WHILE`;
  const s9 = stmt(breakSrc);
  assert('BreakStmt inside while', s9.body[0].branches[0].body[0].type === 'BreakStmt');

  // CONTINUE
  const contSrc = `FOR i = 1 TO 10
  IF i % 2 == 0 THEN
    CONTINUE
  END IF
END FOR`;
  const s10 = stmt(contSrc);
  assert('ContinueStmt inside for', s10.body[0].branches[0].body[0].type === 'ContinueStmt');

  // MATCH / WHEN / END MATCH
  const matchSrc = `MATCH score
  WHEN 100
    WRITELN("Perfect!")
  WHEN ELSE
    WRITELN("Keep trying!")
END MATCH`;
  const s11 = stmt(matchSrc);
  assert('MatchStmt type', s11.type === 'MatchStmt');
  assert('MatchStmt subject', s11.subject.name === 'SCORE');
  assert('MatchStmt 1 when', s11.whens.length === 1);
  assert('MatchStmt when value is 100', s11.whens[0].values[0].value === 100);
  assert('MatchStmt has elseBody', s11.elseBody !== null);

  // MATCH with range
  const matchRangeSrc = `MATCH score
  WHEN 90 TO 99
    WRITELN("Excellent!")
END MATCH`;
  const s12 = stmt(matchRangeSrc);
  assert('MatchStmt range when', s12.whens[0].range !== null);
  assert('MatchStmt range from', s12.whens[0].range.from.value === 90);
  assert('MatchStmt range to', s12.whens[0].range.to.value === 99);

  // MATCH stacked WHENs
  const matchStackSrc = `MATCH day
  WHEN "Saturday"
  WHEN "Sunday"
    WRITELN("Weekend!")
END MATCH`;
  const s13 = stmt(matchStackSrc);
  assert('MatchStmt stacked WHENs produce 1 WhenClause', s13.whens.length === 1);
  assert('MatchStmt stacked WHENs has 2 values', s13.whens[0].values.length === 2);
}

// ─── §8 Functions ─────────────────────────────────────────────────────────────

console.log('\n§8 Functions');

{
  // FUNCTION definition
  const s1 = stmt('FUNCTION Greet(name)\n  WRITELN("Hello, " + name)\nEND FUNCTION');
  assert('FunctionDecl type', s1.type === 'FunctionDecl');
  assert('FunctionDecl name', s1.name === 'GREET');
  assert('FunctionDecl params', s1.params.length === 1 && s1.params[0] === 'NAME');
  assert('FunctionDecl body', s1.body.length === 1);

  // No params
  const s2 = stmt('FUNCTION ShowHeader()\n  WRITELN("===")\nEND FUNCTION');
  assert('FunctionDecl no params', s2.params.length === 0);

  // Multiple params
  const s3 = stmt('FUNCTION Add(a, b)\n  RETURN a + b\nEND FUNCTION');
  assert('FunctionDecl multiple params', s3.params.length === 2);

  // RETURN with value
  const retSrc = 'FUNCTION Add(a, b)\n  RETURN a + b\nEND FUNCTION';
  const retFn = stmt(retSrc);
  assert('ReturnStmt in function', retFn.body[0].type === 'ReturnStmt');
  assert('ReturnStmt value', retFn.body[0].value?.type === 'BinaryExpr');

  // RETURN with no value
  const retVoid = stmt('FUNCTION F()\n  RETURN\nEND FUNCTION');
  assert('ReturnStmt no value', retVoid.body[0].value === null);

  // User function call as expression
  const callExpr = expr('Add(3, 4)');
  assert('User function CallExpr', callExpr.type === 'CallExpr');
  assert('User function callee', callExpr.callee === 'ADD');
  assert('User function args', callExpr.args.length === 2);

  // User function call as statement
  const callStmt = stmt('ShowHeader()');
  assert('User function call as ExprStmt', callStmt.type === 'ExprStmt');
  assert('ExprStmt is CallExpr', callStmt.expr.type === 'CallExpr');
}

// ─── §10 Error Handling ───────────────────────────────────────────────────────

console.log('\n§10 Error Handling');

{
  const src1 = `ATTEMPT
  VAR age = NUM(INPUT("Age: "))
ERROR
  WRITELN("Not a number.")
END ATTEMPT`;
  const s1 = stmt(src1);
  assert('AttemptStmt type', s1.type === 'AttemptStmt');
  assert('AttemptStmt tryBody', s1.tryBody.length === 1);
  assert('AttemptStmt no errorVar', s1.errorVar === null);
  assert('AttemptStmt errorBody', s1.errorBody.length === 1);

  // ERROR with capture variable
  const src2 = `ATTEMPT
  VAR age = NUM(INPUT("Age: "))
ERROR message
  WRITELN("Problem:", message)
END ATTEMPT`;
  const s2 = stmt(src2);
  assert('AttemptStmt with errorVar', s2.errorVar === 'MESSAGE');

  // SIGNAL
  const s3 = stmt('SIGNAL("Cannot divide by zero.")');
  assert('SignalStmt type', s3.type === 'SignalStmt');
  assert('SignalStmt message', s3.message.value === 'Cannot divide by zero.');

  // LAST_ERROR property access
  const e = expr('LAST_ERROR.MESSAGE');
  assert('PropertyExpr on LAST_ERROR', e.type === 'PropertyExpr');
  assert('PropertyExpr object is LAST_ERROR', e.object.name === 'LAST_ERROR');
  assert('PropertyExpr property is MESSAGE', e.property === 'MESSAGE');
}

// ─── §11 Arrays ───────────────────────────────────────────────────────────────

console.log('\n§11 Arrays');

{
  // ARRAY() call
  const e1 = expr('ARRAY()');
  assert('ARRAY() CallExpr', e1.type === 'CallExpr' && e1.callee === 'ARRAY');

  // ARRAY(10)
  const e2 = expr('ARRAY(10)');
  assert('ARRAY(10) arg', e2.args[0].value === 10);

  // Index access
  const e3 = expr('scores[0]');
  assert('IndexExpr type', e3.type === 'IndexExpr');
  assert('IndexExpr index', e3.index.value === 0);

  // Nested index (shouldn't come up in v1 but parser shouldn't choke)
  const e4 = expr('a[i]');
  assert('IndexExpr with variable index', e4.index.name === 'I');

  // APPEND as statement
  const s1 = stmt('APPEND(scores, 40)');
  assert('APPEND as ExprStmt', s1.type === 'ExprStmt');
  assert('APPEND CallExpr', s1.expr.callee === 'APPEND');

  // REMOVE
  const s2 = stmt('REMOVE(scores, 0)');
  assert('REMOVE CallExpr', s2.expr.callee === 'REMOVE');

  // LENGTH in expression
  const e5 = expr('LENGTH(scores) - 1');
  assert('LENGTH in BinaryExpr', e5.type === 'BinaryExpr' && e5.left.callee === 'LENGTH');
}

// ─── §12 Standard Library ────────────────────────────────────────────────────

console.log('\n§12 Standard Library');

{
  // Type conversion
  assert('STR CallExpr', expr('STR(42)').callee === 'STR');
  assert('NUM CallExpr', expr('NUM("42")').callee === 'NUM');
  assert('BOOL CallExpr', expr('BOOL(1)').callee === 'BOOL');

  // Math
  assert('ABS CallExpr', expr('ABS(-5)').callee === 'ABS');
  assert('POW CallExpr', expr('POW(2, 8)').callee === 'POW');
  assert('RANDOMINT CallExpr', expr('RANDOMINT(1, 6)').callee === 'RANDOMINT');
  assert('RANDOM CallExpr', expr('RANDOM()').callee === 'RANDOM');

  // String functions
  assert('UPPER CallExpr', expr('UPPER("hello")').callee === 'UPPER');
  assert('SUBSTRING CallExpr', expr('SUBSTRING("hello", 1, 3)').callee === 'SUBSTRING');
  assert('SPLIT CallExpr', expr('SPLIT("a,b,c", ",")').callee === 'SPLIT');

  // Type checking
  assert('ISNUMBER CallExpr', expr('ISNUMBER(x)').callee === 'ISNUMBER');
  assert('ISEMPTY CallExpr', expr('ISEMPTY(x)').callee === 'ISEMPTY');

  // INPUT as expression (assigned to var)
  const s = stmt('VAR name = INPUT("Name: ")');
  assert('INPUT in VarDecl', s.value.callee === 'INPUT');
}

// ─── Full program ─────────────────────────────────────────────────────────────

console.log('\n§ Full program parse');

{
  const src = `// QF CODE v1

CONST MAX_SCORE = 1000
CONST APP_NAME = "My Game"

VAR score = 0
VAR player = ""

FUNCTION ShowHeader()
    WRITELN("================")
    WRITELN(" " + APP_NAME)
    WRITELN("================")
END FUNCTION

FUNCTION AddScore(points)
    score = score + points
    IF score > MAX_SCORE THEN
        score = MAX_SCORE
    END IF
END FUNCTION

ShowHeader()
player = INPUT("Enter your name: ")
WRITELN("Welcome,", player)
AddScore(10)
WRITELN("Score:", score)`;

  let tree;
  try {
    tree = ast(src);
    assert('Full program parses without error', true);
  } catch (e) {
    assert('Full program parses without error', false, e.message);
    tree = { body: [] };
  }

  assert('Full program body has expected count',
    tree.body.length === 11, `got ${tree.body.length}`);

  assert('First const is VarDecl isConst', tree.body[0].type === 'VarDecl' && tree.body[0].isConst);
  assert('ShowHeader is FunctionDecl', tree.body[4].type === 'FunctionDecl' && tree.body[4].name === 'SHOWHEADER');
  assert('AddScore is FunctionDecl', tree.body[5].type === 'FunctionDecl' && tree.body[5].name === 'ADDSCORE');
  assert('Last stmt is PrintStmt', tree.body[tree.body.length - 1].type === 'PrintStmt');
}

// ─── Error cases ──────────────────────────────────────────────────────────────

console.log('\n§ Parse errors');

{
  assertParseError('IF without THEN raises ParseError',
    'IF score > 100\n  WRITELN("hi")\nEND IF');

  assertParseError('IF without END IF raises ParseError',
    'IF score > 100 THEN\n  WRITELN("hi")');

  assertParseError('WHILE without END WHILE raises ParseError',
    'WHILE TRUE\n  WRITELN("x")');

  assertParseError('FUNCTION without END FUNCTION raises ParseError',
    'FUNCTION Foo()\n  WRITELN("x")');

  assertParseError('Unclosed parenthesis raises ParseError',
    'WRITELN("hi"');

  assertParseError('FOR without END FOR raises ParseError',
    'FOR i = 1 TO 10\n  WRITELN(i)');

  assertParseError('CONST without value raises ParseError',
    'CONST X');
}

// ─── Nested / complex structure ───────────────────────────────────────────────

console.log('\n§ Nested structures');

{
  const nestedSrc = `WHILE TRUE
  VAR answer = INPUT("Guess: ")
  IF answer == "42" THEN
    WRITELN("Correct!")
    BREAK
  END IF
END WHILE`;
  const s = stmt(nestedSrc);
  assert('Nested IF inside WHILE', s.type === 'WhileStmt');
  assert('Nested IF is IfStmt', s.body[1].type === 'IfStmt');
  assert('Nested BREAK in IF', s.body[1].branches[0].body[1].type === 'BreakStmt');

  // Recursive function
  const recSrc = `FUNCTION Factorial(n)
  IF n <= 1 THEN
    RETURN 1
  END IF
  RETURN n * Factorial(n - 1)
END FUNCTION`;
  const f = stmt(recSrc);
  assert('Recursive function parses', f.type === 'FunctionDecl');
  assert('Recursive call in body', f.body[1].value.right.type === 'CallExpr');
  assert('Recursive callee name', f.body[1].value.right.callee === 'FACTORIAL');

  // ATTEMPT inside function
  const attemptSrc = `FUNCTION SafeDivide(a, b)
  ATTEMPT
    RETURN a / b
  ERROR msg
    SIGNAL("Division failed: " + msg)
  END ATTEMPT
END FUNCTION`;
  const fn = stmt(attemptSrc);
  assert('ATTEMPT inside function', fn.body[0].type === 'AttemptStmt');
  assert('SIGNAL inside ERROR block', fn.body[0].errorBody[0].type === 'SignalStmt');
}

// ─── Line number tracking ──────────────────────────────────────────────────────

console.log('\n§ Line numbers');

{
  const src = `VAR x = 1
VAR y = 2
WRITELN(x + y)`;
  const b = body(src);
  assert('VarDecl x on line 1', b[0].line === 1);
  assert('VarDecl y on line 2', b[1].line === 2);
  assert('PrintStmt on line 3', b[2].line === 3);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests pass. Parser is ready for evaluator integration.\n');
} else {
  console.log(`${failed} test(s) failed.\n`);
  process.exit(1);
}
