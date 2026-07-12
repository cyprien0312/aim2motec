// Orchestration: parsed CSV → MoTeC .ld bytes + .ldx text.

import { parseAimCsv, type ParseOptions } from "./aimCsv";
import { writeLd, writeLdx } from "./ldWriter";
import { lookupName, type NameConvert } from "./nameConversion";
import type { Channel, ParsedCsv, SessionMeta } from "./types";

export interface ConvertOptions {
  /** Rename channels via the mapping table (like "Rename Channels" in the original). */
  renameChannels: boolean;
  nameTable: NameConvert[];
}

export interface ConvertResult {
  ld: Uint8Array;
  ldx: string;
  /** Suggested output base name, e.g. "20230701-100302" (no extension). */
  baseName: string;
}

/**
 * Build the synthetic "Lap Time" / "Lap Number" channels the original tool
 * derives from lap info, sampled at 10 Hz (DataLog.fromXRK).
 */
export function buildLapChannels(parsed: ParsedCsv): Channel[] {
  const lapTime: number[] = [];
  const lapNumber: number[] = [];
  parsed.laps.lapDurations.forEach((dur, lap) => {
    const samples = Math.floor(dur * 10);
    for (let i = 0; i < samples; i++) {
      lapTime.push(dur);
      lapNumber.push(lap);
    }
  });
  return [
    {
      name: "Lap Time",
      shortName: "LapTime",
      unit: "s",
      freq: 10,
      values: Float32Array.from(lapTime),
    },
    {
      name: "Lap Number",
      shortName: "Lap",
      unit: "",
      freq: 10,
      values: Float32Array.from(lapNumber),
    },
  ];
}

/** Apply the rename table to a channel, returning a renamed copy. */
export function renameChannel(ch: Channel, table: NameConvert[]): Channel {
  const hit = lookupName(table, ch.name);
  if (!hit) return ch;
  return { ...ch, name: hit.to, shortName: hit.toShort };
}

export function suggestedBaseName(meta: SessionMeta): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${meta.year}${p2(meta.month)}${p2(meta.day)}-${p2(meta.hour)}${p2(meta.minute)}${p2(meta.second)}`;
}

/** Convert a parsed CSV (with possibly user-edited metadata) to .ld/.ldx. */
export function convert(
  parsed: ParsedCsv,
  meta: SessionMeta,
  opts: ConvertOptions,
): ConvertResult {
  const channels: Channel[] = [
    ...buildLapChannels(parsed),
    ...parsed.channels.map((ch) =>
      opts.renameChannels ? renameChannel(ch, opts.nameTable) : ch,
    ),
  ];
  return {
    ld: writeLd(meta, channels),
    ldx: writeLdx(parsed.laps),
    baseName: suggestedBaseName(meta),
  };
}

export { parseAimCsv };
export type { ParseOptions };
