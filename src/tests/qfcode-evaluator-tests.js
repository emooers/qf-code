/**
 * QF CODE Evaluator Test Suite
 * Run with: node qfcode-evaluator-tests.js
 */

const { tokenize } = require('../qfcode-lexer.js');
const { parse }    = require('../qfcode-parser.js');
const { Evaluator, QFError, StopSignal, EMPTY, displayValue } = require('../qfcode-evaluator.js');

let passed = 0;
let failed = 0;

async function main() {

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? '\n     ' + detail : ''}`);
    failed++;
  }
}

// ── Test runner helpers ───────────────────────────────────────────────────────

/**
 * Run a QF CODE program and collect printed output.
 * @param {string} source
 * @param {string[]} inputs  - responses to INPUT() calls, in order
 * @returns {Promise<{output: string[], error: Error|null}>}
 */
async function run(source, inputs = []) {
  const output = [];
  let inputIdx = 0;

  let lineOpen = false; // tracks whether the last push was an unterminated WRITE()

  const io = {
    print: (s) => { output.push(s); lineOpen = false; },
    write: (s) => {
      if (lineOpen) output[output.length - 1] += s;
      else { output.push(s); lineOpen = true; }
    },
    erase: ()  => { output.length = 0; lineOpen = false; },
    input: async (prompt) => {
      output.push(`[INPUT] ${prompt}`);
      lineOpen = false;
      return inputs[inputIdx++] ?? '';
    },
    sound: async () => {},
  };

  const ev = new Evaluator(io);
  try {
    await ev.run(parse(tokenize(source)));
    return { output, error: null, ev };
  } catch (e) {
    return { output, error: e, ev };
  }
}

async function assertOutput(label, source, expected, inputs = []) {
  const { output, error } = await run(source, inputs);
  if (error) {
    console.error(`  ✗  ${label}\n     Unexpected error: ${error.message}`);
    failed++;
    return;
  }
  const actual = output.join('\n');
  const exp    = Array.isArray(expected) ? expected.join('\n') : expected;
  if (actual === exp) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}\n     Expected: ${JSON.stringify(exp)}\n     Got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function assertError(label, source, msgFragment = '') {
  const { error } = await run(source);
  if (error instanceof QFError) {
    if (!msgFragment || error.message.includes(msgFragment)) {
      console.log(`  ✓  ${label}`);
      passed++;
    } else {
      console.error(`  ✗  ${label}\n     Expected msg containing "${msgFragment}"\n     Got: "${error.message}"`);
      failed++;
    }
  } else if (error) {
    console.error(`  ✗  ${label}\n     Expected QFError, got ${error.constructor.name}: ${error.message}`);
    failed++;
  } else {
    console.error(`  ✗  ${label} (expected QFError, got no error)`);
    failed++;
  }
}

// ─── §3 Data types ───────────────────────────────────────────────────────────

console.log('\n§3 Data Types');

await assertOutput('WRITELN number',   'WRITELN(42)',          ['42']);
await assertOutput('WRITELN decimal',  'WRITELN(3.14)',        ['3.14']);
await assertOutput('WRITELN string',   'WRITELN("Hello")',     ['Hello']);
await assertOutput('WRITELN TRUE',     'WRITELN(TRUE)',        ['TRUE']);
await assertOutput('WRITELN FALSE',    'WRITELN(FALSE)',       ['FALSE']);
await assertOutput('WRITELN EMPTY var','VAR x\nWRITELN(x)',   ['EMPTY']);

// WRITE() — no newline, accumulates onto the current line; WRITELN does NOT
// continue that open line, it always starts its own fresh line (matching
// the shell's appendOutputLine, which resets currentWriteLine before writing).
await assertOutput('Two WRITEs accumulate on one line; WRITELN starts a new line',
  'WRITE("a")\nWRITE("b")\nWRITELN("c")', ['ab', 'c']);
await assertOutput('WRITE opens a line; each WRITELN after it is its own line',
  'WRITE("x")\nWRITELN("y")\nWRITELN("z")', ['x', 'y', 'z']);

// SOUND() / BELL() — resolve without throwing; no observable text output
await assertOutput('SOUND(note, ms) with a note name', 'SOUND("C4", 10)\nWRITELN("done")', ['done']);
await assertOutput('SOUND(hz, ms) with a numeric frequency', 'SOUND(440, 10)\nWRITELN("done")', ['done']);
await assertOutput('BELL() takes no arguments', 'BELL()\nWRITELN("done")', ['done']);
await assertError('SOUND() rejects an unrecognized note name', 'SOUND("nope", 10)', "isn't a note");
await assertError('SOUND() rejects a non-positive duration', 'SOUND(440, 0)', 'positive number of milliseconds');
await assertError('BELL() rejects any arguments', 'BELL(1)', 'takes no arguments');

// ─── §4 Variables ─────────────────────────────────────────────────────────────

console.log('\n§4 Variables');

await assertOutput('VAR declaration and use', `
VAR score = 0
WRITELN(score)
`, ['0']);

await assertOutput('Assignment', `
VAR score = 0
score = 100
WRITELN(score)
`, ['100']);

await assertOutput('CONST use', `
CONST MAX_SCORE = 1000
WRITELN(MAX_SCORE)
`, ['1000']);

await assertError('CONST reassignment is a runtime error', `
CONST MAX_SCORE = 1000
MAX_SCORE = 999
`, 'constant');

await assertError('Undeclared variable is a runtime error', `
WRITELN(score)
`, "hasn't been declared");

await assertOutput('Reassign across types', `
VAR x = 10
x = "hello"
WRITELN(x)
`, ['hello']);

await assertOutput('VAR with no init is EMPTY', `
VAR x
WRITELN(x)
`, ['EMPTY']);

// ─── §5 Operators ─────────────────────────────────────────────────────────────

console.log('\n§5 Operators');

await assertOutput('Addition',          'WRITELN(3 + 4)',   ['7']);
await assertOutput('Subtraction',       'WRITELN(10 - 3)', ['7']);
await assertOutput('Multiplication',    'WRITELN(3 * 4)',   ['12']);
await assertOutput('Division decimal',  'WRITELN(7 / 2)',   ['3.5']);
await assertOutput('Integer division',  'WRITELN(7 // 2)', ['3']);
await assertOutput('Modulo',            'WRITELN(7 % 2)',   ['1']);

await assertOutput('Comparison >',  'WRITELN(5 > 3)',   ['TRUE']);
await assertOutput('Comparison <',  'WRITELN(3 < 5)',   ['TRUE']);
await assertOutput('Comparison ==', 'WRITELN(5 == 5)',  ['TRUE']);
await assertOutput('Comparison !=', 'WRITELN(5 != 3)',  ['TRUE']);
await assertOutput('Comparison >=', 'WRITELN(5 >= 5)',  ['TRUE']);
await assertOutput('Comparison <=', 'WRITELN(3 <= 5)',  ['TRUE']);

await assertOutput('AND both true',  'WRITELN(TRUE AND TRUE)',   ['TRUE']);
await assertOutput('AND one false',  'WRITELN(TRUE AND FALSE)',  ['FALSE']);
await assertOutput('OR one true',    'WRITELN(FALSE OR TRUE)',   ['TRUE']);
await assertOutput('OR both false',  'WRITELN(FALSE OR FALSE)',  ['FALSE']);
await assertOutput('NOT true',       'WRITELN(NOT TRUE)',        ['FALSE']);
await assertOutput('NOT false',      'WRITELN(NOT FALSE)',       ['TRUE']);
await assertOutput('XOR diff',       'WRITELN(TRUE XOR FALSE)',  ['TRUE']);
await assertOutput('XOR same',       'WRITELN(TRUE XOR TRUE)',   ['FALSE']);

await assertOutput('Unary minus',    'WRITELN(-7)',  ['-7']);

await assertOutput('String concat',  'WRITELN("Hello, " + "World")',    ['Hello, World']);
await assertOutput('String + number coerce', 'WRITELN("score: " + 10)', ['score: 10']);
await assertOutput('String + bool coerce',   'WRITELN("done: " + TRUE)', ['done: TRUE']);

await assertOutput('Precedence * before +', 'WRITELN(1 + 2 * 3)', ['7']);
await assertOutput('Precedence parens',     'WRITELN((1 + 2) * 3)', ['9']);
await assertOutput('Precedence AND before OR', `
VAR a = TRUE
VAR b = FALSE
VAR c = TRUE
WRITELN(a OR b AND c)
`, ['TRUE']);

await assertError('Division by zero', 'WRITELN(1 / 0)');
await assertError('Integer division by zero', 'WRITELN(1 // 0)');
await assertError('Modulo by zero', 'WRITELN(1 % 0)');
await assertError('String + number ambiguous raises error', 'WRITELN("3" + 4)');

// ─── §6 Statements ────────────────────────────────────────────────────────────

console.log('\n§6 Statements');

await assertOutput('WRITELN multi-arg space-separated', `
WRITELN("Score:", 100, "points")
`, ['Score: 100 points']);

await assertOutput('WRITELN empty string = blank line', `
WRITELN("A")
WRITELN("")
WRITELN("B")
`, ['A', '', 'B']);

await assertOutput('ERASE clears output', `
WRITELN("gone")
ERASE()
WRITELN("fresh")
`, ['fresh']);

// ─── §7 Control Flow ─────────────────────────────────────────────────────────

console.log('\n§7 Control Flow');

await assertOutput('IF true branch', `
VAR score = 150
IF score > 100 THEN
  WRITELN("High score!")
