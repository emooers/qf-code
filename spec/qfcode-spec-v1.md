# QF CODE Language Specification
## Version 1.0

**Created by Edison Mooers**
[edisonmooers.com](https://www.edisonmooers.com) | [quibblefox.com](https://www.quibblefox.com)

Copyright &copy; 2026 Edison Mooers. All rights reserved.

QF CODE is an original programming language designed and created by Edison Mooers. The language specification, syntax, keyword set, design decisions, and pedagogical approach contained in this document are the intellectual property of Edison Mooers. No portion of this specification may be reproduced, distributed, or used as the basis for a derivative language or product without express written permission from the author.

QF CODE is a trademark of Edison Mooers.

---

*QF CODE (Compute, Output, Display, Execute) is a programming language and browser-based learning environment under the QuibbleFox brand. It is a spiritual descendant of BASIC, redesigned for a modern audience with no historical baggage. Goal: teach fundamentals that transfer cleanly to any language a learner picks up next.*

---

## Section 1 — Philosophy

QF CODE is designed for the broadest possible audience — anyone curious about programming, regardless of age or background. Every decision in the language prioritizes clarity, consistency, and transferability over cleverness or brevity.

**Core principles:**
- If it's not on a standard keyboard, it's not in the language
- One way to do things, not five
- Errors are teaching moments, not failures
- Smart defaults, explicit escape hatches
- Keywords read like plain English
- What you learn here transfers everywhere else

---

## Section 2 — Lexical Rules

**2.1 Character set**
UTF-8 source. Keywords are ASCII only. Identifiers and string contents may include any Unicode character.

**2.2 Case sensitivity**
- Keywords are case-insensitive at the interpreter level — `print`, `PRINT`, and `Print` are all valid and treated identically
- The editor automatically uppercases recognized keywords as the user types — this is an editor behavior, not a language rule
- Variable and function names are case-insensitive (`score` and `SCORE` are the same variable)
- String contents are case-sensitive

**2.3 Whitespace**
Spaces and tabs are ignored between tokens. Indentation is encouraged but carries no semantic meaning.

**2.4 Line structure**
One statement per line. A logical line ends at a newline. No line continuation character in v1.

**2.5 Comments**
`//` to end of line. Valid anywhere on a line.
```
// This is a comment
PRINT("Hello")    // inline comment
```

**2.6 String literals**
Double-quoted only. Use `\"` for a literal double-quote inside a string.
```
PRINT("She said \"hello\"")
```

**2.7 Numeric literals**
Integer and decimal. No scientific notation in v1. Negative values via unary minus.
```
42
3.14
-7
```

**2.8 Identifiers**
Start with a letter, followed by letters, digits, or underscores. No length limit.
```
score
player_name
x
total2
```

**2.9 Operators**
```
+   -   *   /   //   %
=   ==   !=   <   >   <=   >=
(   )   [   ]   ,
```

---

## Section 3 — Data Types

QF CODE is dynamically typed. Variables hold values, not declared types. The interpreter tracks four distinct value types internally.

**3.1 Number**
One numeric type. No integer/float distinction exposed to the learner. Internally IEEE 754 double.
```
VAR x = 42
VAR y = 3.14
VAR z = -7
```

**3.2 String**
Sequence of characters, double-quoted. Supports index access (zero-based). Mutable via reassignment.
```
VAR name = "Alice"
PRINT(name[0])    // "A"
PRINT(name[1])    // "l"
```
Out of range index raises a friendly error:
```
name[10]    // Error: index 10 is out of range. "Alice" has 5 characters (0 to 4).
```

**3.3 Boolean**
`TRUE` and `FALSE` — uppercase keyword literals. Not 1 and 0. Not truthy. Explicit.
```
VAR done = FALSE
VAR valid = TRUE
```

Boolean expressions can be assigned directly:
```
VAR isWinner = score > 100
VAR isValid = age >= 18 AND age <= 65
```

**3.4 Empty**
`EMPTY` — the absence of a value. Result of declaring a variable without initializing it.
```
VAR x
PRINT(x)    // EMPTY
```

**3.5 Type Coercion**
QF CODE applies smart coercion when intent is unambiguous. Raises a friendly error when it is not.

*Unambiguous — coerces silently:*
```
"score: " + 10        // "score: 10"
"done: " + TRUE       // "done: TRUE"
IF 1 THEN             // treats 1 as TRUE
IF 0 THEN             // treats 0 as FALSE
```

*Ambiguous — friendly error:*
```
"3" + 4    // Error: did you want "34" or 7? Use NUM() or STR() to be explicit.
```

Explicit conversion functions are always available: `STR(x)` `NUM(x)` `BOOL(x)`

**3.6 Arrays**
Arrays are their own construct, covered in Section 11.

---

## Section 4 — Variables

**4.1 Declaration**
All variables must be declared with `VAR` before use. Using an undeclared variable is a runtime error with a friendly message.
```
VAR score = 0
VAR name = "Alice"
VAR done = FALSE
VAR x                  // declared, value is EMPTY
```

**4.2 Assignment**
After declaration, assign with `=`. No keyword required.
```
score = 100
name = "Bob"
```

**4.3 Naming rules**
- Must start with a letter
- Letters, digits, and underscores only
- Case-insensitive (`score` and `SCORE` are the same variable)
- No length limit
- Cannot be a reserved keyword

**4.4 Scope**
In v1, all variables declared at program level are program scope — visible everywhere after declaration. Variables declared inside a function are local to that function. See Section 8.

**4.5 Reassignment**
Variables are freely reassignable, including across types.
```
VAR x = 10
x = "hello"    // legal — QF CODE is dynamically typed
```

**4.6 Constants**
`CONST` declares a value that cannot be reassigned. Attempted reassignment raises a friendly error.
```
CONST MAX_SCORE = 1000
CONST APP_NAME = "My Game"

MAX_SCORE = 999    // Error: MAX_SCORE is a constant and cannot be changed.
```

---

## Section 5 — Operators

**5.1 Arithmetic**
| Operator | Meaning | Example |
|----------|---------|---------|
| `+` | Addition | `x + 3` |
| `-` | Subtraction | `x - 1` |
| `*` | Multiplication | `x * 2` |
| `/` | Division (always decimal) | `7 / 2` → `3.5` |
| `//` | Integer division | `7 // 2` → `3` |
| `%` | Modulo (remainder) | `7 % 2` → `1` |

Power is handled by the `POW(base, exponent)` function — no operator.

Division always returns a decimal. Integer division `//` is explicit when whole-number results are needed. This avoids the classic beginner confusion of `3 / 2 = 1`.

**5.2 Comparison**
| Operator | Meaning |
|----------|---------|
| `==` | Equal to |
| `!=` | Not equal to |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less than or equal to |
| `>=` | Greater than or equal to |

All comparison operators return `TRUE` or `FALSE`.

**5.3 Logical**
English keywords, not symbols.
```
AND   OR   NOT   XOR
```

`XOR` (exclusive or) evaluates to `TRUE` when exactly one operand is `TRUE`, but not both. Useful for toggle logic and mutual exclusion.

```
IF x > 0 AND x < 10 THEN
IF NOT done THEN
IF a XOR b THEN
```

**5.4 String operator**
`+` concatenates strings and smart-coerces numbers and booleans into strings per Section 3.5.
```
VAR greeting = "Hello, " + name
```

**5.5 Assignment**
`=` only. No compound assignment operators (`+=`, `-=`) in v1. Learners write it out explicitly:
```
score = score + 10
```

**5.6 Operator precedence** (high to low)
1. `NOT` (unary)
2. `*` `/` `//` `%`
3. `+` `-`
4. `<` `>` `<=` `>=`
5. `==` `!=`
6. `AND`
7. `XOR`
8. `OR`

When in doubt, use parentheses.

---

## Section 6 — Statements

**6.1 PRINT()**
Outputs values to the display panel. One line per call. Accepts multiple arguments, separated by a space.
```
PRINT("Hello, World!")
PRINT(score)
PRINT("Score:", score)
PRINT("High score:", MAX_SCORE, "points")
PRINT("")    // blank line
```

**6.2 INPUT()**
Displays a prompt and returns the user's typed value as a string.
```
VAR name = INPUT("What is your name? ")
VAR age = NUM(INPUT("How old are you? "))
```

**6.3 VAR / CONST**
See Section 4.

**6.4 Assignment**
```
score = score + 1
name = "Bob"
```

**6.5 ERASE()**
With no arguments, clears the display panel.
```
ERASE()
PRINT("Fresh start!")
```

**6.6 STOP()**
Halts program execution immediately.
```
STOP()
```

**6.7 Comments**
```
// This is a comment
PRINT("Hello")    // inline comment
```

---

## Section 7 — Control Flow

**7.1 IF / THEN / ELSE / END IF**
```
IF score > 100 THEN
    PRINT("High score!")
END IF

IF score > 100 THEN
    PRINT("High score!")
ELSE
    PRINT("Keep trying!")
END IF
```

`END IF` closes the block explicitly. Indentation is encouraged but carries no semantic meaning.

**7.2 ELSE IF**
```
IF score >= 90 THEN
    PRINT("A")
ELSE IF score >= 80 THEN
    PRINT("B")
ELSE IF score >= 70 THEN
    PRINT("C")
ELSE
    PRINT("Keep studying!")
END IF
```

**7.3 WHILE / END WHILE**
Repeats while a condition is true.
```
VAR count = 1
WHILE count <= 10
    PRINT(count)
    count = count + 1
END WHILE
```

**7.4 FOR / TO / STEP / END FOR**
Counted loop. The loop variable is auto-declared by FOR — no prior VAR needed. The loop variable ceases to exist after END FOR.
```
FOR i = 1 TO 10
    PRINT(i)
END FOR

FOR i = 0 TO 100 STEP 10
    PRINT(i)
END FOR

FOR i = 10 TO 1 STEP -1
    PRINT(i)
END FOR
```

**7.5 BREAK**
Exits the current loop immediately.
```
WHILE TRUE
    VAR answer = INPUT("Guess: ")
    IF answer == "42" THEN
        PRINT("Correct!")
        BREAK
    END IF
END WHILE
```

**7.6 CONTINUE**
Skips the rest of the current loop iteration and moves to the next.
```
FOR i = 1 TO 10
    IF i % 2 == 0 THEN
        CONTINUE
    END IF
    PRINT(i)
END FOR
```

**7.7 No GOTO**
Structured control flow only.

**7.8 MATCH / WHEN / WHEN ELSE / END MATCH**
Multi-branch matching against a single value. Stacked WHEN clauses share one block. WHEN ELSE is optional and always goes last. If no WHEN matches and there is no WHEN ELSE, nothing happens — no error.
```
MATCH score
    WHEN 100
        PRINT("Perfect!")
    WHEN 90 TO 99
        PRINT("Excellent!")
    WHEN 70 TO 89
        PRINT("Good job!")
    WHEN ELSE
        PRINT("Keep trying!")
END MATCH

MATCH day
    WHEN "Saturday"
    WHEN "Sunday"
        PRINT("Weekend!")
    WHEN ELSE
        PRINT("Weekday.")
END MATCH
```

---

## Section 8 — Functions

**8.1 Definition**
```
FUNCTION Greet(name)
    PRINT("Hello, " + name)
END FUNCTION
```

**8.2 Calling**
```
Greet("Alice")
```

**8.3 Return value**
`RETURN` exits the function and passes a value back to the caller. A function without RETURN returns EMPTY implicitly.
```
FUNCTION Add(a, b)
    RETURN a + b
END FUNCTION

VAR result = Add(3, 4)
PRINT(result)
```

**8.4 Multiple parameters**
```
FUNCTION FullName(first, last)
    RETURN first + " " + last
END FUNCTION

PRINT(FullName("Alice", "Smith"))
```

**8.5 No parameters**
```
FUNCTION ShowHeader()
    PRINT("================")
    PRINT("  MY PROGRAM")
    PRINT("================")
END FUNCTION

ShowHeader()
```

**8.6 Scope**
Variables declared inside a function with VAR are local to that function. Program-level variables are visible inside functions.
```
VAR greeting = "Hello"

FUNCTION Greet(name)
    VAR message = greeting + ", " + name
    PRINT(message)
END FUNCTION

Greet("Alice")
PRINT(message)    // Error: 'message' is not declared in this scope.
```

**8.7 Recursion**
Supported. No special syntax required.
```
FUNCTION Factorial(n)
    IF n <= 1 THEN
        RETURN 1
    END IF
    RETURN n * Factorial(n - 1)
END FUNCTION

PRINT(Factorial(5))    // 120
```

**8.8 Functions must be defined before use**
No hoisting. A function must appear in the source before it is called.

**8.9 Nested functions**
Not supported in v1. Functions cannot be defined inside other functions.
```
FUNCTION Outer()
    FUNCTION Inner()    // Error: functions cannot be defined inside other functions.
    END FUNCTION
END FUNCTION
```

**8.10 RETURN outside a function**
Raises a friendly error.
```
RETURN 10    // Error: RETURN can only be used inside a FUNCTION.
```

---

## Section 9 — Input and Output

**9.1 PRINT()**
Outputs values to the display panel. One line per call, newline appended automatically. Multiple arguments are separated by a single space. Smart coercion applies — no STR() required for numbers or booleans passed as arguments.
```
PRINT("Hello, World!")
PRINT(score)
PRINT("Score:", score)
PRINT("Name:", name, "Age:", age)
PRINT("")    // blank line
```

**9.2 INPUT()**
Displays a prompt and returns the user's input as a string.
```
VAR name = INPUT("What is your name? ")
VAR age = NUM(INPUT("How old are you? "))
```

**9.3 ERASE()**
Clears the display panel when called with no arguments.
```
ERASE()
PRINT("Fresh start!")
```

**9.4 STOP()**
Halts execution immediately.

**9.5 Formatting**
Concatenate values for precise combined output, or use multiple PRINT() arguments for space-separated output.
```
PRINT("Name: " + name + "  Age: " + STR(age))
PRINT("Name:", name, " Age:", age)
```

**9.6 Conversion functions**
| Function | Purpose | Example |
|----------|---------|---------|
| `STR(x)` | Convert to string | `STR(42)` → `"42"` |
| `NUM(x)` | Convert to number | `NUM("42")` → `42` |
| `BOOL(x)` | Convert to boolean | `BOOL(1)` → `TRUE` |

`NUM()` on a non-numeric string raises a friendly error:
```
NUM("hello")    // Error: "hello" cannot be converted to a number.
```

---

## Section 10 — Error Handling

**10.1 Philosophy**
QF CODE errors are teaching moments, not failures. Every error message names what went wrong, where it went wrong, and when possible, how to fix it.

Bad:
```
Runtime error: type mismatch
```

Good:
```
Error on line 7: "hello" cannot be converted to a number.
Tip: Use NUM() only when you're sure the value is numeric.
Try checking the value with INPUT() first and validating the result.
```

**10.2 Error categories**

*Syntax errors* — caught before the program runs.
```
Error on line 3: Missing END IF.
Every IF block needs a matching END IF.
```

*Runtime errors* — caught during execution.
```
Error on line 12: 'score' hasn't been declared.
Use VAR score = 0 to create it before using it.
```

*Logic hints* — non-fatal observations the fox coach may surface.
```
Hint: You declared 'total' but never used it. (line 5)
```

**10.3 ATTEMPT / ERROR / END ATTEMPT**
For programs that need to handle errors gracefully rather than halt.
```
ATTEMPT
    VAR age = NUM(INPUT("Enter your age: "))
    PRINT("You are", age, "years old.")
ERROR
    PRINT("That doesn't look like a number.")
END ATTEMPT
```

With optional message capture:
```
ATTEMPT
    VAR age = NUM(INPUT("Enter your age: "))
ERROR message
    PRINT("Problem:", message)
END ATTEMPT
```

`message` inside the ERROR block is a string containing the error description. Can be printed or ignored.

**10.4 SIGNAL**
Raises a custom error from within a function.
```
FUNCTION Divide(a, b)
    IF b == 0 THEN
        SIGNAL("Cannot divide by zero.")
    END IF
    RETURN a / b
END FUNCTION

ATTEMPT
    PRINT(Divide(10, 0))
ERROR message
    PRINT("Error:", message)
END ATTEMPT
```

**10.5 Error handling is optional**
Beginner programs do not need ATTEMPT/ERROR. Unhandled errors halt execution and display a friendly message in the output panel. ATTEMPT/ERROR is available when learners are ready for it.

**10.6 The fox coach**
Errors in lesson context are delivered conversationally by the fox coach rather than as raw error strings.
```
Fox: Looks like line 7 has a problem — "hello" can't be 
converted to a number. Want me to show you how NUM() works?
```

**10.7 LAST_ERROR**
A built-in object always available throughout the program. Updates automatically when an error occurs. Resets to empty values at the start of each new statement.

| Property | Type | Contains |
|----------|------|---------|
| `LAST_ERROR.MESSAGE` | String | Human-readable error description |
| `LAST_ERROR.LINE` | Number | Line number where the error occurred |
| `LAST_ERROR.CODE` | String | Short error code for programmatic use |

Default state (no error): MESSAGE is `""`, LINE is `0`, CODE is `""`.

```
VAR age = NUM(INPUT("Enter your age: "))
IF LAST_ERROR.MESSAGE != "" THEN
    PRINT("Problem:", LAST_ERROR.MESSAGE)
END IF
```

Works alongside ATTEMPT/ERROR:
```
ATTEMPT
    VAR age = NUM(INPUT("Enter your age: "))
ERROR
    PRINT("Problem on line", LAST_ERROR.LINE)
    PRINT(LAST_ERROR.MESSAGE)
END ATTEMPT
```

---

## Section 11 — Arrays

**11.1 Declaration**
```
VAR scores = ARRAY()            // empty dynamic array
VAR scores = ARRAY(10)          // pre-sized with 10 EMPTY slots
VAR scores = [10, 20, 30]       // literal initialization
VAR names = ["Alice", "Bob"]    // string array
VAR mixed = [1, "hello", TRUE]  // mixed types allowed
```

**11.2 Indexing**
Zero-based. First element is index 0.
```
VAR scores = [10, 20, 30]
PRINT(scores[0])    // 10
PRINT(scores[1])    // 20
PRINT(scores[2])    // 30
```

Accessing an index that does not exist raises a friendly error:
```
PRINT(scores[5])    // Error: index 5 is out of range. Array has 3 items (0 to 2).
```

**11.3 Assignment**
```
scores[0] = 99
names[1] = "Charlie"
```

**11.4 Built-in array functions**
| Function | Purpose | Example |
|----------|---------|---------|
| `LENGTH(array)` | Number of items | `LENGTH(scores)` → `3` |
| `APPEND(array, value)` | Add to end | `APPEND(scores, 40)` |
| `REMOVE(array, index)` | Remove at index | `REMOVE(scores, 0)` |
| `INSERT(array, index, value)` | Insert at index | `INSERT(scores, 1, 15)` |
| `CONTAINS(array, value)` | TRUE if value exists | `CONTAINS(scores, 20)` → `TRUE` |
| `ERASE(array)` | Remove all items | `ERASE(scores)` |
| `REVERSE(array)` | Reverse order in place | `REVERSE(scores)` |
| `SORT(array)` | Sort ascending in place | `SORT(scores)` |

**11.5 Iterating with FOR / TO**
```
VAR scores = [10, 20, 30, 40]
FOR i = 0 TO LENGTH(scores) - 1
    PRINT(scores[i])
END FOR
```

**11.6 FOR EACH / IN**
Cleaner iteration when the index is not needed. Loop variable is auto-declared. No prior VAR needed.
```
VAR names = ["Alice", "Bob", "Charlie"]
FOR EACH name IN names
    PRINT("Hello,", name)
END FOR
```

**11.7 Multi-dimensional arrays**
Not supported in v1.

---

## Section 12 — Standard Library

All built-in functions are globally available. No imports required.

**12.1 Output**
| Function | Purpose | Example |
|----------|---------|---------|
| `PRINT(value, ...)` | Print to display, space-separated | `PRINT("Score:", score)` |
| `ERASE()` | Clear display panel | `ERASE()` |

**12.2 Input**
| Function | Purpose | Example |
|----------|---------|---------|
| `INPUT(prompt)` | Prompt user, return string | `INPUT("Name: ")` |

**12.3 Type conversion**
| Function | Purpose | Example |
|----------|---------|---------|
| `STR(x)` | Convert to string | `STR(42)` → `"42"` |
| `NUM(x)` | Convert to number | `NUM("42")` → `42` |
| `BOOL(x)` | Convert to boolean | `BOOL(1)` → `TRUE` |

**12.4 String functions**
| Function | Purpose | Example |
|----------|---------|---------|
| `LENGTH(string)` | Character count | `LENGTH("hello")` → `5` |
| `UPPER(string)` | Uppercase | `UPPER("hello")` → `"HELLO"` |
| `LOWER(string)` | Lowercase | `LOWER("HELLO")` → `"hello"` |
| `TRIM(string)` | Remove leading/trailing whitespace | `TRIM("  hi  ")` → `"hi"` |
| `CONTAINS(string, substring)` | TRUE if found | `CONTAINS("hello", "ell")` → `TRUE` |
| `REPLACE(string, old, new)` | Replace all occurrences | `REPLACE("hello", "l", "r")` → `"herro"` |
| `SPLIT(string, delimiter)` | Split into array | `SPLIT("a,b,c", ",")` → `["a","b","c"]` |
| `SUBSTRING(string, start, length)` | Extract portion | `SUBSTRING("hello", 1, 3)` → `"ell"` |
| `STARTSWITH(string, prefix)` | TRUE if starts with | `STARTSWITH("hello", "hel")` → `TRUE` |
| `ENDSWITH(string, suffix)` | TRUE if ends with | `ENDSWITH("hello", "llo")` → `TRUE` |

**12.5 Math functions**
| Function | Purpose | Example |
|----------|---------|---------|
| `ABS(x)` | Absolute value | `ABS(-5)` → `5` |
| `POW(base, exp)` | Power | `POW(2, 8)` → `256` |
| `ROUND(x)` | Round to nearest integer | `ROUND(3.6)` → `4` |
| `FLOOR(x)` | Round down | `FLOOR(3.9)` → `3` |
| `CEILING(x)` | Round up | `CEILING(3.1)` → `4` |
| `SQRT(x)` | Square root | `SQRT(16)` → `4` |
| `MIN(a, b)` | Smaller of two values | `MIN(3, 7)` → `3` |
| `MAX(a, b)` | Larger of two values | `MAX(3, 7)` → `7` |
| `RANDOM()` | Random decimal 0 to 1 | `RANDOM()` → `0.472...` |
| `RANDOMINT(min, max)` | Random integer, inclusive both ends | `RANDOMINT(1, 6)` → `4` |

**12.6 Array functions**
| Function | Purpose | Example |
|----------|---------|---------|
| `LENGTH(array)` | Number of items | `LENGTH(scores)` → `3` |
| `APPEND(array, value)` | Add to end | `APPEND(scores, 10)` |
| `REMOVE(array, index)` | Remove at index | `REMOVE(scores, 0)` |
| `INSERT(array, index, value)` | Insert at index | `INSERT(scores, 1, 15)` |
| `CONTAINS(array, value)` | TRUE if value exists | `CONTAINS(scores, 20)` → `TRUE` |
| `ERASE(array)` | Remove all items | `ERASE(scores)` |
| `REVERSE(array)` | Reverse order in place | `REVERSE(scores)` |
| `SORT(array)` | Sort ascending in place | `SORT(scores)` |

**12.7 Type checking**
| Function | Purpose | Example |
|----------|---------|---------|
| `ISNUMBER(x)` | TRUE if number | `ISNUMBER(42)` → `TRUE` |
| `ISSTRING(x)` | TRUE if string | `ISSTRING("hi")` → `TRUE` |
| `ISBOOL(x)` | TRUE if boolean | `ISBOOL(TRUE)` → `TRUE` |
| `ISEMPTY(x)` | TRUE if EMPTY | `ISEMPTY(x)` → `TRUE` |
| `ISARRAY(x)` | TRUE if array | `ISARRAY([1,2])` → `TRUE` |

**12.8 Notes**
- `LENGTH()` and `CONTAINS()` work on both strings and arrays — type is detected automatically.
- `SORT()` and `REVERSE()` modify the array in place and also return it.
- `RANDOMINT(1, 6)` is inclusive on both ends — a six-sided die roll works exactly as written.
- `ERASE()` with no arguments clears the display panel. `ERASE(array)` empties the array.

---

## Section 13 — Program Structure

**13.1 Entry point**
QF CODE programs execute top to bottom. There is no special entry point function. The first executable statement runs first.

**13.2 Recommended structure**
A well-formed QF CODE program follows this order by convention:

1. Version marker comment
2. Constants
3. Variable declarations
4. Function definitions
5. Main program body

```
// QF CODE v1

CONST MAX_SCORE = 1000
CONST APP_NAME = "My Game"

VAR score = 0
VAR player = ""

FUNCTION ShowHeader()
    PRINT("================")
    PRINT(" " + APP_NAME)
    PRINT("================")
END FUNCTION

FUNCTION AddScore(points)
    score = score + points
    IF score > MAX_SCORE THEN
        score = MAX_SCORE
    END IF
END FUNCTION

ShowHeader()
player = INPUT("Enter your name: ")
PRINT("Welcome,", player)
AddScore(10)
PRINT("Score:", score)
```

**13.3 Functions must be defined before use**
No hoisting. Defining functions before the main program body is the natural pattern this encourages.

**13.4 Comments at program level**
Valid anywhere — top of file, inline, between functions, inside blocks.

**13.5 Empty programs**
A program with no executable statements is valid. It runs and produces no output.

**13.6 Version marker**
Optional comment on line 1 identifying the language version. No semantic effect. Used by editors and the fox coach to confirm compatibility.
```
// QF CODE v1
```

---

## Section 14 — Reserved Keywords

The following words are reserved and cannot be used as variable names, function names, or constants.

**Control flow**
```
IF  THEN  ELSE  END IF
WHILE  END WHILE
FOR  TO  STEP  NEXT  END FOR
FOR EACH  IN
MATCH  WHEN  WHEN ELSE  END MATCH
BREAK  CONTINUE
```

**Functions**
```
FUNCTION  END FUNCTION  RETURN
```

**Variables**
```
VAR  CONST
```

**Error handling**
```
ATTEMPT  ERROR  END ATTEMPT  SIGNAL
```

**Literals**
```
TRUE  FALSE  EMPTY
```

**Logical operators**
```
AND  OR  NOT  XOR
```

**Built-in functions**
```
PRINT  INPUT  ERASE  STOP
STR  NUM  BOOL
LENGTH  APPEND  REMOVE  INSERT  CONTAINS  REVERSE  SORT
ABS  POW  ROUND  FLOOR  CEILING  SQRT  MIN  MAX  RANDOM  RANDOMINT
UPPER  LOWER  TRIM  REPLACE  SPLIT  SUBSTRING  STARTSWITH  ENDSWITH
ISNUMBER  ISSTRING  ISBOOL  ISEMPTY  ISARRAY
ARRAY
```

**Built-in objects**
```
LAST_ERROR
```

**Reserved for future use**
```
CLASS  OBJECT  EXTENDS  NEW  THIS
IMPORT  EXPORT  MODULE
ASYNC  AWAIT
LIST  MAP  SET
```

---

*QF CODE v1 Language Specification — complete.*
*Next: interpreter architecture and implementation.*
