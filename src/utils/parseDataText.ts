export type SequenceData<T extends number | Date = number | Date> = {
  timeAxisName: string;
  valueAxisName: string;
  dataPoints: Readonly<Array<[T, number]>>;
};

/**
 * Parse a block of delimited (CSV/TSV) or single-column text into a typed sequence.
 *
 * Rules implemented per spec:
 * - Throw if any numeric field is NaN/Infinity (non-true-number).
 * - Detect header if first row contains non-numeric text (for X: numeric or ISO date counts as data-like; for Y: numeric only).
 * - Detect delimiter across ALL lines (comma or tab). Throw if mixed or >2 columns.
 * - Allow either:
 *    • one column (Y only) → X is implicit index starting at 0
 *    • two columns (X, Y)
 * - If every X is an ISO date/datetime, convert X to Date objects (UTC/"universal timezone" semantics).
 */
export default function parseDataText<
  T extends Date | number = Date | number
>(text: string): SequenceData<T> {
  if (typeof text !== "string") throw new Error("Input must be a string");

  // Normalize line endings and trim leading/trailing whitespace-only lines
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new Error("No data lines found");

  // --- Delimiter detection (comma vs tab vs none). Reject mixes. ---
  let commaLines = 0;
  let tabLines = 0;
  for (const l of lines) {
    const hasComma = l.includes(",");
    const hasTab = l.includes("\t");
    if (hasComma) commaLines++;
    if (hasTab) tabLines++;
    if (hasComma && hasTab)
      throw new Error("Mixed delimiters in a single line (comma and tab)");
  }
  if (commaLines > 0 && tabLines > 0) {
    throw new Error("Mixed delimiters across lines (some comma, some tab)");
  }
  const delimiter: "," | "\t" | null = commaLines > 0 ? "," : tabLines > 0 ? "\t" : null;

  // --- Tokenize all rows ---
  const rows: string[][] = lines.map((l) => (delimiter ? l.split(delimiter) : [l]));

  // Validate column counts: only 1 or 2 columns allowed
  const colCounts = new Set(rows.map((r) => r.length));
  if (colCounts.size > 1) {
    throw new Error("Inconsistent column counts across rows");
  }
  const columns = rows[0].length;
  if (columns !== 1 && columns !== 2) {
    throw new Error("Only one or two columns are supported");
  }
  if (delimiter && columns !== 2) {
    throw new Error(
      "A delimiter was detected, but the data does not have exactly two columns"
    );
  }

  // --- Helpers ---
  const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const isFiniteNumberString = (s: string): boolean => {
    if (!NUM_RE.test(s)) return false;
    const n = Number(s);
    return Number.isFinite(n);
  };

  // Strict-ish ISO date/datetime (YYYY-MM-DD or with time, optional timezone).
  // If timezone is absent, we will interpret as UTC per spec intent.
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;
  const parseIsoToDate = (s: string): Date | null => {
    const m = ISO_RE.exec(s);
    if (!m) return null;
    const [_, Y, Mo, D, h, mi, se, ms, tz] = m;
    const year = Number(Y);
    const month = Number(Mo) - 1; // JS months 0-11
    const day = Number(D);
    const hh = h ? Number(h) : 0;
    const mm = mi ? Number(mi) : 0;
    const ss = se ? Number(se) : 0;
    const mss = ms ? Number(ms.padEnd(3, "0")) : 0;

    // Construct timestamp in ms since epoch, normalized to UTC
    let ts: number;
    if (!h && !tz) {
      // Date-only (YYYY-MM-DD) → explicitly UTC midnight
      ts = Date.UTC(year, month, day, 0, 0, 0, 0);
    } else if (tz === "Z" || tz == null) {
      // Time given; if tz missing, treat as UTC
      ts = Date.UTC(year, month, day, hh, mm, ss, mss);
    } else {
      // With timezone offset like +02:00 or -05:30
      const sign = tz[0] === "-" ? -1 : 1;
      const [toH, toM] = tz.slice(1).split(":").map(Number);
      const offsetMin = sign * (toH * 60 + toM);
      // Local time in that offset → normalize to UTC
      ts = Date.UTC(year, month, day, hh, mm, ss, mss) - offsetMin * 60_000;
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const isHeaderRow = (() => {
    const first = rows[0];
    if (columns === 1) {
      // Header if not numeric
      return !isFiniteNumberString(first[0]);
    } else {
      const xLooksData = isFiniteNumberString(first[0]) || !!parseIsoToDate(first[0]);
      const yLooksData = isFiniteNumberString(first[1]);
      return !(xLooksData && yLooksData);
    }
  })();

  let timeAxisName = columns === 2 ? "X" : "Index";
  let valueAxisName = "Value";
  let startIdx = 0;
  if (isHeaderRow) {
    if (columns === 1) {
      valueAxisName = rows[0][0] || "Value";
      timeAxisName = "Index";
    } else {
      timeAxisName = rows[0][0] || "X";
      valueAxisName = rows[0][1] || "Value";
    }
    startIdx = 1;
  }

  // --- Gather data strings ---
  const dataRows = rows.slice(startIdx);
  if (dataRows.length === 0) throw new Error("No data rows after header detection");

  // Validate column widths inside data region
  for (const r of dataRows) {
    if (r.length !== columns)
      throw new Error("Inconsistent column count inside data rows");
  }

  // Determine if first column is all ISO dates
  let xAreDates = false;
  if (columns === 2) {
    xAreDates = dataRows.every((r) => !!parseIsoToDate(r[0]));
  }

  // Build data points
  const dataPoints: Array<[number | Date, number]> = [];

  if (columns === 1) {
    for (let i = 0; i < dataRows.length; i++) {
      const yRaw = dataRows[i][0].trim();
      if (!isFiniteNumberString(yRaw))
        throw new Error(`Invalid Y at row ${startIdx + i + 1}: \"${yRaw}\"`);
      const y = Number(yRaw);
      if (!Number.isFinite(y))
        throw new Error(`Non-finite Y at row ${startIdx + i + 1}`);
      dataPoints.push([i, y]);
    }
  } else {
    if (xAreDates) {
      for (let i = 0; i < dataRows.length; i++) {
        const [xRaw, yRaw] = dataRows[i].map((s) => s.trim());
        const d = parseIsoToDate(xRaw);
        if (!d) throw new Error(`Invalid ISO date at row ${startIdx + i + 1}`);
        if (!isFiniteNumberString(yRaw))
          throw new Error(`Invalid Y at row ${startIdx + i + 1}: \"${yRaw}\"`);
        const y = Number(yRaw);
        if (!Number.isFinite(y))
          throw new Error(`Non-finite Y at row ${startIdx + i + 1}`);
        dataPoints.push([d, y]);
      }
    } else {
      for (let i = 0; i < dataRows.length; i++) {
        const [xRaw, yRaw] = dataRows[i].map((s) => s.trim());
        if (!isFiniteNumberString(xRaw))
          throw new Error(`Invalid X at row ${startIdx + i + 1}: \"${xRaw}\"`);
        if (!isFiniteNumberString(yRaw))
          throw new Error(`Invalid Y at row ${startIdx + i + 1}: \"${yRaw}\"`);
        const x = Number(xRaw);
        const y = Number(yRaw);
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new Error(`Non-finite number at row ${startIdx + i + 1}`);
        dataPoints.push([x, y]);
      }
    }
  }

  // Freeze/readonly semantics at runtime (TS already enforces at type level for consumers)
  const result: SequenceData<T> = {
    timeAxisName,
    valueAxisName,
    dataPoints: Object.freeze(dataPoints.slice()) as Readonly<
      Array<[T, number]>
    >,
  };

  return result;
}