END IF
`, ['High score!']);

await assertOutput('IF false branch skipped', `
VAR score = 50
IF score > 100 THEN
  WRITELN("High score!")
END IF
WRITELN("Done")
`, ['Done']);

await assertOutput('IF ELSE', `
VAR score = 50
IF score > 100 THEN
  WRITELN("High!")
ELSE
  WRITELN("Low!")
END IF
`, ['Low!']);

await assertOutput('IF ELSE IF chain', `
VAR score = 85
IF score >= 90 THEN
  WRITELN("A")
ELSE IF score >= 80 THEN
  WRITELN("B")
ELSE IF score >= 70 THEN
  WRITELN("C")
ELSE
  WRITELN("D")
END IF
`, ['B']);

await assertOutput('WHILE loop', `
VAR count = 1
WHILE count <= 3
  WRITELN(count)
  count = count + 1
END WHILE
`, ['1', '2', '3']);

await assertOutput('FOR loop', `
FOR i = 1 TO 3
  WRITELN(i)
END FOR
`, ['1', '2', '3']);

await assertOutput('FOR STEP 2', `
FOR i = 0 TO 6 STEP 2
  WRITELN(i)
END FOR
`, ['0', '2', '4', '6']);

await assertOutput('FOR STEP -1 countdown', `
FOR i = 3 TO 1 STEP -1
  WRITELN(i)
