# QF CODE Language Specification
## Version 1.1

**Created by Edison Mooers**
[edisonmooers.com](https://www.edisonmooers.com) | [quibblefox.com](https://www.quibblefox.com)

Copyright &copy; 2026 Edison Mooers. All rights reserved.

QF CODE is an original programming language designed and created by Edison Mooers. The language specification, syntax, keyword set, design decisions, and pedagogical approach contained in this document are the intellectual property of Edison Mooers. No portion of this specification may be reproduced, distributed, or used as the basis for a derivative language or product without express written permission from the author.

QF CODE is a trademark of Edison Mooers.

---

## 0. Status, Scope, and Source of Truth

This document is the canonical QF CODE 1.1 language specification, maintained in the `emooers/qf-code` GitHub repository. It describes the language as implemented by the reference interpreter in `shell/qfcode.html`.

QF CODE 1.1 is also deployed as the browser IDE published at [gibiddapress.com/resources/qf-code/](https://gibiddapress.com/resources/qf-code/). That deployment is kept in sync with this specification and this repository's reference implementation; its own copy of this document defers to this one as canonical.

Source precedence for this specification:

1. The lexer, parser, and evaluator in this repository's reference shell (`shell/qfcode.html`) are authoritative.
2. This specification describes that implementation and is kept in sync with it deliberately, not by accident.
3. The feature backlog is non-normative. Features listed only in the backlog are not part of QF CODE 1.1 unless they are present in the authoritative implementation.

This specification covers:

- Source syntax and lexical rules
- Values, variables, constants, and scope
- Expressions and operators
- Statements and control flow
- Functions and recursion
- Arrays and strings
- Runtime errors and recoverable error handling
- The complete built-in library
- Sound output
- Execution limits
- The behavior of the reference browser editor and runner
- Known reference implementation divergences and edge cases

The keywords **must**, **must not**, **should**, and **may** describe requirements or recommendations. Sections labeled as implementation notes describe exact behavior of the supplied reference implementation, including behavior that may warrant correction in a later revision.

---


## 1. Language Purpose and Design

QF CODE stands for **Compute, Output, Display, Execute**. It is a programming language and browser-based learning environment under the QuibbleFox brand.

QF CODE is a spiritual descendant of BASIC, redesigned for modern learners without preserving historical syntax merely for compatibility.

Core design principles:

- Use characters available on a standard keyboard.
- Prefer one clear way to express a concept.
- Treat errors as teaching opportunities.
- Use readable English-like keywords.
- Keep syntax explicit where explicitness helps beginners.
- Teach concepts that transfer to other programming languages.
- Make common operations simple without hiding fundamental behavior.

---

## 2. Source Text and Lexical Structure

### 2.1 Source encoding

The reference editor operates on Unicode text. String literals and comments may contain Unicode characters.

Identifiers and keywords are limited to ASCII letters, digits, and underscores by the reference lexer.

### 2.2 Case sensitivity

Keywords are case-insensitive.

```qfcode
WRITELN("Hello")
writeln("Hello")
WriteLn("Hello")
```

All three calls are equivalent.

Identifiers are also case-insensitive. The interpreter normalizes variable and function names to uppercase internally.

```qfcode
VAR score = 10
WRITELN(SCORE)
```

String contents remain case-sensitive.

### 2.3 Identifiers

An identifier:

- Begins with an ASCII letter or underscore
- Continues with zero or more ASCII letters, digits, or underscores
- Is case-insensitive
- Cannot be a reserved keyword

Examples:

```qfcode
score
player_name
_total
value2
```

Equivalent names:

```qfcode
score
SCORE
Score
```

### 2.4 Whitespace

Spaces and tabs are ignored between tokens.

Indentation is encouraged for readability but has no semantic meaning.

Newlines are significant because statements are line-oriented.

Blank lines are permitted. The lexer collapses consecutive blank logical lines into newline separators as needed by the parser.

### 2.5 Statement lines

QF CODE uses one statement per logical line. Most statements must end at a newline or at the end of the file.

There is no semicolon statement separator and no line-continuation syntax in version 1.1.

### 2.6 Comments

A line beginning with `//` is a comment.

```qfcode
// This is a comment
```

Inline comments are supported in many common contexts.

```qfcode
WRITELN("Hello") // greeting
VAR count = 10   // starting value
```

The same token, `//`, is also the integer-division operator. The reference lexer uses context-sensitive rules to distinguish comments from integer division. See Appendix B for ambiguous cases in the current implementation.

Recommended practice:

- Use `//` at the beginning of a line for unambiguous comments.
- Use ordinary expressions on both sides of `//` for integer division.
- Avoid placing an inline comment immediately after an expression where it could be interpreted as division.

### 2.7 String literals

Strings use double quotes.

```qfcode
"Hello"
"QF CODE"
```

A literal double quote inside a string is written as `\"`.

```qfcode
WRITELN("She said \"hello\"")
```

Strings cannot span multiple source lines.

No other escape sequences are interpreted specially by the lexer. For example, `\n` is not converted into a newline character.

### 2.8 Numeric literals

QF CODE has decimal numeric literals.

Valid forms include:

```qfcode
0
42
3.14
1000.001
```

Negative values use unary minus:

```qfcode
-7
-3.5
```

The source grammar does not provide scientific notation, hexadecimal notation, leading-dot decimals such as `.5`, or trailing-dot decimals such as `5.`.

The `NUM()` conversion function may accept additional numeric string formats because it delegates conversion to the browser's numeric conversion rules. See Section 13.3.

### 2.9 Operators and punctuation

```text
+  -  *  /  //  %
=  ==  !=  <  >  <=  >=
(  )  [  ]  ,  .
```

The period operator is supported only for properties of `LAST_ERROR`.

### 2.10 Multi-word keywords

The following are recognized as single keyword tokens when written on one logical line with spaces or tabs between the words:

```text
FOR EACH
END FUNCTION
END WHILE
END IF
END FOR
END MATCH
END ATTEMPT
ELSE IF
WHEN ELSE
```

---

## 3. Program Structure and Execution

### 3.1 Entry point

A program begins execution at its first top-level executable statement and continues from top to bottom.

There is no required `MAIN()` function.

### 3.2 Function declaration pass

Before executing top-level statements, the interpreter scans all top-level statements and registers every top-level function declaration.

As a result, a top-level function may be called before its textual declaration.

```qfcode
WRITELN(Add(2, 3))

FUNCTION Add(a, b)
    RETURN a + b
END FUNCTION
```

Duplicate top-level function names are runtime errors.

### 3.3 Empty programs

An empty program is valid. In the reference editor, a successful run with no output displays `(no output)` as a shell message.

### 3.4 Version marker

A version marker is an optional comment and has no language-level effect.

```qfcode
// QF CODE v1.1
```

### 3.5 File extension

The reference editor uses `.qfc` for QF CODE source files.

---

## 4. Values and Data Types

QF CODE is dynamically typed. Variables hold values rather than declared static types.

The runtime recognizes five language value categories:

1. Number
2. String
3. Boolean
4. Array
5. Empty

`LAST_ERROR` is a special built-in object exposed only for error information. General object values are not part of version 1.1.

### 4.1 Number

QF CODE exposes one number type. The reference implementation uses JavaScript numbers, which are IEEE 754 double-precision floating-point values.

```qfcode
VAR count = 42
VAR price = 3.14
VAR offset = -7
```

### 4.2 String

A string is a sequence of UTF-16 code units in the reference runtime.

```qfcode
VAR name = "Alice"
```

Strings support zero-based index access.

```qfcode
WRITELN(name[0])
```

Strings are immutable. Individual string positions cannot be assigned.

### 4.3 Boolean

Boolean literals are `TRUE` and `FALSE`.

```qfcode
VAR ready = TRUE
VAR done = FALSE
```

Boolean values are not interchangeable with arbitrary numbers. Conditions accept booleans and also accept exactly `0` or `1` through QF CODE's narrow boolean coercion rule.

### 4.4 Empty

`EMPTY` represents the absence of a value.

A `VAR` declaration without an initializer receives `EMPTY`.

```qfcode
VAR result
WRITELN(result)
```

A function that finishes without executing `RETURN` also returns `EMPTY`.

Several mutating built-ins return `EMPTY`.

### 4.5 Array

An array is an ordered, mutable collection of values.

Arrays may contain values of different types, including other arrays.

```qfcode
VAR mixed = [1, "two", TRUE, EMPTY]
VAR matrix = [[1, 2], [3, 4]]
WRITELN(matrix[1][0])
```

Arrays are reference values. Assigning an array to another variable shares the same mutable array.

```qfcode
VAR a = [1, 2]
VAR b = a
APPEND(b, 3)
WRITELN(a) // [1, 2, 3]
```

### 4.6 Display representation

When values are written to the output panel or converted using `STR()`:

| Value | Display form |
|---|---|
| `TRUE` | `TRUE` |
| `FALSE` | `FALSE` |
| `EMPTY` | `EMPTY` |
| Number | Browser number string |
| String | Contents without quotes |
| Array | Bracketed, comma-and-space-separated values |

Example:

```qfcode
WRITELN([1, TRUE, "x", EMPTY])
```

Output:

```text
[1, TRUE, x, EMPTY]
```

---

## 5. Variables, Constants, and Scope

### 5.1 Variable declaration

A variable is declared with `VAR`.

```qfcode
VAR score = 0
VAR name = "Alice"
VAR pending
```

An omitted initializer produces `EMPTY`.

### 5.2 Constants

A constant is declared with `CONST` and must have an initializer.

```qfcode
CONST MAX_SCORE = 1000
```

A constant binding cannot be reassigned.

```qfcode
MAX_SCORE = 999 // runtime error
```

Constants protect the binding, not the contents of a referenced array. An array stored in a constant may still be mutated.

```qfcode
CONST values = [1, 2]
APPEND(values, 3) // permitted by the reference implementation
```

### 5.3 Assignment

Assignment uses `=`.

```qfcode
score = 100
name = "Bob"
values[0] = 99
```

Compound assignment operators such as `+=` and `-=` are not supported.

### 5.4 Declaration before access

A variable must exist when it is read or assigned.

```qfcode
score = 10 // error if score has not been declared
```

### 5.5 Scope model

QF CODE 1.1 has these runtime environments:

- One global environment
- One local environment for each function call
- One child environment for an `ERROR` handler

`IF`, `WHILE`, `FOR`, `FOR EACH`, and `MATCH` do not create general block scope.

A variable declared inside an `IF` or loop body is declared in the surrounding environment.

A function-local environment is chained to the global environment, not to the caller's local environment. QF CODE therefore does not provide closures or dynamic caller-scope lookup.

### 5.6 Global access from functions

Functions may read and assign global variables unless a local binding with the same name exists.

```qfcode
VAR score = 0

FUNCTION AddPoint()
    score = score + 1
END FUNCTION
```

### 5.7 Function locals

Parameters and variables declared inside a function are local to that invocation.

```qfcode
FUNCTION Double(value)
    VAR result = value * 2
    RETURN result
END FUNCTION
```

### 5.8 Same-scope redeclaration

The reference implementation treats declaration of an already-existing mutable name in the same environment as an update of that binding.

```qfcode
VAR x = 1
VAR x = 2
WRITELN(x) // 2
```

A binding that is already constant cannot be redeclared.

The current implementation retains the original mutability flag if `CONST` is used on an existing mutable binding. This is listed as a conformance concern in Appendix B.

### 5.9 Loop variables

`FOR` and `FOR EACH` auto-declare their loop variables in the current environment and delete those names when the loop ends.

Use a fresh loop variable name. In the current implementation, an existing mutable variable with the same name is overwritten for the loop and deleted afterward rather than restored.

---

## 6. Expressions and Operators

### 6.1 Operator precedence

From highest precedence to lowest:

1. Postfix indexing and property access: `[]`, `.`
2. Unary operators: `NOT`, unary `-`
3. Multiplication: `*`, `/`, `//`, `%`
4. Addition and subtraction: `+`, `-`
5. Relational comparison: `<`, `>`, `<=`, `>=`
6. Equality: `==`, `!=`
7. `AND`
8. `XOR`
9. `OR`

Binary operators at the same level associate from left to right.

Parentheses may override precedence.

### 6.2 Arithmetic operators

| Operator | Meaning |
|---|---|
| `+` | Numeric addition or string concatenation |
| `-` | Numeric subtraction |
| `*` | Numeric multiplication |
| `/` | Numeric division |
| `//` | Integer division, truncated toward zero |
| `%` | Remainder |

Division, integer division, and modulo by zero raise runtime errors.

`-`, `*`, `/`, `//`, and `%` require number operands.

### 6.3 Unary minus

Unary minus requires a number.

```qfcode
VAR offset = -10
```

### 6.4 Addition and concatenation

`Number + Number` performs arithmetic addition.

`String + String` concatenates.

A string may concatenate with a number, boolean, or `EMPTY`; the non-string value is converted to its display form.

```qfcode
"Score: " + 10
"Ready: " + TRUE
"Value: " + EMPTY
```

When one operand is a number and the other is a string that itself looks numeric, QF CODE treats the intent as ambiguous and raises an error.

```qfcode
"3" + 4 // error: use STR() or NUM() explicitly
```

Arrays cannot be concatenated with `+`.

### 6.5 Equality

`==` and `!=` use strict QF CODE equality.

- Numbers compare to numbers.
- Strings compare case-sensitively.
- Booleans compare to booleans.
- `EMPTY == EMPTY` is `TRUE`.
- `EMPTY` compared with any non-empty value is `FALSE`.
- Arrays are never equal by value, even when both operands refer to the same array.
- Values of different non-empty types are not equal.

### 6.6 Relational comparison

`<`, `>`, `<=`, and `>=` require operands of the same type.

They support:

- Number-to-number comparison
- String-to-string lexicographic comparison

They do not support booleans, arrays, or `EMPTY`.

### 6.7 Logical operators

```text
AND  OR  XOR  NOT
```

Logical operands must be booleans or the numbers `0` and `1`.

- `1` is accepted as true.
- `0` is accepted as false.
- Other numbers are not truthy and produce an error.
- Strings, arrays, and `EMPTY` are not truthy values.

`AND` and `OR` short-circuit.

`XOR` evaluates both operands and returns `TRUE` when exactly one is true.

`NOT` accepts a boolean or exactly `0` or `1`.

### 6.8 Indexing

Indexing uses zero-based whole-number indexes.

```qfcode
VAR names = ["Alice", "Bob"]
WRITELN(names[0])
WRITELN("hello"[1])
```

The index must be an integer number. Negative and out-of-range indexes raise errors.

Array positions may be assigned.

String positions may be read but not assigned.

### 6.9 Property access

Property access is supported only for:

```qfcode
LAST_ERROR.MESSAGE
LAST_ERROR.LINE
LAST_ERROR.CODE
```

Any other property access raises a runtime error.

---

## 7. Basic Statements

### 7.1 Variable declaration

```qfcode
VAR name = expression
VAR name
```

### 7.2 Constant declaration

```qfcode
CONST name = expression
```

A constant initializer is required.

### 7.3 Assignment

```qfcode
name = expression
array[index] = expression
```

### 7.4 Function-call statement

A user function or most built-ins may be called as a statement. A returned value is discarded.

```qfcode
Greet("Alice")
APPEND(values, 10)
SORT(values)
```

### 7.5 WRITE and WRITELN

```qfcode
WRITE(value, ...)
WRITELN(value, ...)
```

Both accept zero or more arguments. Arguments are evaluated from left to right and displayed with one space between arguments within the same call.

`WRITE()` appends text to the current open output line. Multiple consecutive `WRITE()` calls concatenate directly between calls.

In the reference shell, `WRITELN()` always creates a new complete output row. It does not append to a partially open `WRITE()` row.

```qfcode
WRITE("A")
WRITE("B")
WRITELN("C")
```

Reference shell output:

```text
AB
C
```

`WRITELN()` with no arguments creates a blank output line.

### 7.6 INPUT

```qfcode
VAR response = INPUT("Prompt: ")
```

`INPUT()` requires exactly one string prompt and pauses execution until the user enters text and presses Enter.

It returns a string.

### 7.7 ERASE

```qfcode
ERASE()
ERASE(array)
```

With no argument, `ERASE()` clears the output panel.

With an array argument, it removes all items from that array.

### 7.8 STOP

```qfcode
STOP()
```

The language-level intent is to halt the whole program immediately.

The supplied reference evaluator contains a defect for standalone `STOP()` statements. See Appendix B.

### 7.9 SIGNAL

```qfcode
SIGNAL(message)
```

`SIGNAL()` evaluates its argument, converts it using the host string conversion, and raises a QF CODE runtime error with that message.

The normal statement form requires exactly one expression.

### 7.10 RETURN

```qfcode
RETURN
RETURN expression
```

`RETURN` exits the current function. Without an expression, it returns `EMPTY`.

`RETURN` is valid only as meaningful control flow inside a function. The parser currently accepts it elsewhere, but the reference shell does not report that misuse cleanly. See Appendix B.

### 7.11 BREAK and CONTINUE

```qfcode
BREAK
CONTINUE
```

`BREAK` exits the nearest active loop.

`CONTINUE` skips the remainder of the current loop iteration.

Use outside a loop is invalid. The parser currently accepts these statements outside loops, but the reference shell does not report that misuse cleanly.

---

## 8. Conditional and Loop Control Flow

### 8.1 IF

```qfcode
IF condition THEN
    statements
END IF
```

With alternatives:

```qfcode
IF condition THEN
    statements
ELSE IF other_condition THEN
    statements
ELSE
    statements
END IF
```

Conditions use the boolean rules in Section 6.7.

Only the first matching branch executes.

### 8.2 WHILE

```qfcode
WHILE condition
    statements
END WHILE
```

The condition is evaluated before every iteration.

`BREAK` exits the loop. `CONTINUE` starts the next condition check.

The reference evaluator raises a runtime error after more than 10,000 completed `WHILE` iterations.

### 8.3 Counted FOR

```qfcode
FOR variable = start TO end
    statements
END FOR
```

Optional step:

```qfcode
FOR variable = start TO end STEP step_value
    statements
END FOR
```

Rules:

- `start`, `end`, and `step_value` are evaluated once before the loop.
- All three must be numbers.
- The range is inclusive.
- If `STEP` is omitted, the step is `1` when `start <= end`, otherwise `-1`.
- A zero step is an error.
- Decimal steps are permitted.
- The loop variable is auto-declared and removed when the loop exits.
- Assigning to the loop variable inside the body does not change the internal progression value used for the next iteration.
- The loop is limited to 10,000 iterations.

### 8.4 FOR EACH

```qfcode
FOR EACH item IN collection
    statements
END FOR
```

The collection must be an array or string.

The iterable expression is evaluated once.

The loop variable is auto-declared and removed afterward.

For arrays, iteration follows the reference runtime's live array iterator. Mutating the array during iteration may affect which items are subsequently visited.

For strings, iteration follows JavaScript string iteration, which yields Unicode code points. This differs from string indexing and `LENGTH()`, which use UTF-16 code units.

`BREAK` and `CONTINUE` are supported.

### 8.5 MATCH

```qfcode
MATCH subject
    WHEN value
        statements
    WHEN other_value
        statements
    WHEN ELSE
        statements
END MATCH
```

Stacked values may share one body:

```qfcode
MATCH day
    WHEN "Saturday"
    WHEN "Sunday"
        WRITELN("Weekend")
    WHEN ELSE
        WRITELN("Weekday")
END MATCH
```

Inclusive ranges are supported:

```qfcode
MATCH score
    WHEN 90 TO 100
        WRITELN("A")
    WHEN 80 TO 89
        WRITELN("B")
END MATCH
```

Rules:

- The subject is evaluated once.
- Value clauses use QF CODE equality.
- Range clauses are inclusive.
- The first matching clause executes.
- There is no fallthrough.
- `WHEN ELSE` is optional.
- If nothing matches and no `WHEN ELSE` exists, nothing happens.
- A range clause cannot be stacked with additional `WHEN` values in the same grouped clause.

The current range implementation uses the host runtime's `>=` and `<=` operations directly and does not apply the stricter type checks used by ordinary QF CODE relational operators.

---

## 9. Functions

### 9.1 Declaration

```qfcode
FUNCTION Name(parameter1, parameter2)
    statements
END FUNCTION
```

No-parameter function:

```qfcode
FUNCTION ShowHeader()
    WRITELN("Header")
END FUNCTION
```

### 9.2 Calling

```qfcode
ShowHeader()
VAR total = Add(2, 3)
```

Parentheses are required, including for zero-argument calls.

### 9.3 Parameters and arguments

Function parameters are mutable local variables.

The number of arguments must exactly match the number of declared parameters.

Arguments are evaluated from left to right in the caller's environment before the function-local environment is created.

### 9.4 Return values

```qfcode
FUNCTION Add(a, b)
    RETURN a + b
END FUNCTION
```

A function that reaches `END FUNCTION` without executing `RETURN` returns `EMPTY`.

### 9.5 Hoisting

All top-level functions are registered before top-level execution begins. Calls may appear before declarations.

### 9.6 Scope and closures

Each function call receives a new local environment whose parent is the global environment.

A function can access globals but cannot access local variables of its caller.

QF CODE 1.1 does not implement closures.

### 9.7 Recursion

Recursion is supported.

```qfcode
FUNCTION Factorial(n)
    IF n <= 1 THEN
        RETURN 1
    END IF
    RETURN n * Factorial(n - 1)
END FUNCTION
```

The reference evaluator limits nested function-call depth to 500.

### 9.8 Nested function declarations

Nested function declarations are not part of the supported language model.

The parser currently accepts a `FUNCTION` declaration inside another block, but the evaluator skips it without registering it. Calling that nested function later fails. See Appendix B.

---

## 10. Arrays

### 10.1 Creation

Array literal:

```qfcode
VAR values = [10, 20, 30]
```

Empty array:

```qfcode
VAR values = ARRAY()
```

Pre-sized array filled with `EMPTY`:

```qfcode
VAR values = ARRAY(10)
```

A trailing comma is accepted in an array literal.

```qfcode
VAR values = [1, 2, 3,]
```

### 10.2 Nested arrays

Nested arrays are supported.

```qfcode
VAR grid = [[1, 2], [3, 4]]
WRITELN(grid[0][1])
grid[1][0] = 9
```

### 10.3 Index access and assignment

Indexes must be whole numbers in the range `0` through `LENGTH(array) - 1`.

```qfcode
values[0] = 99
```

### 10.4 Mutation and aliasing

These operations mutate an existing array:

- Index assignment
- `APPEND()`
- `REMOVE()`
- `INSERT()`
- `ERASE(array)`
- `REVERSE()`
- `SORT()`

Array references are shared when assigned or passed to functions.

### 10.5 Array equality

Arrays never compare equal using `==`, including self-comparison.

```qfcode
VAR a = [1]
WRITELN(a == a) // FALSE
```

`CONTAINS(array, value)` uses the same equality rule. It therefore does not match array elements by structure or reference identity.

### 10.6 Sorting

`SORT(array)` mutates and returns the same array.

- When both compared elements are numbers, they are ordered numerically.
- Otherwise, their display strings are compared using the browser's locale-aware string comparison.

Mixed-type ordering may therefore depend on host locale and comparator pairings.

---

## 11. Strings

### 11.1 Indexing and length

String indexing and `LENGTH(string)` use UTF-16 code-unit positions in the reference runtime.

This means some Unicode characters, such as many emoji, occupy two positions.

### 11.2 Immutability

Strings cannot be changed through index assignment.

```qfcode
VAR word = "cat"
word[0] = "b" // error
```

Reassign the variable instead.

### 11.3 Comparison

String equality is case-sensitive.

Relational comparisons use the host runtime's ordinary string ordering.

### 11.4 String library

The standard library provides:

- `LENGTH`
- `UPPER`
- `LOWER`
- `TRIM`
- `CONTAINS`
- `REPLACE`
- `SPLIT`
- `SUBSTRING`
- `STARTSWITH`
- `ENDSWITH`

Detailed signatures appear in Section 13.

---

## 12. Error Handling

### 12.1 Error categories

The reference shell distinguishes:

- Lexer errors
- Parser errors
- QF CODE runtime errors
- Internal or unclassified errors

Lexer and parser errors occur before program execution and cannot be caught by QF CODE code.

### 12.2 ATTEMPT and ERROR

```qfcode
ATTEMPT
    statements
ERROR
    handler_statements
END ATTEMPT
```

Optional message capture:

```qfcode
ATTEMPT
    VAR age = NUM(INPUT("Age: "))
ERROR message
    WRITELN("Problem:", message)
END ATTEMPT
```

Rules:

- `ATTEMPT` catches QF CODE runtime errors represented by `QFError`.
- It does not catch syntax errors.
- It does not catch `BREAK`, `CONTINUE`, `RETURN`, or program-stop signals.
- The optional error variable contains the human-readable error message string.
- The handler runs in a child environment.
- New variables declared in the handler are local to that handler environment.
- Assignments in the handler may update names in enclosing environments.

### 12.3 SIGNAL

`SIGNAL(expression)` raises a QF CODE runtime error and may be caught by `ATTEMPT`.

### 12.4 LAST_ERROR

`LAST_ERROR` is always available and has exactly three readable properties:

| Property | Type | Meaning |
|---|---|---|
| `MESSAGE` | String | Error message |
| `LINE` | Number | QF CODE source line associated with the error |
| `CODE` | String | Short code; currently `ERR` for caught runtime errors |

Default values:

```text
MESSAGE = ""
LINE = 0
CODE = ""
```

The evaluator resets `LAST_ERROR` before each ordinarily executed statement.

When an `ATTEMPT` catches a runtime error, it populates `LAST_ERROR` and enters the top level of the `ERROR` handler without per-statement resets. Nested blocks invoked from the handler currently resume ordinary reset behavior, which can clear `LAST_ERROR`. See Appendix B.

For reliable error handling, the optional `ERROR message` variable is preferred when only the message is needed.

### 12.5 Unhandled errors

An unhandled QF CODE runtime error stops execution and is displayed by the shell with its source line when available.

---

## 13. Standard Library

All built-ins are globally available and case-insensitive. No import statement is required or supported.

Unless otherwise noted, arguments are evaluated from left to right.

### 13.1 Output, input, control, and sound

| Function | Signature | Return | Behavior |
|---|---|---|---|
| `WRITE` | `WRITE(value, ...)` | `EMPTY` when used as an expression | Space-joins values within the call and appends without opening a new output row |
| `WRITELN` | `WRITELN(value, ...)` | `EMPTY` when used as an expression | Space-joins values and creates a complete output row |
| `INPUT` | `INPUT(prompt)` | String | Requires a string prompt and waits for Enter |
| `ERASE` | `ERASE()` | `EMPTY` | Clears output |
| `ERASE` | `ERASE(array)` | `EMPTY` | Empties the array in place |
| `STOP` | `STOP()` | Does not return | Intended to halt the program |
| `SOUND` | `SOUND(pitch, duration_ms)` | `EMPTY` | Plays a blocking sine-wave tone |
| `BELL` | `BELL()` | `EMPTY` | Plays 880 Hz for 150 ms |

`SOUND()` pitch may be:

- A positive number interpreted as hertz
- A note-name string such as `"C4"`, `"A#3"`, `"Bb5"`, `"F♯4"`, or `"E♭3"`

Note names use equal temperament with A4 = 440 Hz. The parser accepts a letter A through G, an optional sharp or flat, and a signed one- or two-digit octave.

Duration must be a positive number of milliseconds.

Sound playback blocks program execution until the tone finishes.

### 13.2 Display conversion

#### STR

```qfcode
STR(value)
```

Returns the same display form used by output statements.

Examples:

```qfcode
STR(TRUE)      // "TRUE"
STR(EMPTY)     // "EMPTY"
STR([1, 2])    // "[1, 2]"
```

### 13.3 Numeric conversion

#### NUM

```qfcode
NUM(value)
```

Accepted input:

- Number: returned unchanged
- Boolean: `TRUE` becomes `1`, `FALSE` becomes `0`
- String: converted using the host JavaScript `Number()` operation

The host conversion means strings such as the following are accepted:

```qfcode
NUM("")       // 0
NUM("  ")     // 0
NUM("1e3")    // 1000
NUM("0x10")   // 16
```

A string that converts to `NaN` raises an error.

Arrays and `EMPTY` cannot be converted to numbers.

### 13.4 Boolean conversion

#### BOOL

```qfcode
BOOL(value)
```

Accepted true values:

- `TRUE`
- `1`
- `"TRUE"`
- `"true"`

Accepted false values:

- `FALSE`
- `0`
- `"FALSE"`
- `"false"`
- `EMPTY`

Other values raise an error. String matching is exact; mixed-case forms such as `"True"` are not accepted by the current implementation.

### 13.5 Type checks

| Function | Intended signature | Return |
|---|---|---|
| `ISNUMBER(value)` | One value | `TRUE` if number |
| `ISSTRING(value)` | One value | `TRUE` if string |
| `ISBOOL(value)` | One value | `TRUE` if boolean |
| `ISEMPTY(value)` | One value | `TRUE` if `EMPTY` |
| `ISARRAY(value)` | One value | `TRUE` if array |

The current evaluator does not enforce argument count for these five functions. See Appendix B.

### 13.6 Shared string and array functions

#### LENGTH

```qfcode
LENGTH(value)
```

Requires one string or array and returns its length.

#### CONTAINS

```qfcode
CONTAINS(collection, value)
```

For strings, both arguments must be strings and the test is case-sensitive substring search.

For arrays, the function tests each item using QF CODE equality.

### 13.7 String functions

| Function | Signature | Behavior |
|---|---|---|
| `UPPER` | `UPPER(string)` | Converts to uppercase using host string rules |
| `LOWER` | `LOWER(string)` | Converts to lowercase using host string rules |
| `TRIM` | `TRIM(string)` | Removes leading and trailing whitespace |
| `REPLACE` | `REPLACE(string, old, new)` | Replaces all occurrences of `old` |
| `SPLIT` | `SPLIT(string, delimiter)` | Returns an array of substrings |
| `SUBSTRING` | `SUBSTRING(string, start, length)` | Uses host `substr` semantics |
| `STARTSWITH` | `STARTSWITH(string, prefix)` | Case-sensitive prefix test |
| `ENDSWITH` | `ENDSWITH(string, suffix)` | Case-sensitive suffix test |

`SUBSTRING()` currently requires number types for `start` and `length` but does not require them to be whole or non-negative. Host `substr` conversion and negative-start behavior therefore apply.

The current evaluator does not enforce argument count for `UPPER`, `LOWER`, or `TRIM`. Extra arguments are evaluated and ignored; zero arguments produce a type error. See Appendix B.

### 13.8 Math functions

| Function | Signature | Behavior |
|---|---|---|
| `ABS` | `ABS(number)` | Absolute value |
| `POW` | `POW(base, exponent)` | Exponentiation |
| `ROUND` | `ROUND(number)` | Rounds using host `Math.round` |
| `FLOOR` | `FLOOR(number)` | Rounds toward negative infinity |
| `CEILING` | `CEILING(number)` | Rounds toward positive infinity |
| `SQRT` | `SQRT(number)` | Square root; negative input is an error |
| `MIN` | `MIN(a, b)` | Smaller number |
| `MAX` | `MAX(a, b)` | Larger number |
| `RANDOM` | `RANDOM()` | Random number in the interval `[0, 1)` |
| `RANDOMINT` | `RANDOMINT(min, max)` | Random whole number, inclusive at both ends |

`RANDOMINT()` requires whole-number bounds and requires `min <= max`.

The current evaluator does not enforce argument count for `ABS`, `ROUND`, `FLOOR`, `CEILING`, or `SQRT`. Extra arguments are evaluated and ignored; zero arguments produce a type error. See Appendix B.

### 13.9 Array functions

| Function | Signature | Return | Mutation |
|---|---|---|---|
| `ARRAY` | `ARRAY()` | New empty array | No |
| `ARRAY` | `ARRAY(size)` | New array filled with `EMPTY` | No |
| `APPEND` | `APPEND(array, value)` | `EMPTY` | Adds to end |
| `REMOVE` | `REMOVE(array, index)` | `EMPTY` | Removes existing item |
| `INSERT` | `INSERT(array, index, value)` | `EMPTY` | Inserts at index; index may equal length |
| `REVERSE` | `REVERSE(array)` | Same array | Reverses in place |
| `SORT` | `SORT(array)` | Same array | Sorts in place |
| `ERASE` | `ERASE(array)` | `EMPTY` | Removes all items |
| `LENGTH` | `LENGTH(array)` | Number | No |
| `CONTAINS` | `CONTAINS(array, value)` | Boolean | No |

`ARRAY(size)` requires a non-negative whole number.

`REMOVE()` requires an existing index from `0` through `length - 1`.

`INSERT()` accepts indexes from `0` through `length` inclusive.

---

## 14. Evaluation Order and Side Effects

### 14.1 Expression evaluation

Function and built-in arguments are evaluated from left to right.

Binary operands are normally evaluated left to right.

`AND` and `OR` may skip evaluation of the right operand because they short-circuit.

### 14.2 Mutation visibility

Arrays are passed by shared reference. Mutations performed by a function are visible to the caller.

### 14.3 Function registration

Top-level functions are registered before ordinary top-level execution, but global variable initializers and assignments still execute sequentially.

A function called before a required global variable has been declared will fail when it tries to access that variable.

---

## 15. Execution Limits and Interruption

### 15.1 Recursion limit

The reference evaluator allows up to 500 nested user-function calls. Exceeding the limit raises a stack-overflow error.

### 15.2 Loop limits

Each `WHILE` loop and counted `FOR` loop is limited to 10,000 iterations. When the limit is reached, the evaluator raises a runtime error that points to the loop and suggests checking its condition, range, or step value.

`FOR EACH` has no separate per-loop iteration counter. It normally terminates because it iterates a finite string or array, but it remains subject to the overall execution-step limit described below.

### 15.3 Total execution-step limit

A program is limited to 100,000 evaluator checkpoints per run. Checkpoints occur before each executable statement and at loop iteration boundaries. The limit protects the browser from programs that keep running through recursion, repeated calls, or control flow that does not trip a single loop's iteration limit.

### 15.4 Cooperative yielding and the editor Stop button

The evaluator yields control to the browser every 100 checkpoints. This allows the page to repaint and keeps the Stop button responsive during long-running programs.

The Stop button sets a request flag on the active evaluator. The flag is checked at executable-statement and loop boundaries, and again after each browser yield.

The flag is not checked during an active `INPUT()` or `SOUND()` wait. A current sound finishes before execution can continue to a check. A program waiting for input remains waiting until input is submitted.

This editor interruption behavior is separate from the language-level `STOP()` statement.

---

## 16. Reference Browser Editor and Runner

This section specifies the supplied editor shell, not the core language grammar.

### 16.1 Layout

The shell provides:

- A source editor panel
- An output panel
- A draggable desktop divider
- A toolbar
- A status bar

At viewport widths of 700 pixels or less, the editor and output panels stack vertically.

### 16.2 Editor engine

The source editor uses CodeMirror 6 and provides:

- Line numbers
- Active-line highlighting
- Undo and redo history
- Tab indentation
- Cursor line and column status
- QF CODE syntax highlighting
- Autocomplete
- Signature help

The editor does not rewrite keyword case while typing.

### 16.3 Syntax highlighting

The editor highlights:

- Keywords
- Built-ins
- Boolean and `EMPTY` literals
- Strings
- Numbers
- Operators
- Comments

The editor highlighter uses simpler token rules than the executable lexer. Highlighting is advisory and is not the authority for program validity.

### 16.4 Autocomplete

Autocomplete suggestions include:

- Single-word keywords
- Multi-word keywords
- `TRUE`, `FALSE`, and `EMPTY`
- Built-ins
- Names found by a whole-document scan of `VAR`, `CONST`, and `FUNCTION` declarations
- `LAST_ERROR.MESSAGE`, `.LINE`, and `.CODE` properties after `LAST_ERROR.`

Behavior:

- Suggestions appear automatically after at least two typed identifier characters.
- Explicit completion may bypass the two-character minimum.
- Tab and Enter accept the active suggestion.
- Callable built-ins insert parentheses and place the cursor between them.
- `LAST_ERROR` is inserted without parentheses.
- All-lowercase input produces lowercase keyword and built-in suggestions.
- Any uppercase character in the typed prefix produces canonical uppercase suggestions.
- User-declared names retain the casing found in the source.

Autocomplete uses a flat whole-document scan and is not scope-aware. Function parameters are not included in ordinary name completion.

### 16.5 Signature help

While the cursor is inside a recognized call, the editor shows:

- The function signature
- The active parameter
- Notes for selected built-ins
- A warning when a fixed-arity call appears to have too many arguments

Signature help supports:

- All callable built-ins
- User-defined functions discovered by a whole-document declaration scan
- Nested calls
- Array literals inside calls
- Strings and comments without miscounting their commas

Escape dismisses the signature tooltip until the cursor moves or the document changes.

The signature table represents intended built-in contracts. For several built-ins, the current runtime does not enforce the displayed arity. See Appendix B.

### 16.6 Running a program

Run behavior:

1. Clear the existing output.
2. Tokenize the entire source.
3. Parse the entire token stream.
4. Create a fresh evaluator and fresh global environment.
5. Execute the program.
6. Display elapsed time.

Keyboard shortcut:

```text
Ctrl+Enter on Windows and Linux
Cmd+Enter on macOS
```

Each run starts with fresh program variables and function definitions.

### 16.7 Output panel

The output panel:

- Numbers output rows
- Displays normal output, input echoes, errors, and shell messages
- Shows an inline text field for `INPUT()`
- Scrolls to new output automatically

To protect browser responsiveness, the renderer displays at most 1,000 output lines or 100,000 output characters per run. Additional output is hidden, but the program continues until it finishes, is stopped, or reaches another execution safeguard.

The Clear button clears output without changing source code.

### 16.8 New and Example

`New` asks for confirmation, replaces the editor with a short version comment, clears output, and resets file tracking to `untitled.qfc`.

`Example` replaces the editor with the built-in FizzBuzz example without confirmation, clears output, and resets file tracking.

### 16.9 Open and Save

The editor opens and saves `.qfc` text files.

On browsers supporting the File System Access API:

- Open uses a native file picker.
- Save can overwrite the currently tracked file without prompting again.

On browsers without that API:

- Open uses an HTML file input.
- Save downloads a new file each time.

The reference implementation has Open, Save, and a separate Save As button; Save As always prompts for a location, while Save overwrites the tracked file in place where the browser supports it.

### 16.10 Audio

The shell implements `SOUND()` and `BELL()` through the Web Audio API using a sine oscillator and a short gain envelope to reduce clicks.

Audio context startup depends on browser user-gesture rules. Clicking Run provides the expected user gesture in normal use.

---

## 17. Formal Grammar

The following EBNF describes the accepted structural language at a practical level. Lexical ambiguity between comments and integer division is discussed in Appendix B.

```ebnf
program          = { newline | statement }, EOF ;

statement        = var-declaration
                 | const-declaration
                 | assignment-or-call
                 | if-statement
                 | while-statement
                 | for-statement
                 | foreach-statement
                 | match-statement
                 | function-declaration
                 | return-statement
                 | break-statement
                 | continue-statement
                 | write-statement
                 | erase-statement
                 | stop-statement
                 | signal-statement
                 | attempt-statement
                 | builtin-call-statement ;

var-declaration  = "VAR", identifier, [ "=", expression ], line-end ;
const-declaration= "CONST", identifier, "=", expression, line-end ;

assignment-or-call
                 = identifier-postfix,
                   [ "=", expression ],
                   line-end ;

identifier-postfix
                 = identifier,
                   [ "(", [ argument-list ], ")" ],
                   { "[", expression, "]"
                   | ".", property-name } ;

if-statement     = "IF", expression, "THEN", line-end,
                   statement-list,
                   { "ELSE IF", expression, "THEN", line-end,
                     statement-list },
                   [ "ELSE", line-end, statement-list ],
                   "END IF", line-end ;

while-statement  = "WHILE", expression, line-end,
                   statement-list,
                   "END WHILE", line-end ;

for-statement    = "FOR", identifier, "=", expression,
                   "TO", expression,
                   [ "STEP", expression ], line-end,
                   statement-list,
                   "END FOR", line-end ;

foreach-statement= "FOR EACH", identifier, "IN", expression, line-end,
                   statement-list,
                   "END FOR", line-end ;

match-statement  = "MATCH", expression, line-end,
                   { when-group },
                   [ "WHEN ELSE", line-end, statement-list ],
                   "END MATCH", line-end ;

when-group       = when-range | when-values ;
when-range       = "WHEN", expression, "TO", expression, line-end,
                   statement-list ;
when-values      = "WHEN", expression, line-end,
                   { "WHEN", expression, line-end },
                   statement-list ;

function-declaration
                 = "FUNCTION", identifier, "(", [ parameter-list ], ")", line-end,
                   statement-list,
                   "END FUNCTION", line-end ;

parameter-list   = identifier, { ",", identifier } ;

return-statement = "RETURN", [ expression ], line-end ;
break-statement  = "BREAK", line-end ;
continue-statement
                 = "CONTINUE", line-end ;

write-statement  = ( "WRITE" | "WRITELN" ),
                   "(", [ argument-list ], ")", line-end ;

erase-statement  = "ERASE", "(", [ expression ], ")", line-end ;
stop-statement   = "STOP", "(", ")", line-end ;
signal-statement = "SIGNAL", "(", expression, ")", line-end ;

attempt-statement= "ATTEMPT", line-end,
                   statement-list,
                   "ERROR", [ identifier ], line-end,
                   statement-list,
                   "END ATTEMPT", line-end ;

expression       = or-expression ;
or-expression    = xor-expression, { "OR", xor-expression } ;
xor-expression   = and-expression, { "XOR", and-expression } ;
and-expression   = equality-expression, { "AND", equality-expression } ;
equality-expression
                 = comparison-expression,
                   { ( "==" | "!=" ), comparison-expression } ;
comparison-expression
                 = additive-expression,
                   { ( "<" | ">" | "<=" | ">=" ), additive-expression } ;
additive-expression
                 = multiplicative-expression,
                   { ( "+" | "-" ), multiplicative-expression } ;
multiplicative-expression
                 = unary-expression,
                   { ( "*" | "/" | "//" | "%" ), unary-expression } ;
unary-expression = [ "NOT" | "-" ], unary-expression
                 | postfix-expression ;

postfix-expression
                 = primary-expression,
                   { "[", expression, "]"
                   | ".", property-name } ;

primary-expression
                 = number
                 | string
                 | "TRUE"
                 | "FALSE"
                 | "EMPTY"
                 | array-literal
                 | "(", expression, ")"
                 | builtin-call
                 | "LAST_ERROR"
                 | identifier
                 | user-call ;

user-call        = identifier, "(", [ argument-list ], ")" ;
builtin-call     = builtin-name, "(", [ argument-list ], ")" ;
builtin-call-statement
                 = builtin-call, line-end ;
argument-list    = expression, { ",", expression } ;

array-literal    = "[", [ expression,
                   { ",", expression }, [ "," ] ], "]" ;

statement-list   = { newline | statement } ;
property-name    = identifier | keyword-token ;
line-end         = newline | EOF ;

identifier       = ( ASCII-letter | "_" ),
                   { ASCII-letter | digit | "_" } ;
number           = digit, { digit }, [ ".", digit, { digit } ] ;
string           = DQUOTE, { string-character | backslash, DQUOTE }, DQUOTE ;
newline          = line-feed ;
keyword-token    = any reserved keyword token ;
builtin-name     = any callable built-in name listed in Appendix A ;
```

When `assignment-or-call` has no `=`, its `identifier-postfix` must end as a function call. Parser context determines which block-closing keywords terminate each `statement-list`.

---

## 18. Reserved Words

All reserved words are case-insensitive.

### 18.1 Structural and control-flow words

```text
VAR CONST
IF THEN ELSE END
ELSE IF END IF
WHILE END WHILE
FOR FOR EACH TO STEP NEXT IN END FOR
MATCH WHEN WHEN ELSE END MATCH
BREAK CONTINUE
FUNCTION RETURN END FUNCTION
ATTEMPT ERROR END ATTEMPT SIGNAL
```

`NEXT` and the standalone `END` token are reserved but do not introduce executable constructs in the current parser.

### 18.2 Literals and logical operators

```text
TRUE FALSE EMPTY
AND OR NOT XOR
```

### 18.3 Built-ins and built-in object

```text
WRITE WRITELN INPUT ERASE STOP SOUND BELL
STR NUM BOOL
LENGTH APPEND REMOVE INSERT CONTAINS REVERSE SORT
ABS POW ROUND FLOOR CEILING SQRT MIN MAX RANDOM RANDOMINT
UPPER LOWER TRIM REPLACE SPLIT SUBSTRING STARTSWITH ENDSWITH
ISNUMBER ISSTRING ISBOOL ISEMPTY ISARRAY
ARRAY
LAST_ERROR
```

### 18.4 Reserved for future use

```text
CLASS OBJECT EXTENDS NEW THIS
IMPORT EXPORT MODULE
ASYNC AWAIT
LIST MAP SET
```

These words cannot be used as identifiers even though version 1.1 does not implement their proposed features.

---

## Appendix A. Complete Built-in Signature Index

```text
WRITE(value, ...)
WRITELN(value, ...)
INPUT(prompt)
ERASE()
ERASE(array)
STOP()
SOUND(pitch, duration_ms)
BELL()

STR(value)
NUM(value)
BOOL(value)

ISNUMBER(value)
ISSTRING(value)
ISBOOL(value)
ISEMPTY(value)
ISARRAY(value)

LENGTH(value)
UPPER(string)
LOWER(string)
TRIM(string)
CONTAINS(collection, value)
REPLACE(string, old, new)
SPLIT(string, delimiter)
SUBSTRING(string, start, length)
STARTSWITH(string, prefix)
ENDSWITH(string, suffix)

ABS(number)
POW(base, exponent)
ROUND(number)
FLOOR(number)
CEILING(number)
SQRT(number)
MIN(a, b)
MAX(a, b)
RANDOM()
RANDOMINT(min, max)

ARRAY()
ARRAY(size)
APPEND(array, value)
REMOVE(array, index)
INSERT(array, index, value)
REVERSE(array)
SORT(array)
```

---

## Appendix B. Reference Implementation Conformance Notes

This appendix records observable behavior in the authoritative HTML that is likely accidental, ambiguous, or inconsistent with the surrounding design. It is included so the specification does not hide implementation reality.

### B.1 Standalone STOP does not currently stop cleanly

The parser converts a standalone `STOP()` line into a `StopStmt`. The evaluator handles that node by throwing a `ReturnSignal`, not the dedicated `StopSignal` used by the runner.

Consequences:

- At top level, standalone `STOP()` reaches the runner as an unclassified object and is displayed as a generic error.
- Inside a user function, standalone `STOP()` behaves like `RETURN EMPTY` from that function.
- `STOP()` used inside another expression reaches the built-in implementation and throws the correct whole-program `StopSignal`.

This should be corrected before treating the reference shell as fully conformant to Section 7.8.

### B.2 RETURN, BREAK, and CONTINUE context errors are not validated

The parser accepts:

- `RETURN` at top level
- `BREAK` outside a loop
- `CONTINUE` outside a loop

Their internal control-flow objects may reach the runner and be displayed as `[object Object]` rather than as friendly QF CODE errors.

### B.3 Comment and integer-division ambiguity

The reference lexer uses a heuristic for `//`.

Important observed cases:

```qfcode
VAR x = 7 // 2       // integer division
VAR x = a // b       // integer division
VAR x = 7 // divisor // treated as an inline comment, not division
WRITELN("x") // note // treated as a comment
foo() // divisor     // treated as a comment after the closing parenthesis
```

The exact heuristic considers the token before `//` and the first token-like character after it. This produces cases where syntactically plausible integer division is consumed as a comment.

A future lexer revision should separate comment syntax from integer division more reliably or define a simpler unambiguous rule.

### B.4 CONST over an existing VAR does not create a constant

If a mutable name already exists, `CONST name = value` updates the value but retains the original mutable flag.

```qfcode
VAR x = 1
CONST x = 2
x = 3 // currently succeeds
```

### B.5 Existing loop-variable names are deleted

If a mutable variable already exists with the same name chosen for a `FOR` or `FOR EACH` variable, the loop reuses the binding and deletes it afterward.

The previous value is not restored.

### B.6 Nested function declarations are parsed but ignored

Only top-level function declarations are registered during evaluator startup. Any function declaration encountered inside another block is skipped during execution.

### B.7 Built-in arity gaps

The editor signature table documents one argument for these functions, but the evaluator does not check the count:

```text
ISNUMBER ISSTRING ISBOOL ISEMPTY ISARRAY
UPPER LOWER TRIM
ABS ROUND FLOOR CEILING SQRT
```

Observed behavior:

- Extra arguments are evaluated and ignored after the first.
- Missing arguments return `FALSE` for the five type checks.
- Missing arguments produce type errors for the string and math functions.

The expression-form implementation of `ERASE` accepts more than one argument when the first is an array, although the dedicated statement parser permits at most one.

The expression-form implementation of `STOP` does not validate argument count and does not evaluate supplied arguments before stopping.

### B.8 LAST_ERROR can be cleared inside nested handler blocks

The top-level statements of an `ERROR` handler run with automatic error resets disabled. However, an `IF`, loop, or other nested construct inside that handler calls ordinary block execution, which resets `LAST_ERROR` before nested statements.

```qfcode
ATTEMPT
    SIGNAL("bad")
ERROR
    IF TRUE THEN
        WRITELN(LAST_ERROR.MESSAGE) // currently prints an empty string
    END IF
END ATTEMPT
```

### B.9 WRITE and WRITELN row behavior differs from conventional stream output

Consecutive `WRITE()` calls share one row. A following `WRITELN()` creates a separate row instead of appending its text to the open WRITE row and then closing it.

This differs from the behavior described in the older draft specification.

### B.10 String units differ by operation

- Indexing and `LENGTH()` use UTF-16 code units.
- `FOR EACH` over a string yields Unicode code points.

An emoji may therefore count as length 2 but be visited once by `FOR EACH`.

### B.11 MATCH ranges bypass QF CODE comparison validation

Ordinary relational operators require matching number or string types. MATCH range checks use host `>=` and `<=` directly, which may coerce unlike types.

### B.12 Editor highlighter always treats `//` as a comment

The CodeMirror highlighter matches `//` through end of line before checking operators. Valid integer-division expressions may therefore be colored as comments even when the executable lexer interprets them as division.

---

## Appendix C. Features Not Present in the Authoritative Version 1.1 HTML

The supporting backlog and changelog discuss additional work. The following are not implemented in the authoritative HTML and are therefore not part of this specification:

- Language-level file reading or writing
- Canvas drawing or sprites
- `GETKEY()`
- `KEYPRESSED()`
- `WAIT()`
- Colored output controls
- Mobile keyword toolbar
- Modules and imports
- Classes and general objects
- Async functions and `AWAIT`
- Native list, map, or set types distinct from arrays

---

*End of QF CODE Language Specification, Version 1.1.*
