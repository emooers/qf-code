# QF Code

**QF Code** is a beginner-friendly, browser-based programming language designed to make
learning to code intuitive and enjoyable. Inspired by the simplicity of classic BASIC but
with a clean, modern syntax, QF Code removes the friction that discourages new programmers
— no semicolons, no curly braces, no cryptic symbols. Just English-like commands that do
what they say.

QF Code runs entirely in the browser. No installation. No compiler. No runtime to configure.
Open the shell and start writing.

---

## Features

- **English-like syntax** — keywords read as natural language
- **Case-insensitive** — write however feels comfortable
- **Full interpreter pipeline** — lexer, parser, and evaluator written in vanilla JavaScript
- **Browser shell** — CodeMirror 6 editor with syntax highlighting, inline input handling,
  and a clean split-pane output panel
- **Core language features** — variables, constants, conditionals, loops, functions,
  arrays, pattern matching, and error handling
- **No dependencies** — the shell is a single self-contained HTML file

---

## Language Quick Look

    VAR name = INPUT("What is your name? ")
    WRITE "Hello, " + name + "!"

    FOR i = 1 TO 5
        WRITE i + ": " + name
        WRITELN
    END FOR

---

## Repository Structure

    qf-code/
    ├── src/          # Lexer, parser, and evaluator
    ├── spec/         # Language specification
    ├── shell/        # Browser-based editor and runtime shell
    ├── demos/        # Example programs written in QF Code
    └── docs/         # Documentation (in progress)

---

## Status

Currently in active development. See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## License

Copyright 2026 Edison Mooers (edisonmooers.com). All rights reserved.

This source is made available for review and educational reference only.
Use, modification, or distribution requires written permission.
See [LICENSE](LICENSE) for details.