END FOR
`, ['3', '2', '1']);

await assertOutput('FOR loop variable gone after END FOR', `
FOR i = 1 TO 1
  WRITELN(i)
END FOR
VAR i = 99
WRITELN(i)
`, ['1', '99']);

await assertOutput('FOR EACH array', `
VAR names = ["Alice", "Bob", "Charlie"]
FOR EACH name IN names
  WRITELN(name)
END FOR
`, ['Alice', 'Bob', 'Charlie']);

await assertOutput('FOR EACH string chars', `
FOR EACH ch IN "abc"
  WRITELN(ch)
END FOR
`, ['a', 'b', 'c']);

await assertOutput('BREAK exits loop', `
VAR i = 0
WHILE TRUE
  i = i + 1
  IF i == 3 THEN
    BREAK
  END IF
END WHILE
WRITELN(i)
`, ['3']);

await assertOutput('CONTINUE skips rest of iteration', `
FOR i = 1 TO 5
  IF i % 2 == 0 THEN
    CONTINUE
  END IF
  WRITELN(i)
END FOR
`, ['1', '3', '5']);

await assertOutput('MATCH exact value', `
VAR score = 100
MATCH score
  WHEN 100
    WRITELN("Perfect!")
  WHEN ELSE
    WRITELN("Other")
