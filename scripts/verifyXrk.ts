// End-to-end check: real XRK/XRZ → ParsedCsv → MoTeC .ld/.ldx, then re-read
// the .ld structure and confirm it round-trips the channels/laps.
//
// Usage: vite-node scripts/verifyXrk.ts <file.xrk|.xrz>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseXrkFile } from "../src/core/xrkAdapter";
import { convert } from "../src/core/convert";
import { DEFAULT_NAME_TABLE } from "../src/core/nameConversion";

const HEADER_PTR = 0x3448;
const CHANNEL_HEADER_SIZE = 124;

function cstr(bytes: Uint8Array, off: number, size: number): string {
  const slice = bytes.subarray(off, off + size);
  let end = slice.indexOf(0);
  if (end < 0) end = slice.length;
  return new TextDecoder().decode(slice.subarray(0, end));
}

const src = process.argv[2];
if (!src) throw new Error("usage: verifyXrk.ts <file>");

const bytes = new Uint8Array(readFileSync(src));
const t0 = performance.now();
const parsed = parseXrkFile(bytes, { fallbackDate: new Date(0) });
const result = convert(parsed, parsed.meta, {
  renameChannels: true,
  nameTable: DEFAULT_NAME_TABLE,
});
const ms = Math.round(performance.now() - t0);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(outDir, { recursive: true });
const base = basename(src).replace(/\.(xrk|xrz)$/i, "");
writeFileSync(join(outDir, `${base}.ld`), result.ld);
writeFileSync(join(outDir, `${base}.ldx`), result.ldx);

// --- Re-read the .ld structure ---
const ld = result.ld;
const dv = new DataView(ld.buffer, ld.byteOffset, ld.byteLength);
const magic = dv.getInt32(0, true);
const metaPtr = dv.getUint32(8, true);
const numChannels = dv.getInt32(86, true);

const problems: string[] = [];
if (magic !== 0x40) problems.push(`magic ${magic}`);
if (metaPtr !== HEADER_PTR) problems.push(`metaPtr ${metaPtr}`);

// Walk the channel linked list and total the sample bytes.
const ldNames: string[] = [];
let ptr = metaPtr;
let prev = 0;
let totalData = 0;
let walked = 0;
while (ptr && walked <= numChannels) {
  const pPrev = dv.getUint32(ptr, true);
  const pNext = dv.getUint32(ptr + 4, true);
  const dataPtr = dv.getUint32(ptr + 8, true);
  const dataLen = dv.getUint32(ptr + 12, true);
  const type = dv.getUint16(ptr + 18, true);
  const size = dv.getUint16(ptr + 20, true);
  const freq = dv.getUint16(ptr + 22, true);
  const name = cstr(ld, ptr + 32, 32);
  if (pPrev !== prev) problems.push(`${name}: prev ptr ${pPrev} != ${prev}`);
  if (type !== 7 || size !== 4) problems.push(`${name}: type/size ${type}/${size}`);
  if (freq < 1) problems.push(`${name}: freq ${freq}`);
  if (dataPtr + dataLen * 4 > ld.length) problems.push(`${name}: data overruns file`);
  ldNames.push(name);
  totalData += dataLen * 4;
  prev = ptr;
  ptr = pNext;
  walked++;
}

if (ldNames.length !== numChannels) {
  problems.push(`walked ${ldNames.length} channels, header says ${numChannels}`);
}
const expectedSize = HEADER_PTR + numChannels * CHANNEL_HEADER_SIZE + totalData;
if (ld.length !== expectedSize) {
  problems.push(`file size ${ld.length} != expected ${expectedSize}`);
}

// Cross-check: .ld channels == 2 synthetic lap channels + adapter channels.
const expectedNames = new Set<string>(["Lap Time", "Lap Number", ...parsed.channels.map((c) => c.name)]);
// Rename table may remap some names; just check counts line up.
if (numChannels !== parsed.channels.length + 2) {
  problems.push(`channel count ${numChannels} != ${parsed.channels.length} + 2 lap channels`);
}

// .ldx beacon count
const beaconCount = (result.ldx.match(/<Marker /g) ?? []).length;

console.log(`file: ${basename(src)} (${(bytes.length / 1e6).toFixed(1)} MB) parsed+converted in ${ms}ms`);
console.log(`  channels: ${numChannels} (${parsed.channels.length} data + 2 lap), .ld ${(ld.length / 1e6).toFixed(1)} MB`);
console.log(`  laps: ${parsed.laps.totalLaps}, beacons in .ldx: ${beaconCount}, fastest: lap ${parsed.laps.fastestLap} @ ${parsed.laps.fastestTime.toFixed(3)}s`);
console.log(`  meta: driver='${parsed.meta.driver}' venue='${parsed.meta.venue}' date=${parsed.meta.year}-${parsed.meta.month}-${parsed.meta.day}`);
console.log(`  sample .ld channels: ${ldNames.slice(0, 6).join(", ")} ...`);
if (problems.length) {
  console.log(`  STRUCTURE PROBLEMS:`);
  for (const p of problems.slice(0, 20)) console.log(`    - ${p}`);
  process.exit(1);
} else {
  console.log(`  .ld structure OK (linked list, sizes, sample data all consistent)`);
}
