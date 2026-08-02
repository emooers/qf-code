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

- **English-like syntax** — keywords read as natural language, everything takes parens
- **Case-insensitive** — write however feels comfortable
- **Full interpreter pipeline** — lexer, parser, and evaluator written in vanilla JavaScript
- **Browser shell** — CodeMirror 6 editor with syntax highlighting, autocomplete and
  signature-help tooltips, Search & Replace, Undo/Redo, inline `INPUT()` handling, and a
  clean split-pane output panel
- **Core language features** — variables, constants, conditionals, loops, functions,
  arrays, pattern matching, and error handling, plus `SOUND()`/`BELL()` audio output
- **No runtime dependencies** — the shell is a single self-contained HTML file; the
  browser-published deployment at gibiddapress.com bundles its own copy of the editor
  library so it never depends on a CDN being up

---

## Language Quick Look

    WRITELN("What's your name?")
    VAR name = INPUT("Name: ")
    WRITELN("Hello,", name, "— let's code!")

    FOR i = 1 TO 5
      WRITELN(i, ":", name)
    END FOR

Try it live: [gibiddapress.com/resources/qf-code](https://gibiddapress.com/resources/qf-code/),
or open `shell/qfcode.html` directly in a browser — no build step required.

---

## Repository Structure

    qf-code/
    ├── src/                       # Lexer, parser, and evaluator, split into modules
    │   ├── qfcode-lexer.js        #   tokenize(source) -> tokens
    │   ├── qfcode-parser.js       #   parse(tokens) -> AST
    │   ├── qfcode-evaluator.js    #   Evaluator, run against an AST + an io object
    │   ├── qfcode-bundle.js       #   the same three, concatenated for plain <script> use
    │   └── tests/                 #   node src/tests/qfcode-*-tests.js
    ├── spec/                      # Canonical language specification
    ├── shell/qfcode.html          # Authoritative browser IDE — see below
    ├── demos/                     # Example programs written in QF Code
    └── docs/                      # Architecture notes and project conventions

`shell/qfcode.html` is the authoritative source for the interpreter and the browser
shell. `src/` is a hand-mirrored split of the same Lexer/Parser/Evaluator, kept in sync
manually whenever `shell/qfcode.html` changes — there's no build step that generates one
from the other. If you're only changing shell/UI behavior, `shell/qfcode.html` is the only
file that needs to change; language-level changes need both.

---

## Running the tests

Each module has an independent, dependency-free test suite:

    node src/tests/qfcode-lexer-tests.js
    node src/tests/qfcode-parser-tests.js
    node src/tests/qfcode-evaluator-tests.js

Each prints a pass/fail count per assertion and exits non-zero if anything failed.

---

## Deployment

QF Code 1.1 ships in two places, kept deliberately in sync:

- This repository's `shell/qfcode.html` — the reference implementation, imports
  CodeMirror 6 from a CDN (`esm.sh`) at runtime for easy local development.
- [gibiddapress.com/resources/qf-code](https://gibiddapress.com/resources/qf-code/) —
  the public browser IDE, embedded in Edison Mooers's *Underneath the Syntax* companion
  site. Runs the same shell plus a thin, site-only layer for the book companion's example
  hand-off, with CodeMirror 6 bundled locally instead of pulled from a CDN.

`spec/qfcode-spec-v1.md` is the canonical specification for both.

---

## Status

QF Code 1.1. See [CHANGELOG.md](CHANGELOG.md) for version history and
[spec/qfcode-spec-v1.md](spec/qfcode-spec-v1.md) Appendix C for what's intentionally not
in this release yet.

---

## License

Copyright 2026 Edison Mooers (edisonmooers.com). All rights reserved.

This source is made available for review and educational reference only.
Use, modification, or distribution requires written permission.
See [LICENSE](LICENSE) for details.