END MATCH
`, ['Perfect!']);

await assertOutput('MATCH WHEN ELSE', `
VAR score = 42
MATCH score
  WHEN 100
    WRITELN("Perfect!")
  WHEN ELSE
    WRITELN("Not perfect")
END MATCH
`, ['Not perfect']);

await assertOutput('MATCH range', `
VAR score = 95
MATCH score
  WHEN 90 TO 99
    WRITELN("Excellent!")
  WHEN ELSE
    WRITELN("Other")
END MATCH
`, ['Excellent!']);

await assertOutput('MATCH stacked WHENs', `
VAR day = "Saturday"
MATCH day
  WHEN "Saturday"
  WHEN "Sunday"
    WRITELN("Weekend!")
  WHEN ELSE
    WRITELN("Weekday")
END MATCH
`, ['Weekend!']);

await assertOutput('MATCH no match no WHEN ELSE — silent', `
VAR x = 42
MATCH x
  WHEN 100
    WRITELN("hundred")
END MATCH
WRITELN("done")
`, ['done']);

// ─── §8 Functions ─────────────────────────────────────────────────────────────

console.log('\n§8 Functions');

await assertOutput('Basic function call', `
FUNCTION Greet(name)
  WRITELN("Hello, " + name)
END FUNCTION
Greet("Alice")
`, ['Hello, Alice']);

await assertOutput('Function with RETURN', `
FUNCTION Add(a, b)
  RETURN a + b
END FUNCTION
WRITELN(Add(3, 4))
`, ['7']);

await assertOutput('Function no params', `
FUNCTION ShowLine()
  WRITELN("---")
END FUNCTION
ShowLine()
ShowLine()
`, ['---', '---']);

await assertOutput('Function implicit EMPTY return', `
FUNCTION Noop()
  VAR x = 1
END FUNCTION
VAR result = Noop()
WRITELN(result)
`, ['EMPTY']);

await assertOutput('Local var not visible outside', `
FUNCTION F()
  VAR secret = 42
END FUNCTION
F()
VAR secret = 99
WRITELN(secret)
`, ['99']);

await assertOutput('Global var visible inside function', `
VAR greeting = "Hi"
FUNCTION Greet(name)
  WRITELN(greeting + ", " + name)
END FUNCTION
Greet("Bob")
`, ['Hi, Bob']);

await assertOutput('Function modifies global var', `
VAR score = 0
FUNCTION AddPoints(n)
  score = score + n
END FUNCTION
AddPoints(10)
AddPoints(5)
WRITELN(score)
`, ['15']);

await assertOutput('Recursive factorial', `
FUNCTION Factorial(n)
  IF n <= 1 THEN
    RETURN 1
  END IF
  RETURN n * Factorial(n - 1)
END FUNCTION
WRITELN(Factorial(5))
`, ['120']);

await assertOutput('Multiple function calls in expression', `
FUNCTION Double(x)
  RETURN x * 2
END FUNCTION
WRITELN(Double(3) + Double(4))
`, ['14']);

await assertError('Wrong arg count is a runtime error', `
FUNCTION Add(a, b)
  RETURN a + b
END FUNCTION
Add(1)
`, 'expects 2');

// ─── §9 I/O ───────────────────────────────────────────────────────────────────

console.log('\n§9 I/O');

await assertOutput('INPUT returns string', `
VAR name = INPUT("Name: ")
WRITELN(name)
`, ['[INPUT] Name: ', 'Alice'], ['Alice']);

await assertOutput('INPUT with NUM conversion', `
VAR age = NUM(INPUT("Age: "))
WRITELN(age + 1)
`, ['[INPUT] Age: ', '26'], ['25']);

// ─── §10 Error Handling ───────────────────────────────────────────────────────

console.log('\n§10 Error Handling');

await assertOutput('ATTEMPT catches QFError', `
ATTEMPT
  WRITELN(NUM("hello"))
ERROR
  WRITELN("Caught!")
