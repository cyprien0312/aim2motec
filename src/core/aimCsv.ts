// Parser for AiM RaceStudio CSV exports (RaceStudio 2 "AIM CSV File" and
// RaceStudio 3 CSV formats), with a fallback for generic time-series CSVs.
//
// Expected shape:
//   "Format","AIM CSV File"
//   "Venue","..."            ← key/value metadata rows
//   ...
//   "Beacon Markers"," 95.3  190.6 ..."
//   (blank)
//   "Time","RPM","Speed",...  ← channel names row
//   "sec","rpm","km/h",...    ← units row (optional)
//   "0.00","5012","102.3",... ← uniform-rate samples

import type { Channel, LapData, ParsedCsv, SessionMeta } from "./types";

/** Split CSV text into rows of cells, honouring quoted cells. */
export function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellWasQuoted = false;

  const pushCell = () => {
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = "";
    cellWasQuoted = false;
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      cellWasQuoted = true;
    } else if (ch === delimiter) {
      pushCell();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Pick the most frequent delimiter in the first few lines. */
export function detectDelimiter(text: string): string {
  const head = text.slice(0, 4000);
  const counts: Array<[string, number]> = [",", ";", "\t"].map((d) => [
    d,
    (head.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function isNumeric(s: string): boolean {
  if (s === "") return false;
  return !Number.isNaN(Number(s));
}

/** True when every non-empty cell parses as a number (and at least one does). */
function isDataRow(row: string[]): boolean {
  let any = false;
  for (const cell of row) {
    if (cell === "") continue;
    if (!isNumeric(cell)) return false;
    any = true;
  }
  return any;
}

function parseNumberList(cells: string[]): number[] {
  // Markers may come as separate cells or a single space-separated cell.
  return cells
    .join(" ")
    .split(/\s+/)
    .map((t) => Number(t))
    .filter((v) => Number.isFinite(v));
}

const TIME_NAME = /^"?(time|timestamp)"?$/i;

/** Best-effort parse of AiM's date ("Saturday, July 01, 2023") and time cells. */
function parseDateTime(
  dateStr: string,
  timeStr: string,
  fallback: Date,
): Pick<SessionMeta, "year" | "month" | "day" | "hour" | "minute" | "second"> {
  let date = fallback;
  if (dateStr) {
    const composed = new Date(`${dateStr} ${timeStr || "00:00:00"}`);
    if (!Number.isNaN(composed.getTime())) {
      date = composed;
    } else {
      const dateOnly = new Date(dateStr);
      if (!Number.isNaN(dateOnly.getTime())) date = dateOnly;
    }
  }
  const result = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
  // Time cell may carry "10:03:24 AM" / "14:03:24" even when the date cell failed.
  const t = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (t) {
    let h = Number(t[1]);
    const ampm = t[4]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    result.hour = h;
    result.minute = Number(t[2]);
    result.second = t[3] ? Number(t[3]) : 0;
  }
  return result;
}

export interface ParseOptions {
  /** Fallback session date when the CSV has none (e.g. the file's mtime). */
  fallbackDate?: Date;
}

/** Parse an AiM RaceStudio CSV export into channels + laps + metadata. */
export function parseAimCsv(text: string, opts: ParseOptions = {}): ParsedCsv {
  const warnings: string[] = [];
  const delimiter = detectDelimiter(text);
  const rows = tokenizeCsv(text, delimiter).filter((r) =>
    r.some((c) => c !== ""),
  );
  if (rows.length < 2) throw new Error("CSV has no data rows");

  // Locate the first all-numeric row with a stable column count — the data start.
  let dataStart = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length >= 2 && isDataRow(rows[i])) {
      // Require the next row (if any) to also be numeric, so a stray numeric
      // metadata row doesn't trigger a false start.
      if (i + 1 >= rows.length || isDataRow(rows[i + 1])) {
        dataStart = i;
        break;
      }
    }
  }
  if (dataStart === -1) throw new Error("Could not find sample data in CSV");

  const columnCount = rows[dataStart].length;

  // Header rows: names row, then an optional units row, directly above the data.
  let namesRow: string[] | null = null;
  let unitsRow: string[] | null = null;
  const above: string[][] = [];
  for (let i = Math.max(0, dataStart - 2); i < dataStart; i++) {
    if (Math.abs(rows[i].length - columnCount) <= 1 && !isDataRow(rows[i])) {
      above.push(rows[i]);
    }
  }
  if (above.length === 2) {
    [namesRow, unitsRow] = above;
  } else if (above.length === 1) {
    namesRow = above[0];
  } else {
    throw new Error("Could not find the channel-names header row");
  }

  // Metadata rows precede the names row.
  const metaRows = rows.slice(0, rows.indexOf(namesRow));
  const kv = new Map<string, string>();
  let beaconMarkers: number[] = [];
  for (const row of metaRows) {
    const key = row[0]?.trim() ?? "";
    if (/beacon/i.test(key)) {
      beaconMarkers = parseNumberList(row.slice(1));
    } else if (row.length >= 2 && key) {
      kv.set(key.toLowerCase(), row[1].trim());
    }
  }

  // Time column (usually the first).
  let timeIdx = namesRow.findIndex((n) => TIME_NAME.test(n.trim()));
  if (timeIdx === -1) {
    timeIdx = 0;
    warnings.push(
      `No "Time" column found — assuming the first column ("${namesRow[0]}") is time in seconds.`,
    );
  }
  const timeUnit = unitsRow?.[timeIdx]?.trim().toLowerCase() ?? "sec";
  const timeScale = timeUnit === "ms" || timeUnit === "msec" ? 1e-3 : 1;

  const dataRows = rows.slice(dataStart).filter((r) => isDataRow(r));
  const n = dataRows.length;
  if (n < 2) throw new Error("Not enough samples in CSV");

  const times = new Float64Array(n);
  for (let i = 0; i < n; i++) times[i] = Number(dataRows[i][timeIdx]) * timeScale;

  const span = times[n - 1] - times[0];
  if (!(span > 0)) throw new Error("Time column is not increasing");
  const step = span / (n - 1);
  const duration = span + step;
  const freq = Math.max(1, Math.round(1 / step));

  // Warn when sampling is visibly non-uniform (.ld assumes a fixed rate).
  let maxDev = 0;
  for (let i = 1; i < n; i++) {
    maxDev = Math.max(maxDev, Math.abs(times[i] - times[i - 1] - step));
  }
  if (maxDev > step * 0.5) {
    warnings.push(
      "Time steps are not uniform; MoTeC .ld assumes a fixed sample rate — data may be skewed. Re-export from RaceStudio with a fixed rate.",
    );
  }

  const channels: Channel[] = [];
  for (let col = 0; col < columnCount; col++) {
    if (col === timeIdx) continue;
    const name = (namesRow[col] ?? `Channel ${col}`).trim() || `Channel ${col}`;
    const unit = (unitsRow?.[col] ?? "").trim();
    const values = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cell = dataRows[i][col];
      values[i] = cell === "" || cell === undefined ? 0 : Number(cell);
    }
    channels.push({ name, shortName: "", unit, freq, values });
  }
  if (channels.length === 0) throw new Error("No channels found in CSV");

  // Laps from beacon markers (cumulative crossing times).
  const markers = beaconMarkers
    .filter((t) => t > 0 && t < duration)
    .sort((a, b) => a - b);
  const bounds = [0, ...markers, duration];
  const lapDurations: number[] = [];
  for (let i = 1; i < bounds.length; i++) lapDurations.push(bounds[i] - bounds[i - 1]);
  let fastestLap = 1;
  let fastestTime = lapDurations[0];
  // Skip out-lap and in-lap when there are enough full laps to choose from.
  const first = lapDurations.length > 2 ? 1 : 0;
  const last = lapDurations.length > 2 ? lapDurations.length - 1 : lapDurations.length;
  for (let i = first; i < last; i++) {
    if (i === first || lapDurations[i] < fastestTime) {
      fastestTime = lapDurations[i];
      fastestLap = i + 1;
    }
  }
  const laps: LapData = {
    beaconTimes: markers,
    lapDurations,
    totalLaps: lapDurations.length,
    fastestTime,
    fastestLap,
  };

  const dt = parseDateTime(
    kv.get("date") ?? "",
    kv.get("time") ?? "",
    opts.fallbackDate ?? new Date(0),
  );

  const meta: SessionMeta = {
    driver: kv.get("user") ?? kv.get("racer") ?? kv.get("driver") ?? "",
    vehicle: kv.get("vehicle") ?? "",
    venue: kv.get("venue") ?? kv.get("track") ?? "",
    session: kv.get("session") ?? kv.get("segment") ?? kv.get("venue type") ?? "",
    shortComment: kv.get("championship") ?? kv.get("comment") ?? "",
    ...dt,
  };

  return { meta, channels, laps, duration, warnings };
}
