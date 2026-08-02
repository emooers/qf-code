/**
 * QF CODE Lexer
 * Tokenizes QF CODE source into a flat array of typed tokens.
 * 
 * Token shape: { type: string, value: any, raw: string, line: number, col: number }
 *
 * Token types:
 *   KEYWORD       — reserved keyword (normalized to UPPERCASE)
 *   IDENTIFIER    — variable/function name (normalized to UPPERCASE internally)
 *   NUMBER        — numeric literal (value is JS number)
 *   STRING        — string literal (value is the string content, without quotes)
 *   OPERATOR      — single or multi-char operator
 *   NEWLINE       — logical line separator (one per logical line end)
 *   EOF           — end of input
 */

// ─── Keyword Sets ─────────────────────────────────────────────────────────────

// Multi-word keywords that must be recognized as single tokens.
// Order matters — longer matches must come first.
const MULTI_WORD_KEYWORDS = [
  'FOR EACH',
  'END FUNCTION',
  'END WHILE',
  'END IF',
  'END FOR',
  'END MATCH',
  'END ATTEMPT',
  'ELSE IF',
  'WHEN ELSE',
];

// Single-word keywords (all uppercase for comparison)
const SINGLE_KEYWORDS = new Set([
  'VAR', 'CONST',
  'IF', 'THEN', 'ELSE', 'END',
  'WHILE',
  'FOR', 'TO', 'STEP', 'NEXT', 'IN',
  'MATCH', 'WHEN',
  'BREAK', 'CONTINUE',
  'FUNCTION', 'RETURN',
  'ATTEMPT', 'ERROR', 'SIGNAL',
  'TRUE', 'FALSE', 'EMPTY',
  'AND', 'OR', 'NOT', 'XOR',
  'WRITE', 'WRITELN', 'INPUT', 'ERASE', 'STOP',
  'SOUND', 'BELL',
  'STR', 'NUM', 'BOOL',
  'LENGTH', 'APPEND', 'REMOVE', 'INSERT', 'CONTAINS', 'REVERSE', 'SORT',
  'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
  'RANDOM', 'RANDOMINT',
  'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SPLIT', 'SUBSTRING',
  'STARTSWITH', 'ENDSWITH',
  'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY',
  'ARRAY',
  'LAST_ERROR',
  // Reserved for future use
  'CLASS', 'OBJECT', 'EXTENDS', 'NEW', 'THIS',
  'IMPORT', 'EXPORT', 'MODULE',
  'ASYNC', 'AWAIT',
  'LIST', 'MAP', 'SET',
]);

// Operators — longest first to ensure greedy matching
const OPERATORS = [
  '//', '<=', '>=', '==', '!=',
  '+', '-', '*', '/', '%',
  '=', '<', '>',
  '(', ')', '[', ']', ',', '.',
];

// ─── Lexer ─────────────────────────────────────────────────────────────────────

class LexerError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'LexerError';
    this.line = line;
    this.col = col;
  }
}

/**
 * Tokenizes a QF CODE source string.
 * @param {string} source
 * @returns {Array<{type: string, value: any, raw: string, line: number, col: number}>}
 * @throws {LexerError}
 */
