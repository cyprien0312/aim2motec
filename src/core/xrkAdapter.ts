// Adapts an xrk-js parse result (native XRK/XRZ telemetry) into the same
// ParsedCsv shape the CSV path produces, so the rest of the MoTeC .ld/.ldx
// pipeline is unchanged.
//
// xrk-js gives each channel its own timecodes at its native sample rate. The
// MoTeC .ld format stores each channel at a fixed frequency with samples
// assumed uniform from t=0, so every channel is resampled onto a clean
// 0-based uniform grid here (linear interpolation for analog channels,
// previous-value hold for stepped ones).

import { parseXrk, type XrkChannel, type XrkLog } from "aim-xrk";
import type { Channel, LapData, ParsedCsv, SessionMeta } from "./types";

/** Largest per-channel rate we will emit (MoTeC stores freq as uint16). */
const MAX_FREQ = 1000;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Parse xrk "Log Date" (MM/DD/YYYY) + "Log Time" (HH:MM:SS). */
function parseDateTime(
  dateStr: string,
  timeStr: string,
  fallback: Date,
): Pick<SessionMeta, "year" | "month" | "day" | "hour" | "minute" | "second"> {
  let year = fallback.getFullYear();
  let month = fallback.getMonth() + 1;
  let day = fallback.getDate();
  let hour = fallback.getHours();
  let minute = fallback.getMinutes();
  let second = fallback.getSeconds();

  const d = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (d) {
    month = Number(d[1]);
    day = Number(d[2]);
    year = Number(d[3]);
  }
  const t = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (t) {
    hour = Number(t[1]);
    minute = Number(t[2]);
    second = t[3] ? Number(t[3]) : 0;
  }
  return { year, month, day, hour, minute, second };
}

/**
 * Resample a channel with explicit (monotonic) timecodes onto a uniform grid
 * `t_k = k * stepMs` for k in [0, N). Two-pointer walk, O(n + N).
 */
function resample(
  timecodes: Float64Array,
  values: ArrayLike<number>,
  stepMs: number,
  n: number,
  interpolate: boolean,
): Float32Array {
  const out = new Float32Array(n);
  const src = timecodes.length;
  let j = 0; // index of the last source sample with tc <= grid time
  for (let k = 0; k < n; k++) {
    const t = k * stepMs;
    while (j + 1 < src && timecodes[j + 1] <= t) j++;
    if (t <= timecodes[0]) {
      out[k] = values[0];
    } else if (j >= src - 1) {
      out[k] = values[src - 1];
    } else if (interpolate) {
      const t0 = timecodes[j];
      const t1 = timecodes[j + 1];
      const span = t1 - t0;
      const frac = span > 0 ? (t - t0) / span : 0;
      out[k] = values[j] + frac * (values[j + 1] - values[j]);
    } else {
      out[k] = values[j];
    }
  }
  return out;
}

function convertChannel(ch: XrkChannel): Channel | null {
  const tc = ch.timecodes;
  const n = tc.length;
  if (n < 2) return null;
  const first = tc[0];
  const last = tc[n - 1];
  const span = last - first;
  if (!(span > 0)) return null;

  let freq = Math.round(((n - 1) * 1000) / span);
  if (freq < 1) freq = 1;
  if (freq > MAX_FREQ) freq = MAX_FREQ;
  const stepMs = 1000 / freq;
  const gridN = Math.floor(last / stepMs) + 1;
  if (gridN < 1) return null;

  return {
    name: ch.name,
    shortName: ch.shortName,
    unit: ch.units,
    freq,
    values: resample(tc, ch.values, stepMs, gridN, ch.interpolate),
  };
}

function buildLaps(log: XrkLog): LapData {
  const laps = [...log.laps].sort((a, b) => a.startTime - b.startTime);
  const lapDurations = laps.map((l) => (l.endTime - l.startTime) / 1000);

  // Beacons = S/F line crossings. Every lap boundary is a crossing; a crossing
  // at exactly t=0 is the session start, not a mid-session beacon.
  const boundaries = new Set<number>();
  if (laps.length && laps[0].startTime > 0) boundaries.add(laps[0].startTime);
  for (const l of laps) boundaries.add(l.endTime);
  const beaconTimes = [...boundaries]
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)
    .map((ms) => ms / 1000);

  // Fastest lap, skipping out-lap and in-lap when there are enough laps.
  let fastestLap = 1;
  let fastestTime = lapDurations[0] ?? 0;
  const many = lapDurations.length > 2;
  const start = many ? 1 : 0;
  const end = many ? lapDurations.length - 1 : lapDurations.length;
  for (let i = start; i < end; i++) {
    if (i === start || lapDurations[i] < fastestTime) {
      fastestTime = lapDurations[i];
      fastestLap = i + 1;
    }
  }

  return {
    beaconTimes,
    lapDurations,
    totalLaps: lapDurations.length,
    fastestTime,
    fastestLap,
  };
}

export interface XrkParseOptions {
  /** Fallback session date when the file lacks one. */
  fallbackDate?: Date;
}

/** Parse XRK/XRZ bytes into the shared ParsedCsv shape. */
export function parseXrkFile(
  bytes: Uint8Array,
  opts: XrkParseOptions = {},
): ParsedCsv {
  const log = parseXrk(bytes);
  const warnings: string[] = [];

  const channels: Channel[] = [];
  for (const ch of Object.values(log.channels)) {
    const c = convertChannel(ch);
    if (c) channels.push(c);
  }
  if (channels.length === 0) throw new Error("No usable channels in XRK file");

  const laps = buildLaps(log);
  const duration = Math.max(
    ...channels.map((c) => c.values.length / c.freq),
    laps.beaconTimes.length ? laps.beaconTimes[laps.beaconTimes.length - 1] : 0,
  );

  const m = log.metadata;
  const dt = parseDateTime(
    str(m["Log Date"]),
    str(m["Log Time"]),
    opts.fallbackDate ?? new Date(0),
  );
  const meta: SessionMeta = {
    driver: str(m["Driver"]),
    vehicle: str(m["Vehicle"]),
    venue: str(m["Venue"]),
    session: str(m["Session"]),
    shortComment: str(m["Series"]),
    ...dt,
  };

  return { meta, channels, laps, duration, warnings };
}
