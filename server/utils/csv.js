/**
 * Minimal RFC 4180 CSV parser: commas, double-quoted fields, "" inside quotes,
 * CRLF or LF line endings and a leading byte-order mark (Excel adds one when
 * saving as "CSV UTF-8").
 *
 * Returns one entry per record with the 1-based line it starts on, so errors
 * can point at the row the user sees in a spreadsheet even when a quoted field
 * spans several lines.
 */
const parseCsv = (text) => {
  const input = String(text ?? '').replace(/^﻿/, '');
  const records = [];

  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    const err = new Error(`Row ${recordLine} has a quote that is never closed.`);
    err.status = 400;
    throw err;
  }

  // A trailing newline does not start another record.
  if (field !== '' || fields.length > 0) endRecord();

  return records;
};

/**
 * CSV writer matching the project's export format (Req 127): UTF-8 byte-order
 * mark so Excel detects the encoding, CRLF line endings, RFC 4180 quoting, and
 * a leading apostrophe on values that a spreadsheet would run as a formula.
 */
const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // stop spreadsheet formulas
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (head, rows) =>
  `\uFEFF${[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

module.exports = { parseCsv, csvCell, toCsv };