function tokenize(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  function col() {
    return pos - lineStart + 1;
  }

  function peek(offset = 0) {
    return source[pos + offset];
  }

  function current() {
    return source[pos];
  }

  function advance() {
    const ch = source[pos++];
    if (ch === '\n') {
      line++;
      lineStart = pos;
    }
    return ch;
  }

  function remaining() {
    return source.slice(pos);
  }

  // ── Skip spaces/tabs (not newlines — those are significant) ──────────────
  function skipWhitespace() {
    while (pos < source.length && (current() === ' ' || current() === '\t')) {
      advance();
    }
  }

  // ── Comment: // to end of line ───────────────────────────────────────────
  function skipLineComment() {
    while (pos < source.length && current() !== '\n') {
      advance();
    }
  }

  // ── String literal ───────────────────────────────────────────────────────
  function readString() {
    const startLine = line;
    const startCol = col();
    advance(); // consume opening "
    let value = '';
    let raw = '"';

    while (pos < source.length) {
      const ch = current();
      if (ch === '\\' && peek(1) === '"') {
        value += '"';
        raw += '\\"';
        advance(); advance();
      } else if (ch === '"') {
        raw += '"';
        advance(); // consume closing "
        return { type: 'STRING', value, raw, line: startLine, col: startCol };
      } else if (ch === '\n') {
        throw new LexerError(
          `Unterminated string literal starting at line ${startLine}, col ${startCol}.`,
          startLine, startCol
        );
      } else {
        value += ch;
        raw += ch;
        advance();
      }
    }

    throw new LexerError(
      `Unterminated string literal starting at line ${startLine}, col ${startCol}.`,
      startLine, startCol
    );
  }

  // ── Numeric literal ──────────────────────────────────────────────────────
  function readNumber() {
    const startLine = line;
    const startCol = col();
    let raw = '';
    let hasDot = false;

    while (pos < source.length) {
      const ch = current();
      if (ch >= '0' && ch <= '9') {
        raw += ch;
        advance();
      } else if (ch === '.' && !hasDot && peek(1) >= '0' && peek(1) <= '9') {
        hasDot = true;
        raw += ch;
        advance();
      } else {
        break;
      }
    }

    return { type: 'NUMBER', value: parseFloat(raw), raw, line: startLine, col: startCol };
  }

  // ── Identifier or keyword ────────────────────────────────────────────────
  // Returns the identifier text (normalized to uppercase for comparison).
  // After reading one word, checks if the next word(s) form a multi-word keyword.
  function readWord() {
    const startLine = line;
    const startCol = col();
    let raw = '';

    while (pos < source.length) {
      const ch = current();
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
          (ch >= '0' && ch <= '9') || ch === '_') {
        raw += ch;
        advance();
      } else {
        break;
      }
    }

    const upper = raw.toUpperCase();

    // Check for multi-word keyword match.
    // We look ahead past whitespace for the next word and try all combinations.
    for (const mw of MULTI_WORD_KEYWORDS) {
      if (!mw.startsWith(upper + ' ')) continue;
      const suffix = mw.slice(upper.length + 1); // e.g. "EACH", "IF", "WHILE"
      
      // Save position in case we don't match
      const savedPos = pos;
      const savedLine = line;
      const savedLineStart = lineStart;

      // Skip spaces/tabs (not newlines)
      let spaceSkipped = 0;
      while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t')) {
        pos++;
        spaceSkipped++;
      }

      // Read next word
      let nextWord = '';
      while (pos < source.length) {
        const ch = source[pos];
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9') || ch === '_') {
          nextWord += ch;
          pos++;
        } else {
          break;
        }
      }

      if (nextWord.toUpperCase() === suffix) {
        // Matched! But check for 3-word keywords (END IF, END FOR, etc.)
        // All our multi-word keywords are exactly 2 words, so we're done.
        const fullRaw = raw + ' ' + nextWord;
        return { type: 'KEYWORD', value: mw, raw: fullRaw, line: startLine, col: startCol };
      }

      // No match — restore position
      pos = savedPos;
      line = savedLine;
      lineStart = savedLineStart;
    }

    // Single word — keyword or identifier
    if (SINGLE_KEYWORDS.has(upper)) {
      return { type: 'KEYWORD', value: upper, raw, line: startLine, col: startCol };
    }

    // Identifier — store normalized (uppercase) value per spec (case-insensitive names)
    return { type: 'IDENTIFIER', value: upper, raw, line: startLine, col: startCol };
  }

  // ── Operator ─────────────────────────────────────────────────────────────
  function readOperator() {
    const startLine = line;
    const startCol = col();

    for (const op of OPERATORS) {
      if (source.startsWith(op, pos)) {
        pos += op.length;
        // Adjust line tracking for multi-char ops (they're all single-line)
        return { type: 'OPERATOR', value: op, raw: op, line: startLine, col: startCol };
      }
    }

    const ch = advance();
    throw new LexerError(
      `Unexpected character '${ch}' at line ${startLine}, col ${startCol}.`,
      startLine, startCol
    );
  }

  // ─── Main loop ────────────────────────────────────────────────────────────
  // Track whether we've emitted a meaningful (non-NEWLINE) token on the current
  // logical line. Used to disambiguate // (comment vs. integer division).
  let meaningfulOnLine = false;

  while (pos < source.length) {
    skipWhitespace();

    if (pos >= source.length) break;

    const ch = current();
    const startLine = line;
    const startCol = col();

    // Comment vs integer-division disambiguation:
    //
    // "//" has two meanings in QF Code: comment (to end of line) and integer division.
    //
    // Cases where // is ALWAYS a comment:
    //   (a) !meaningfulOnLine — nothing on this line yet (line-start comment)
    //   (b) last token was STRING, ')', or ']' — these close an expression cleanly,
    //       and // can only be a comment after them (strings and closed calls can't
    //       be the left side of a division that a user would write)
    //
    // Cases where // might be division — last token was NUMBER or IDENTIFIER:
    //   7 // 2          → division  (digit after //)
    //   x // y          → division  (identifier after //)
    //   RETURN 42 // comment  → comment  (reserved non-expression keyword after //)
    //
    // To distinguish, we peek past the // and any spaces to see what follows:
    //   - digit or '-' or '('  → DIVISION
    //   - identifier/keyword word → read it; if it's a plain IDENTIFIER (not reserved)
    //     or an expression-start keyword (TRUE/FALSE/NOT/builtins) → DIVISION;
    //     otherwise (reserved keyword that can't start an expression) → COMMENT
    //   - newline / EOF / anything else → COMMENT
    if (ch === '/' && peek(1) === '/') {
      const lastTok = tokens[tokens.length - 1];
      let isComment;

      if (!meaningfulOnLine) {
        // Nothing meaningful on line yet → always a comment
        isComment = true;
      } else if (!lastTok || lastTok.type === 'STRING' || lastTok.type === 'KEYWORD') {
        // After a string or a keyword (TRUE/FALSE/EMPTY/etc.) → comment
        isComment = true;
      } else if (lastTok.type === 'OPERATOR' &&
                 (lastTok.value === ')' || lastTok.value === ']')) {
        // After a closing bracket → comment
        isComment = true;
      } else {
        // Last token was NUMBER or IDENTIFIER — peek past // to decide.
        let p = pos + 2;
        while (p < source.length && (source[p] === ' ' || source[p] === '\t')) p++;
        const nc = source[p];

        if (nc === undefined || nc === '\n') {
          isComment = true;  // nothing follows // → comment
        } else if ((nc >= '0' && nc <= '9') || nc === '-' || nc === '(') {
          // Digit, unary minus, or open-paren → clearly a division operand
          isComment = false;
        } else if ((nc >= 'a' && nc <= 'z') || (nc >= 'A' && nc <= 'Z') || nc === '_') {
          // Read the word that follows //
          let word = '', q = p;
          while (q < source.length && (
            (source[q] >= 'a' && source[q] <= 'z') ||
            (source[q] >= 'A' && source[q] <= 'Z') ||
            (source[q] >= '0' && source[q] <= '9') || source[q] === '_')) {
            word += source[q++];
          }
          const upper = word.toUpperCase();

          if (lastTok.type === 'NUMBER') {
            // After a number literal, // is division ONLY if the RHS starts with a digit,
            // '-', or '(' (handled above). A word after a number-literal // is always a
            // comment — "RETURN 42 // note" and "VAR x = 10 // init" are comments.
            // Trade-off: "42 // myVar" is ambiguous; we choose comment (more common intent).
            isComment = true;
          } else {
            // After an IDENTIFIER: "x // y" is division (identifier RHS),
            // but "x // THIS" is a comment (reserved non-expression keyword).
            if (!SINGLE_KEYWORDS.has(upper)) {
              // Plain identifier → x // y → division
              isComment = false;
            } else {
              // Reserved keyword — is it one that can validly start an expression?
              const EXPR_START_KW = new Set([
                'TRUE', 'FALSE', 'EMPTY', 'NOT',
                'STR', 'NUM', 'BOOL',
                'LENGTH', 'APPEND', 'REMOVE', 'INSERT', 'CONTAINS', 'REVERSE', 'SORT',
                'ABS', 'POW', 'ROUND', 'FLOOR', 'CEILING', 'SQRT', 'MIN', 'MAX',
                'RANDOM', 'RANDOMINT',
                'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SPLIT', 'SUBSTRING',
                'STARTSWITH', 'ENDSWITH',
                'ISNUMBER', 'ISSTRING', 'ISBOOL', 'ISEMPTY', 'ISARRAY', 'ARRAY',
                'INPUT', 'WRITE', 'WRITELN', 'LAST_ERROR', 'SOUND', 'BELL',
              ]);
              isComment = !EXPR_START_KW.has(upper);
            }
          }
        } else {
          isComment = true; // any other character after // → comment
        }
      }

      if (isComment) {
        advance(); advance();
        skipLineComment();
        continue;
      }
      // Fall through to readOperator() — // is integer division
    }

    // Newline
    if (ch === '\n') {
      // Emit NEWLINE only if the last non-whitespace token wasn't already a NEWLINE
      // (collapse blank lines)
      const last = tokens[tokens.length - 1];
      if (last && last.type !== 'NEWLINE') {
        tokens.push({ type: 'NEWLINE', value: '\n', raw: '\n', line: startLine, col: startCol });
      }
      meaningfulOnLine = false;
      advance();
      continue;
    }

    // String
    if (ch === '"') {
      const tok = readString();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Number (digit start)
    if (ch >= '0' && ch <= '9') {
      const tok = readNumber();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Word (identifier or keyword)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const tok = readWord();
      tokens.push(tok);
      meaningfulOnLine = true;
      continue;
    }

    // Operator / punctuation
    const tok = readOperator();
    tokens.push(tok);
    meaningfulOnLine = true;
  }

  // Final newline if last token wasn't one
  const last = tokens[tokens.length - 1];
  if (last && last.type !== 'NEWLINE') {
    tokens.push({ type: 'NEWLINE', value: '\n', raw: '\n', line, col: col() });
  }

  tokens.push({ type: 'EOF', value: null, raw: '', line, col: col() });
  return tokens;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tokenize, LexerError };
}
