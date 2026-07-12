// Core data contracts for the AiM CSV → MoTeC .ld conversion pipeline.

/** A single logged channel, uniformly sampled at `freq` Hz. */
export interface Channel {
  name: string;
  shortName: string;
  unit: string;
  freq: number; // Hz
  values: Float32Array;
}

/** Session metadata written into the .ld header. */
export interface SessionMeta {
  driver: string;
  vehicle: string;
  venue: string;
  session: string;
  shortComment: string;
  /** Local date/time of the session start. */
  year: number; // e.g. 2024
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Lap information derived from beacon markers. */
export interface LapData {
  /** Cumulative beacon crossing times in seconds (excluding t=0). */
  beaconTimes: number[];
  /** Duration of each lap in seconds (first lap starts at t=0). */
  lapDurations: number[];
  totalLaps: number;
  fastestTime: number; // seconds
  fastestLap: number; // 1-based
}

/** Result of parsing an AiM RaceStudio CSV export. */
export interface ParsedCsv {
  meta: SessionMeta;
  channels: Channel[];
  laps: LapData;
  /** Total logged duration in seconds. */
  duration: number;
  warnings: string[];
}
