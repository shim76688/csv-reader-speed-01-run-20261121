// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01-run-20261121).
// Written from scratch. Semantics match the reference exactly; the implementation
// is a fresh single-pass scanner built for speed.
//
// Two paths:
//  - Fast path: a record that is one clean line (no quotes, no stray CRs) is
//    taken whole with native indexOf/split, one slice per line, no per-char loop.
//  - Slow path: any line holding a quote or a stray CR is read field by field
//    with a tight charCodeAt scanner that slices fields instead of building
//    them up a character at a time.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read (out-parameters, so no result object is built per
  // field): its value, how it ended, and the characters kept by the last
  // unquoted read (for the quote_junk check).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Returns text[a..b) as a quoted field's piece, counting the line breaks
  // it holds and reading each CRLF or lone CR inside it as one LF.
  function quoteSegment(a, b) {
    if (a === b) return '';
    const seg = text.slice(a, b);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
    // Rare path: the segment holds line breaks. After the replace, every
    // line break in it is exactly one '\n', so counting '\n' counts lines.
    const t = seg.replace(/\r\n?/g, '\n');
    let k = -1;
    let cnt = 0;
    while ((k = t.indexOf('\n', k + 1)) !== -1) cnt++;
    line += cnt;
    return t;
  }

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets fValue/fEnded and
  // fAdded (the characters kept in this call).
  function readUnquoted(value) {
    let parts = null; // slices when a stray CR splits the field
    let start = pos; // start of the current clean run
    let added = 0;
    // Closes the field at `ended`, appending the last clean run `tail`.
    function finish(ended, tail) {
      if (parts === null) fValue = value + tail;
      else {
        parts.push(tail);
        fValue = value + parts.join('');
      }
      fEnded = ended;
      fAdded = added + tail.length;
    }
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) { // ','
        const tail = text.slice(start, pos);
        pos += 1;
        finish(COMMA, tail);
        return;
      }
      if (c === 10) { // LF
        const tail = text.slice(start, pos);
        pos += 1;
        line += 1;
        finish(LINE_BREAK, tail);
        return;
      }
      if (c === 13) { // CR
        if (text.charCodeAt(pos + 1) === 10) { // CRLF
          const tail = text.slice(start, pos);
          pos += 2;
          line += 1;
          finish(LINE_BREAK, tail);
          return;
        }
        // A lone CR is dropped (stray_cr); the field goes on after it.
        pushError('stray_cr');
        const tail = text.slice(start, pos);
        added += tail.length;
        if (parts === null) parts = [tail];
        else parts.push(tail);
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    finish(END, text.slice(start, pos));
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1; // skip the opening quote
    let segStart = pos;
    while (true) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote in the value.
        value += quoteSegment(segStart, q);
        value += '"';
        pos = q + 2;
        segStart = pos;
        continue;
      }
      // The closing quote.
      value += quoteSegment(segStart, q);
      pos = q + 1;
      break;
    }
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value);
    if (fAdded > 0) pushError('quote_junk');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record is one clean line (no quotes, no stray CRs).
    // Take it whole: split on commas with native code. The quote/CR checks
    // run on the raw text first, so a line that needs the slow path costs
    // no slice of its own.
    const eol = text.indexOf('\n', pos);
    const lineEnd = eol === -1 ? n : eol;
    let fields = null;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= lineEnd) {
      let hasCR = false;
      const r = text.indexOf('\r', pos);
      if (r !== -1 && r < lineEnd) {
        if (eol !== -1 && r === lineEnd - 1) {
          // A trailing CR before the LF is the CRLF ending the line; only
          // another CR in the line is a stray one.
          const r2 = text.indexOf('\r', r + 1);
          hasCR = r2 !== -1 && r2 < lineEnd;
        } else {
          hasCR = true;
        }
      }
      if (!hasCR) {
        let end = lineEnd;
        if (eol !== -1 && end > pos && text.charCodeAt(end - 1) === 13) end -= 1; // CRLF
        fields = text.slice(pos, end).split(',');
        if (eol === -1) pos = n;
        else {
          pos = eol + 1;
          line += 1;
        }
      }
    }

    if (fields === null) {
      // Slow path: read the record field by field.
      fields = [];
      let quoted;
      do {
        quoted = text.charCodeAt(pos) === 34;
        if (quoted) readQuoted();
        else readUnquoted('');
        fields.push(fValue);
      } while (fEnded === COMMA);

      // A line that held only stray CRs is left with no characters: no record
      // (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