END ATTEMPT
`, ['Caught!']);

await assertOutput('ATTEMPT with error var', `
ATTEMPT
  WRITELN(NUM("oops"))
ERROR msg
  WRITELN("Error: " + msg)
END ATTEMPT
`, ['Error: "oops" cannot be converted to a number. Tip: Use NUM() only when you\'re sure the value is numeric.']);

await assertOutput('SIGNAL raises catchable error', `
FUNCTION Divide(a, b)
  IF b == 0 THEN
    SIGNAL("Cannot divide by zero.")
  END IF
  RETURN a / b
END FUNCTION
ATTEMPT
  WRITELN(Divide(10, 0))
ERROR msg
  WRITELN("Caught: " + msg)
END ATTEMPT
`, ['Caught: Cannot divide by zero.']);

await assertOutput('ATTEMPT body runs on success', `
ATTEMPT
  VAR x = NUM("42")
  WRITELN(x + 1)
ERROR
  WRITELN("Error")
END ATTEMPT
`, ['43']);

await assertOutput('LAST_ERROR.MESSAGE set on error in ATTEMPT', `
ATTEMPT
  NUM("bad")
ERROR
  WRITELN(LAST_ERROR.MESSAGE)
END ATTEMPT
`, ['"bad" cannot be converted to a number. Tip: Use NUM() only when you\'re sure the value is numeric.']);

// ─── §11 Arrays ───────────────────────────────────────────────────────────────

console.log('\n§11 Arrays');

await assertOutput('Array literal and indexing', `
VAR scores = [10, 20, 30]
WRITELN(scores[0])
WRITELN(scores[1])
WRITELN(scores[2])
`, ['10', '20', '30']);

await assertOutput('Array index assignment', `
VAR scores = [10, 20, 30]
scores[1] = 99
WRITELN(scores[1])
`, ['99']);

await assertOutput('ARRAY() empty', `
VAR arr = ARRAY()
WRITELN(LENGTH(arr))
`, ['0']);

await assertOutput('ARRAY(n) pre-sized with EMPTY', `
VAR arr = ARRAY(3)
WRITELN(LENGTH(arr))
WRITELN(arr[0])
`, ['3', 'EMPTY']);

await assertOutput('APPEND', `
VAR scores = [10, 20]
APPEND(scores, 30)
WRITELN(LENGTH(scores))
WRITELN(scores[2])
`, ['3', '30']);

await assertOutput('REMOVE', `
VAR scores = [10, 20, 30]
REMOVE(scores, 1)
WRITELN(LENGTH(scores))
WRITELN(scores[0])
WRITELN(scores[1])
`, ['2', '10', '30']);

await assertOutput('INSERT', `
VAR scores = [10, 30]
INSERT(scores, 1, 20)
WRITELN(scores[0])
WRITELN(scores[1])
WRITELN(scores[2])
`, ['10', '20', '30']);

await assertOutput('CONTAINS array true', `
VAR scores = [10, 20, 30]
WRITELN(CONTAINS(scores, 20))
`, ['TRUE']);

await assertOutput('CONTAINS array false', `
VAR scores = [10, 20, 30]
WRITELN(CONTAINS(scores, 99))
`, ['FALSE']);

await assertOutput('REVERSE', `
VAR scores = [1, 2, 3]
REVERSE(scores)
WRITELN(scores[0])
WRITELN(scores[2])
`, ['3', '1']);

await assertOutput('SORT numbers', `
VAR scores = [30, 10, 20]
SORT(scores)
WRITELN(scores[0])
WRITELN(scores[1])
WRITELN(scores[2])
`, ['10', '20', '30']);

await assertOutput('ERASE array empties it', `
VAR scores = [1, 2, 3]
ERASE(scores)
WRITELN(LENGTH(scores))
`, ['0']);

await assertOutput('FOR loop with LENGTH', `
VAR scores = [10, 20, 30, 40]
VAR total = 0
FOR i = 0 TO LENGTH(scores) - 1
  total = total + scores[i]
