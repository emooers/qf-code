# Architecture

## Pipeline

QF Code is a straightforward three-stage interpreter, no bytecode or compilation step:

    source text --tokenize()--> tokens --parse()--> AST --Evaluator.run()--> program output

- **Lexer** (`tokenize(source)`) — a hand-written scanner, no regex-based tokenizer
  generator. Produces a flat array of `{ type, value, raw, line, col }` tokens. Handles
  the one genuinely tricky lexical rule in the language: disambiguating `//` as a
  line comment versus the integer-division operator, based on what token preceded it
  (see the comment block above that logic in `qfcode-lexer.js` for the full rule).
- **Parser** (`parse(tokens)`) — a hand-written recursive-descent parser producing a
  plain-object AST (documented in the JSDoc block at the top of `qfcode-parser.js`).
  No parser generator, no external grammar file — `qfcode-parser.js`'s own code is the
  grammar.
- **Evaluator** (`new Evaluator(io).run(ast)`) — a tree-walking interpreter. Control flow
  (`BREAK`/`CONTINUE`/`RETURN`/`SIGNAL`) is implemented by throwing and catching plain JS
  exceptions rather than a return-code protocol threaded through every call.

All I/O is mediated through an injected `io` object — `{ print, write, erase, input,
sound }` — so the same Evaluator runs identically against the browser shell's real DOM
output panel and against a plain in-memory array in the test suites (see
`src/tests/qfcode-evaluator-tests.js`'s `run()` helper for the test-side implementation).

## Execution safety

Because the Evaluator runs on the browser's main thread, an accidental infinite loop in
user code can freeze the tab. Two independent mechanisms guard against this:

- `MAX_ITERATIONS` (10,000) — a per-loop cap on `WHILE`/`FOR`/`FOR EACH` iterations.
- `MAX_EXECUTION_STEPS` (100,000) — a total-statements-executed cap, independent of
  loops, that also catches a runaway non-loop case like unbounded recursion.

Both are enforced by `Evaluator.checkpoint()`, called once per executed statement (via
`execBlock`) and once per loop iteration. `checkpoint()` also yields to the browser's real
event loop (a zero-delay `setTimeout`, not just an already-resolved-promise `await`) every
100 steps, so the Stop button and the rest of the UI stay responsive while a program runs.
`checkpoint()` cannot help while execution is sitting inside a blocking `SOUND()`/`BELL()`
call — there's no statement being executed for it to run between — which is why Stop
still can't cut off an in-progress tone. See `spec/qfcode-spec-v1.md` §15 for the
documented behavior and the project's backlog for the open work on that gap.

## `shell/qfcode.html` vs. `src/`

`shell/qfcode.html` is the authoritative source for both the interpreter and the browser
UI — it's a single self-contained HTML file with two inline `<script>` blocks: the
Lexer/Parser/Evaluator, then the CodeMirror 6 editor wiring. `src/qfcode-lexer.js`,
`qfcode-parser.js`, and `qfcode-evaluator.js` are a hand-mirrored split of the first
script block, kept in sync manually — there's no build step that generates one from the
other, so a language-level change needs to be made in both places. `qfcode-bundle.js` is
a plain concatenation of the same three files with no `require`s or exports, meant for
embedding QF Code in a non-browser-shell context via a single `<script>` tag.

## Relationship to gibiddapress.com

QF Code 1.1 is deployed in two places that are meant to run the same shell: this
repository's `shell/qfcode.html`, and the public browser IDE embedded at
[gibiddapress.com/resources/qf-code](https://gibiddapress.com/resources/qf-code/) as
part of Edison Mooers's *Underneath the Syntax* companion site. The two differ in exactly
two intentional ways:

1. **CodeMirror loading.** This repo's shell imports CodeMirror 6 from a CDN (`esm.sh`)
   at runtime, for zero-setup local development. The gibiddapress.com deployment bundles
   the same CodeMirror 6 packages locally with esbuild instead, so the live site has no
   runtime CDN dependency.
2. **Companion integration.** gibiddapress.com's copy carries a small, site-only layer on
   top of the shared shell — loading a book chapter's example program via a URL hash
   (`#example=...&run=1`), swapping the toolbar's "Companion" link for a chapter-specific
   back-link, and so on. This layer is wired directly against the real CodeMirror 6
   `EditorView` API the shared shell already exposes; it isn't part of the baseline shell
   itself and has no reason to exist in this repository.

`spec/qfcode-spec-v1.md` is the single canonical language specification for both
deployments; gibiddapress.com's copy of the spec is a synced duplicate that says so
explicitly in its own §0.
