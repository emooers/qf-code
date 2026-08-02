# Changelog

All notable changes to QF Code are documented here.

## [1.1.0] - 2026-08-02

QF Code 1.1 as implemented by the reference shell (`shell/qfcode.html`) and
now shared, byte-for-byte where the platform allows, with the browser IDE
published at gibiddapress.com. This release reconciles two independent
forks of the interpreter and shell that had diverged since 1.0 and brings
`src/` back in sync with both.

**Language:**
- `WRITE(...)` / `WRITELN(...)` replace `PRINT(...)`. `WRITE` prints its
  arguments without a trailing newline (so a following `WRITE` continues
  the same line); `WRITELN` always starts and completes its own line.
- `SOUND(pitch, duration_ms)` and `BELL()` — tone playback via the Web
  Audio API. `pitch` accepts either a frequency in Hz or a note name
  (`"C4"`, `"A#3"`, `"Bb5"`). Both block execution until the tone finishes,
  consistent with `INPUT()`'s existing blocking model.

**Evaluator / execution safety:**
- A cooperative `checkpoint()` guard now runs on every executed statement
  and every loop iteration, yielding to the browser's real event loop
  (not just the microtask queue) every 100 steps, so Stop and the rest of
  the UI stay responsive during a running program.
- `MAX_ITERATIONS` (the WHILE/FOR loop cap) lowered from 1,000,000 to
  10,000, paired with a new, independent `MAX_EXECUTION_STEPS` (100,000)
  ceiling that also catches long-running non-loop code (e.g. deep
  recursive calls) that an iteration cap alone wouldn't.
- Loop-limit error messages rewritten to be more pedagogical — they now
  explain what happened and what to check, not just that a limit was hit.
- Note: Stop is now effectively instant inside loops. It still cannot
  interrupt a blocking `SOUND()`/`BELL()` call already in progress (or a
  future `WAIT()`) — that requires a separate cancellation mechanism and
  remains open.

**Shell:**
- Output panel now caps at 1,000 lines / 100,000 characters, with an
  in-panel notice, so a runaway `WRITELN` loop can't balloon the DOM
  unbounded before Stop is pressed.
- Fixed: the shell's `ERASE()` handler cleared the output panel's content
  directly instead of calling the shared `clearOutput()`, so it skipped
  resetting the new output-cap counters and never restored the "press Run"
  empty-state placeholder.
- Toolbar: SVG icon redesign, a separate Save As button, Undo/Redo, and a
  Find toolbar button, alongside the CodeMirror 6 `@codemirror/search`
  panel (`Ctrl/Cmd+F`, case-insensitive by default with a match-case
  toggle, whole-word and regexp support).
- Autocomplete and VS Code-style signature-help tooltips for all built-ins
  and user-defined functions, including a `LAST_ERROR.<property>` special
  case.
- Open/Save via the File System Access API where supported, with a
  file-input/download fallback elsewhere.
- Editor no longer forcibly uppercases keywords while typing (removed —
  syntax highlighting alone conveys the convention; string contents were
  never touched by it either way).

**Deployment:**
- gibiddapress.com's QF Code IDE moved from CodeMirror 5 to CodeMirror 6
  (bundled locally with esbuild, no CDN dependency either way — the
  bundle is smaller than the CM5 files it replaces) and now runs the same
  merged shell as this repository, plus a thin, site-only layer for the
  Underneath the Syntax companion's example hand-off.
- `spec/qfcode-spec-v1.md` is the canonical QF Code 1.1 specification;
  gibiddapress.com's copy is a synced duplicate that defers to it.

**Not yet included** (tracked in the project backlog, unchanged by this
release): language-level `FILE READ`/`FILE WRITE`, `WAIT()` and the
SOUND/BELL/INPUT Stop-interruptibility fix that goes with it, canvas or
sprite graphics, `GETKEY()`/`KEYPRESSED()`, and `COLOR()`/`RESETCOLOR()`.

## [1.0.0] - 2026-06-16
Initial release of QF Code v1.0.

Includes:
- Lexer, parser, and evaluator (src/)
- Browser-based shell with CodeMirror 6 editor (shell/)
- Language specification v1.0 (spec/)
- Demo programs (demos/)
