/**
 * QF CODE Evaluator Test Suite
 * Run with: node qfcode-evaluator-tests.js
 */

const { tokenize } = require('./qfcode-lexer.js');
const { parse }    = require('./qfcode-parser.js');
const { Evaluator, QFError, StopSignal, EMPTY, displayValue } = require('./qfcode-evaluator.js');

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

  const io = {
    print: (s) => output.push(s),
    erase: ()  => output.length = 0,
    input: async (prompt) => {
      output.push(`[INPUT] ${prompt}`);
      return inputs[inputIdx++] ?? '';
    },
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

await assertOutput('PRINT number',   'PRINT(42)',          ['42']);
await assertOutput('PRINT decimal',  'PRINT(3.14)',        ['3.14']);
await assertOutput('PRINT string',   'PRINT("Hello")',     ['Hello']);
await assertOutput('PRINT TRUE',     'PRINT(TRUE)',        ['TRUE']);
await assertOutput('PRINT FALSE',    'PRINT(FALSE)',       ['FALSE']);
await assertOutput('PRINT EMPTY var','VAR x\nPRINT(x)',   ['EMPTY']);

// ─── §4 Variables ─────────────────────────────────────────────────────────────

console.log('\n§4 Variables');

await assertOutput('VAR declaration and use', `
VAR score = 0
PRINT(score)
`, ['0']);

await assertOutput('Assignment', `
VAR score = 0
score = 100
PRINT(score)
`, ['100']);

await assertOutput('CONST use', `
CONST MAX_SCORE = 1000
PRINT(MAX_SCORE)
`, ['1000']);

await assertError('CONST reassignment is a runtime error', `
CONST MAX_SCORE = 1000
MAX_SCORE = 999
`, 'constant');

await assertError('Undeclared variable is a runtime error', `
PRINT(score)
`, "hasn't been declared");

await assertOutput('Reassign across types', `
VAR x = 10
x = "hello"
PRINT(x)
`, ['hello']);

await assertOutput('VAR with no init is EMPTY', `
VAR x
PRINT(x)
`, ['EMPTY']);

// ─── §5 Operators ─────────────────────────────────────────────────────────────

console.log('\n§5 Operators');

await assertOutput('Addition',          'PRINT(3 + 4)',   ['7']);
await assertOutput('Subtraction',       'PRINT(10 - 3)', ['7']);
await assertOutput('Multiplication',    'PRINT(3 * 4)',   ['12']);
await assertOutput('Division decimal',  'PRINT(7 / 2)',   ['3.5']);
await assertOutput('Integer division',  'PRINT(7 // 2)', ['3']);
await assertOutput('Modulo',            'PRINT(7 % 2)',   ['1']);

await assertOutput('Comparison >',  'PRINT(5 > 3)',   ['TRUE']);
await assertOutput('Comparison <',  'PRINT(3 < 5)',   ['TRUE']);
await assertOutput('Comparison ==', 'PRINT(5 == 5)',  ['TRUE']);
await assertOutput('Comparison !=', 'PRINT(5 != 3)',  ['TRUE']);
await assertOutput('Comparison >=', 'PRINT(5 >= 5)',  ['TRUE']);
await assertOutput('Comparison <=', 'PRINT(3 <= 5)',  ['TRUE']);

await assertOutput('AND both true',  'PRINT(TRUE AND TRUE)',   ['TRUE']);
await assertOutput('AND one false',  'PRINT(TRUE AND FALSE)',  ['FALSE']);
await assertOutput('OR one true',    'PRINT(FALSE OR TRUE)',   ['TRUE']);
await assertOutput('OR both false',  'PRINT(FALSE OR FALSE)',  ['FALSE']);
await assertOutput('NOT true',       'PRINT(NOT TRUE)',        ['FALSE']);
await assertOutput('NOT false',      'PRINT(NOT FALSE)',       ['TRUE']);
await assertOutput('XOR diff',       'PRINT(TRUE XOR FALSE)',  ['TRUE']);
await assertOutput('XOR same',       'PRINT(TRUE XOR TRUE)',   ['FALSE']);

await assertOutput('Unary minus',    'PRINT(-7)',  ['-7']);

await assertOutput('String concat',  'PRINT("Hello, " + "World")',    ['Hello, World']);
await assertOutput('String + number coerce', 'PRINT("score: " + 10)', ['score: 10']);
await assertOutput('String + bool coerce',   'PRINT("done: " + TRUE)', ['done: TRUE']);

await assertOutput('Precedence * before +', 'PRINT(1 + 2 * 3)', ['7']);
await assertOutput('Precedence parens',     'PRINT((1 + 2) * 3)', ['9']);
await assertOutput('Precedence AND before OR', `
VAR a = TRUE
VAR b = FALSE
VAR c = TRUE
PRINT(a OR b AND c)
`, ['TRUE']);

await assertError('Division by zero', 'PRINT(1 / 0)');
await assertError('Integer division by zero', 'PRINT(1 // 0)');
await assertError('Modulo by zero', 'PRINT(1 % 0)');
await assertError('String + number ambiguous raises error', 'PRINT("3" + 4)');

// ─── §6 Statements ────────────────────────────────────────────────────────────

console.log('\n§6 Statements');

await assertOutput('PRINT multi-arg space-separated', `
PRINT("Score:", 100, "points")
`, ['Score: 100 points']);

await assertOutput('PRINT empty string = blank line', `
PRINT("A")
PRINT("")
PRINT("B")
`, ['A', '', 'B']);

await assertOutput('ERASE clears output', `
PRINT("gone")
ERASE()
PRINT("fresh")
`, ['fresh']);

// ─── §7 Control Flow ─────────────────────────────────────────────────────────

console.log('\n§7 Control Flow');

await assertOutput('IF true branch', `
VAR score = 150
IF score > 100 THEN
  PRINT("High score!")
END IF
`, ['High score!']);

await assertOutput('IF false branch skipped', `
VAR score = 50
IF score > 100 THEN
  PRINT("High score!")
END IF
PRINT("Done")
`, ['Done']);

await assertOutput('IF ELSE', `
VAR score = 50
IF score > 100 THEN
  PRINT("High!")
ELSE
  PRINT("Low!")
END IF
`, ['Low!']);

await assertOutput('IF ELSE IF chain', `
VAR score = 85
IF score >= 90 THEN
  PRINT("A")
ELSE IF score >= 80 THEN
  PRINT("B")
ELSE IF score >= 70 THEN
  PRINT("C")
ELSE
  PRINT("D")
END IF
`, ['B']);

await assertOutput('WHILE loop', `
VAR count = 1
WHILE count <= 3
  PRINT(count)
  count = count + 1
END WHILE
`, ['1', '2', '3']);

await assertOutput('FOR loop', `
FOR i = 1 TO 3
  PRINT(i)
END FOR
`, ['1', '2', '3']);

await assertOutput('FOR STEP 2', `
FOR i = 0 TO 6 STEP 2
  PRINT(i)
END FOR
`, ['0', '2', '4', '6']);

await assertOutput('FOR STEP -1 countdown', `
FOR i = 3 TO 1 STEP -1
  PRINT(i)
END FOR
`, ['3', '2', '1']);

await assertOutput('FOR loop variable gone after END FOR', `
FOR i = 1 TO 1
  PRINT(i)
END FOR
VAR i = 99
PRINT(i)
`, ['1', '99']);

await assertOutput('FOR EACH array', `
VAR names = ["Alice", "Bob", "Charlie"]
FOR EACH name IN names
  PRINT(name)
END FOR
`, ['Alice', 'Bob', 'Charlie']);

await assertOutput('FOR EACH string chars', `
FOR EACH ch IN "abc"
  PRINT(ch)
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
PRINT(i)
`, ['3']);

await assertOutput('CONTINUE skips rest of iteration', `
FOR i = 1 TO 5
  IF i % 2 == 0 THEN
    CONTINUE
  END IF
  PRINT(i)
END FOR
`, ['1', '3', '5']);

await assertOutput('MATCH exact value', `
VAR score = 100
MATCH score
  WHEN 100
    PRINT("Perfect!")
  WHEN ELSE
    PRINT("Other")
END MATCH
`, ['Perfect!']);

await assertOutput('MATCH WHEN ELSE', `
VAR score = 42
MATCH score
  WHEN 100
    PRINT("Perfect!")
  WHEN ELSE
    PRINT("Not perfect")
END MATCH
`, ['Not perfect']);

await assertOutput('MATCH range', `
VAR score = 95
MATCH score
  WHEN 90 TO 99
    PRINT("Excellent!")
  WHEN ELSE
    PRINT("Other")
END MATCH
`, ['Excellent!']);

await assertOutput('MATCH stacked WHENs', `
VAR day = "Saturday"
MATCH day
  WHEN "Saturday"
  WHEN "Sunday"
    PRINT("Weekend!")
  WHEN ELSE
    PRINT("Weekday")
END MATCH
`, ['Weekend!']);

await assertOutput('MATCH no match no WHEN ELSE — silent', `
VAR x = 42
MATCH x
  WHEN 100
    PRINT("hundred")
END MATCH
PRINT("done")
`, ['done']);

// ─── §8 Functions ─────────────────────────────────────────────────────────────

console.log('\n§8 Functions');

await assertOutput('Basic function call', `
FUNCTION Greet(name)
  PRINT("Hello, " + name)
END FUNCTION
Greet("Alice")
`, ['Hello, Alice']);

await assertOutput('Function with RETURN', `
FUNCTION Add(a, b)
  RETURN a + b
END FUNCTION
PRINT(Add(3, 4))
`, ['7']);

await assertOutput('Function no params', `
FUNCTION ShowLine()
  PRINT("---")
END FUNCTION
ShowLine()
ShowLine()
`, ['---', '---']);

await assertOutput('Function implicit EMPTY return', `
FUNCTION Noop()
  VAR x = 1
END FUNCTION
VAR result = Noop()
PRINT(result)
`, ['EMPTY']);

await assertOutput('Local var not visible outside', `
FUNCTION F()
  VAR secret = 42
END FUNCTION
F()
VAR secret = 99
PRINT(secret)
`, ['99']);

await assertOutput('Global var visible inside function', `
VAR greeting = "Hi"
FUNCTION Greet(name)
  PRINT(greeting + ", " + name)
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
PRINT(score)
`, ['15']);

await assertOutput('Recursive factorial', `
FUNCTION Factorial(n)
  IF n <= 1 THEN
    RETURN 1
  END IF
  RETURN n * Factorial(n - 1)
END FUNCTION
PRINT(Factorial(5))
`, ['120']);

await assertOutput('Multiple function calls in expression', `
FUNCTION Double(x)
  RETURN x * 2
END FUNCTION
PRINT(Double(3) + Double(4))
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
PRINT(name)
`, ['[INPUT] Name: ', 'Alice'], ['Alice']);

await assertOutput('INPUT with NUM conversion', `
VAR age = NUM(INPUT("Age: "))
PRINT(age + 1)
`, ['[INPUT] Age: ', '26'], ['25']);

// ─── §10 Error Handling ───────────────────────────────────────────────────────

console.log('\n§10 Error Handling');

await assertOutput('ATTEMPT catches QFError', `
ATTEMPT
  PRINT(NUM("hello"))
ERROR
  PRINT("Caught!")
END ATTEMPT
`, ['Caught!']);

await assertOutput('ATTEMPT with error var', `
ATTEMPT
  PRINT(NUM("oops"))
ERROR msg
  PRINT("Error: " + msg)
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
  PRINT(Divide(10, 0))
ERROR msg
  PRINT("Caught: " + msg)
END ATTEMPT
`, ['Caught: Cannot divide by zero.']);

await assertOutput('ATTEMPT body runs on success', `
ATTEMPT
  VAR x = NUM("42")
  PRINT(x + 1)
ERROR
  PRINT("Error")
END ATTEMPT
`, ['43']);

await assertOutput('LAST_ERROR.MESSAGE set on error in ATTEMPT', `
ATTEMPT
  NUM("bad")
ERROR
  PRINT(LAST_ERROR.MESSAGE)
END ATTEMPT
`, ['"bad" cannot be converted to a number. Tip: Use NUM() only when you\'re sure the value is numeric.']);

// ─── §11 Arrays ───────────────────────────────────────────────────────────────

console.log('\n§11 Arrays');

await assertOutput('Array literal and indexing', `
VAR scores = [10, 20, 30]
PRINT(scores[0])
PRINT(scores[1])
PRINT(scores[2])
`, ['10', '20', '30']);

await assertOutput('Array index assignment', `
VAR scores = [10, 20, 30]
scores[1] = 99
PRINT(scores[1])
`, ['99']);

await assertOutput('ARRAY() empty', `
VAR arr = ARRAY()
PRINT(LENGTH(arr))
`, ['0']);

await assertOutput('ARRAY(n) pre-sized with EMPTY', `
VAR arr = ARRAY(3)
PRINT(LENGTH(arr))
PRINT(arr[0])
`, ['3', 'EMPTY']);

await assertOutput('APPEND', `
VAR scores = [10, 20]
APPEND(scores, 30)
PRINT(LENGTH(scores))
PRINT(scores[2])
`, ['3', '30']);

await assertOutput('REMOVE', `
VAR scores = [10, 20, 30]
REMOVE(scores, 1)
PRINT(LENGTH(scores))
PRINT(scores[0])
PRINT(scores[1])
`, ['2', '10', '30']);

await assertOutput('INSERT', `
VAR scores = [10, 30]
INSERT(scores, 1, 20)
PRINT(scores[0])
PRINT(scores[1])
PRINT(scores[2])
`, ['10', '20', '30']);

await assertOutput('CONTAINS array true', `
VAR scores = [10, 20, 30]
PRINT(CONTAINS(scores, 20))
`, ['TRUE']);

await assertOutput('CONTAINS array false', `
VAR scores = [10, 20, 30]
PRINT(CONTAINS(scores, 99))
`, ['FALSE']);

await assertOutput('REVERSE', `
VAR scores = [1, 2, 3]
REVERSE(scores)
PRINT(scores[0])
PRINT(scores[2])
`, ['3', '1']);

await assertOutput('SORT numbers', `
VAR scores = [30, 10, 20]
SORT(scores)
PRINT(scores[0])
PRINT(scores[1])
PRINT(scores[2])
`, ['10', '20', '30']);

await assertOutput('ERASE array empties it', `
VAR scores = [1, 2, 3]
ERASE(scores)
PRINT(LENGTH(scores))
`, ['0']);

await assertOutput('FOR loop with LENGTH', `
VAR scores = [10, 20, 30, 40]
VAR total = 0
FOR i = 0 TO LENGTH(scores) - 1
  total = total + scores[i]
END FOR
PRINT(total)
`, ['100']);

await assertError('Array out of range error', `
VAR scores = [10, 20]
PRINT(scores[5])
`, 'out of range');

// ─── §12 Standard Library ────────────────────────────────────────────────────

console.log('\n§12 Standard Library');

// Type conversion
await assertOutput('STR(42)', 'PRINT(STR(42))', ['42']);
await assertOutput('STR(TRUE)', 'PRINT(STR(TRUE))', ['TRUE']);
await assertOutput('NUM("42")', 'PRINT(NUM("42"))', ['42']);
await assertOutput('BOOL(1)', 'PRINT(BOOL(1))', ['TRUE']);
await assertOutput('BOOL(0)', 'PRINT(BOOL(0))', ['FALSE']);

// Type checking
await assertOutput('ISNUMBER true',  'PRINT(ISNUMBER(42))',    ['TRUE']);
await assertOutput('ISNUMBER false', 'PRINT(ISNUMBER("hi"))',  ['FALSE']);
await assertOutput('ISSTRING true',  'PRINT(ISSTRING("hi"))',  ['TRUE']);
await assertOutput('ISBOOL true',    'PRINT(ISBOOL(TRUE))',    ['TRUE']);
await assertOutput('ISEMPTY true',   'VAR x\nPRINT(ISEMPTY(x))', ['TRUE']);
await assertOutput('ISARRAY true',   'PRINT(ISARRAY([1,2]))', ['TRUE']);

// String functions
await assertOutput('LENGTH string',      'PRINT(LENGTH("hello"))',              ['5']);
await assertOutput('UPPER',              'PRINT(UPPER("hello"))',               ['HELLO']);
await assertOutput('LOWER',             'PRINT(LOWER("HELLO"))',               ['hello']);
await assertOutput('TRIM',              'PRINT(TRIM("  hi  "))',               ['hi']);
await assertOutput('CONTAINS string',   'PRINT(CONTAINS("hello", "ell"))',     ['TRUE']);
await assertOutput('REPLACE',           'PRINT(REPLACE("hello", "l", "r"))',   ['herro']);
await assertOutput('SPLIT',             'PRINT(SPLIT("a,b,c", ",")[1])',       ['b']);
await assertOutput('SUBSTRING',         'PRINT(SUBSTRING("hello", 1, 3))',     ['ell']);
await assertOutput('STARTSWITH true',   'PRINT(STARTSWITH("hello", "hel"))',   ['TRUE']);
await assertOutput('STARTSWITH false',  'PRINT(STARTSWITH("hello", "xyz"))',   ['FALSE']);
await assertOutput('ENDSWITH true',     'PRINT(ENDSWITH("hello", "llo"))',     ['TRUE']);

// String indexing
await assertOutput('String index [0]',  'PRINT("Alice"[0])', ['A']);
await assertOutput('String index [1]',  'PRINT("Alice"[1])', ['l']);
await assertError('String index out of range', 'PRINT("hi"[10])', 'out of range');

// Math
await assertOutput('ABS(-5)',         'PRINT(ABS(-5))',         ['5']);
await assertOutput('POW(2,8)',        'PRINT(POW(2, 8))',        ['256']);
await assertOutput('ROUND(3.6)',      'PRINT(ROUND(3.6))',       ['4']);
await assertOutput('FLOOR(3.9)',      'PRINT(FLOOR(3.9))',       ['3']);
await assertOutput('CEILING(3.1)',    'PRINT(CEILING(3.1))',     ['4']);
await assertOutput('SQRT(16)',        'PRINT(SQRT(16))',          ['4']);
await assertOutput('MIN(3,7)',        'PRINT(MIN(3, 7))',         ['3']);
await assertOutput('MAX(3,7)',        'PRINT(MAX(3, 7))',         ['7']);

{
  // RANDOMINT in range
  const { output } = await run('PRINT(RANDOMINT(1, 6))');
  const n = parseInt(output[0]);
  assert('RANDOMINT(1,6) in range 1-6', n >= 1 && n <= 6, `got ${output[0]}`);
}

{
  // RANDOM in [0,1)
  const { output } = await run('PRINT(RANDOM())');
  const n = parseFloat(output[0]);
  assert('RANDOM() returns 0-1', n >= 0 && n < 1, `got ${output[0]}`);
}

await assertError('NUM on non-numeric string', 'PRINT(NUM("hello"))', 'cannot be converted');
await assertError('SQRT of negative', 'PRINT(SQRT(-1))', 'negative');

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
  PRINT(Fib(i))
END FOR
`, ['0', '1', '1', '2', '3', '5', '8', '13']);

await assertOutput('FizzBuzz 1-15', `
FOR i = 1 TO 15
  IF i % 15 == 0 THEN
    PRINT("FizzBuzz")
  ELSE IF i % 3 == 0 THEN
    PRINT("Fizz")
  ELSE IF i % 5 == 0 THEN
    PRINT("Buzz")
  ELSE
    PRINT(i)
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
PRINT("Average:", avg)
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
  PRINT(v)
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
PRINT(ParseInt("42"))
PRINT(ParseInt("bad"))
`, ['42', '0']);

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