END FOR
WRITELN(total)
`, ['100']);

await assertError('Array out of range error', `
VAR scores = [10, 20]
WRITELN(scores[5])
`, 'out of range');

// ─── §12 Standard Library ────────────────────────────────────────────────────

console.log('\n§12 Standard Library');

// Type conversion
await assertOutput('STR(42)', 'WRITELN(STR(42))', ['42']);
await assertOutput('STR(TRUE)', 'WRITELN(STR(TRUE))', ['TRUE']);
await assertOutput('NUM("42")', 'WRITELN(NUM("42"))', ['42']);
await assertOutput('BOOL(1)', 'WRITELN(BOOL(1))', ['TRUE']);
await assertOutput('BOOL(0)', 'WRITELN(BOOL(0))', ['FALSE']);

// Type checking
await assertOutput('ISNUMBER true',  'WRITELN(ISNUMBER(42))',    ['TRUE']);
await assertOutput('ISNUMBER false', 'WRITELN(ISNUMBER("hi"))',  ['FALSE']);
await assertOutput('ISSTRING true',  'WRITELN(ISSTRING("hi"))',  ['TRUE']);
await assertOutput('ISBOOL true',    'WRITELN(ISBOOL(TRUE))',    ['TRUE']);
await assertOutput('ISEMPTY true',   'VAR x\nWRITELN(ISEMPTY(x))', ['TRUE']);
await assertOutput('ISARRAY true',   'WRITELN(ISARRAY([1,2]))', ['TRUE']);

// String functions
await assertOutput('LENGTH string',      'WRITELN(LENGTH("hello"))',              ['5']);
await assertOutput('UPPER',              'WRITELN(UPPER("hello"))',               ['HELLO']);
await assertOutput('LOWER',             'WRITELN(LOWER("HELLO"))',               ['hello']);
await assertOutput('TRIM',              'WRITELN(TRIM("  hi  "))',               ['hi']);
await assertOutput('CONTAINS string',   'WRITELN(CONTAINS("hello", "ell"))',     ['TRUE']);
await assertOutput('REPLACE',           'WRITELN(REPLACE("hello", "l", "r"))',   ['herro']);
await assertOutput('SPLIT',             'WRITELN(SPLIT("a,b,c", ",")[1])',       ['b']);
await assertOutput('SUBSTRING',         'WRITELN(SUBSTRING("hello", 1, 3))',     ['ell']);
await assertOutput('STARTSWITH true',   'WRITELN(STARTSWITH("hello", "hel"))',   ['TRUE']);
await assertOutput('STARTSWITH false',  'WRITELN(STARTSWITH("hello", "xyz"))',   ['FALSE']);
await assertOutput('ENDSWITH true',     'WRITELN(ENDSWITH("hello", "llo"))',     ['TRUE']);

// String indexing
await assertOutput('String index [0]',  'WRITELN("Alice"[0])', ['A']);
await assertOutput('String index [1]',  'WRITELN("Alice"[1])', ['l']);
await assertError('String index out of range', 'WRITELN("hi"[10])', 'out of range');

// Math
await assertOutput('ABS(-5)',         'WRITELN(ABS(-5))',         ['5']);
await assertOutput('POW(2,8)',        'WRITELN(POW(2, 8))',        ['256']);
await assertOutput('ROUND(3.6)',      'WRITELN(ROUND(3.6))',       ['4']);
await assertOutput('FLOOR(3.9)',      'WRITELN(FLOOR(3.9))',       ['3']);
await assertOutput('CEILING(3.1)',    'WRITELN(CEILING(3.1))',     ['4']);
await assertOutput('SQRT(16)',        'WRITELN(SQRT(16))',          ['4']);
await assertOutput('MIN(3,7)',        'WRITELN(MIN(3, 7))',         ['3']);
await assertOutput('MAX(3,7)',        'WRITELN(MAX(3, 7))',         ['7']);

{
  // RANDOMINT in range
  const { output } = await run('WRITELN(RANDOMINT(1, 6))');
  const n = parseInt(output[0]);
  assert('RANDOMINT(1,6) in range 1-6', n >= 1 && n <= 6, `got ${output[0]}`);
}

{
  // RANDOM in [0,1)
  const { output } = await run('WRITELN(RANDOM())');
  const n = parseFloat(output[0]);
  assert('RANDOM() returns 0-1', n >= 0 && n < 1, `got ${output[0]}`);
}

await assertError('NUM on non-numeric string', 'WRITELN(NUM("hello"))', 'cannot be converted');
await assertError('SQRT of negative', 'WRITELN(SQRT(-1))', 'negative');

// ─── Full program integration ─────────────────────────────────────────────────

console.log('\n§ Full program integration');

await assertOutput('Fibonacci sequence', `
FUNCTION Fib(n)
  IF n <= 1 THEN
    RETURN n
  END IF
  RETURN Fib(n - 1) + Fib(n - 2)
END FUNCTION
FOR i = 0 TO 7
  WRITELN(Fib(i))
END FOR
`, ['0', '1', '1', '2', '3', '5', '8', '13']);

await assertOutput('FizzBuzz 1-15', `
FOR i = 1 TO 15
  IF i % 15 == 0 THEN
    WRITELN("FizzBuzz")
  ELSE IF i % 3 == 0 THEN
    WRITELN("Fizz")
  ELSE IF i % 5 == 0 THEN
    WRITELN("Buzz")
  ELSE
    WRITELN(i)
  END IF
END FOR
`, ['1','2','Fizz','4','Buzz','Fizz','7','8','Fizz','Buzz','11','Fizz','13','14','FizzBuzz']);

await assertOutput('Grade book with arrays', `
VAR grades = [92, 85, 78, 95, 61]
VAR total = 0
FOR EACH g IN grades
  total = total + g
END FOR
VAR avg = total // LENGTH(grades)
WRITELN("Average:", avg)
`, ['Average: 82']);

await assertOutput('Bubble sort', `
VAR arr = [5, 3, 8, 1, 9, 2]
VAR n = LENGTH(arr)
FOR i = 0 TO n - 2
  FOR j = 0 TO n - 2 - i
    IF arr[j] > arr[j + 1] THEN
      VAR tmp = arr[j]
      arr[j] = arr[j + 1]
      arr[j + 1] = tmp
    END IF
  END FOR
END FOR
FOR EACH v IN arr
  WRITELN(v)
END FOR
`, ['1','2','3','5','8','9']);

await assertOutput('Counter with ATTEMPT', `
FUNCTION ParseInt(s)
  ATTEMPT
    RETURN NUM(s)
  ERROR
    RETURN 0
  END ATTEMPT
END FUNCTION
WRITELN(ParseInt("42"))
WRITELN(ParseInt("bad"))
`, ['42', '0']);

// ─── Execution limits (cooperative checkpoint guard) ───────────────────────────

console.log('\n§15 Execution Limits');

await assertError('WHILE loop stopped at the iteration cap', 'WHILE TRUE\nEND WHILE', 'stopped after 10,000 iterations');
await assertError('FOR loop stopped at the iteration cap', 'FOR i = 1 TO 999999999\nEND FOR', 'stopped after 10,000 iterations');

{
  // Stop() should interrupt a tight loop promptly rather than only at the
  // eventual iteration cap — set stopRequested and confirm StopSignal fires
  // well before 10,000 iterations.
  const io = { print(){}, write(){}, erase(){}, input: async()=>'', sound: async()=>{} };
  const ev = new Evaluator(io);
  const runPromise = ev.run(parse(tokenize('VAR i = 0\nWHILE TRUE\n  i = i + 1\nEND WHILE')));
  ev.stopRequested = true;
  try {
    await runPromise;
    assert('Stop interrupts a running WHILE TRUE loop', false, 'expected StopSignal, got no error');
  } catch (e) {
    assert('Stop interrupts a running WHILE TRUE loop', e instanceof StopSignal);
  }
}

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('All tests pass. Evaluator is ready for runtime wiring.\n');
  } else {
    console.log(`${failed} test(s) failed.\n`);
    process.exit(1);
  }
}

main().catch(e => { console.error('Test runner crashed:', e); process.exit(1); });
