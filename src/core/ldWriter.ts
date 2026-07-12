// MoTeC i2 Pro .ld / .ldx writer.
//
// Byte-for-byte port of ldParser.cs from Aim_2_MoTeC
// (https://github.com/ludovicb1239/Aim_2_MoTeC, MIT), itself derived from
// gotzl/ldparser. i2 Pro rejects files with even minor format deviations, so
// the write sequence below mirrors the C# original exactly, including the
// fixed header template and the magic constants.

import { headerTemplate, HEADER_TEMPLATE_SIZE } from "./headerTemplate";
import type { Channel, LapData, SessionMeta } from "./types";

const EVENT_PTR = 1762;
const HEADER_PTR = 0x3448; // 13384 — start of channel metadata
const CHANNEL_HEADER_SIZE = 124;

const encoder = new TextEncoder();

/** UTF-8 encode `str`, truncated or zero-padded to exactly `size` bytes. */
function encodeString(str: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  const bytes = encoder.encode(str);
  out.set(bytes.subarray(0, Math.min(bytes.length, size)));
  return out;
}

/** Sequential little-endian writer over a fixed buffer, mirroring BinaryWriter. */
class Cursor {
  view: DataView;
  bytes: Uint8Array;
  pos = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }

  seek(pos: number) {
    this.pos = pos;
  }
  u8(v: number) {
    this.view.setUint8(this.pos, v);
    this.pos += 1;
  }
  u16(v: number) {
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }
  i16(v: number) {
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
  }
  u32(v: number) {
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }
  i32(v: number) {
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
  }
  f32(v: number) {
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }
  raw(data: Uint8Array) {
    this.bytes.set(data, this.pos);
    this.pos += data.length;
  }
  zeros(n: number) {
    this.bytes.fill(0, this.pos, this.pos + n);
    this.pos += n;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Write the .ld binary for the given channels and session metadata. */
export function writeLd(meta: SessionMeta, channels: Channel[]): Uint8Array {
  if (channels.length === 0) throw new Error("No channels to write");

  // Layout: [header template][channel meta × n][float32 sample data]
  const metaBase = HEADER_PTR;
  const metaAddrs: number[] = [];
  const dataAddrs: number[] = [];
  let dataOffset = metaBase + channels.length * CHANNEL_HEADER_SIZE;
  for (let i = 0; i < channels.length; i++) {
    metaAddrs.push(metaBase + i * CHANNEL_HEADER_SIZE);
    dataAddrs.push(dataOffset);
    dataOffset += channels[i].values.length * 4;
  }
  const totalSize = dataOffset;
  const channelDataPtr = dataAddrs[0];

  const buffer = new ArrayBuffer(totalSize);
  const c = new Cursor(buffer);

  // -- File header (LdHead.Write) --
  c.raw(headerTemplate());
  c.seek(0);

  const dateBytes = encodeString(
    `${pad2(meta.day)}/${pad2(meta.month)}/${meta.year}`,
    16,
  );
  const timeBytes = encodeString(
    `${pad2(meta.hour)}:${pad2(meta.minute)}:${pad2(meta.second)}`,
    16,
  );

  c.i32(0x40);
  c.u32(0x00000000);
  c.u32(HEADER_PTR); // channel metadata pointer
  c.u32(channelDataPtr); // channel data pointer
  c.zeros(20);
  c.u32(EVENT_PTR);
  c.zeros(24);
  c.u16(0x0000);
  c.u16(0x4240);
  c.u16(0x000f);
  c.i32(12007); // device serial
  c.raw(encodeString("ADL", 8)); // device type
  c.u16(420); // device version
  c.u16(0x0080);
  c.i32(channels.length);
  c.u32(0x0001_0064);
  c.raw(dateBytes);
  c.zeros(16);
  c.raw(timeBytes);
  c.zeros(16);
  c.raw(encodeString(meta.driver, 64));
  c.raw(encodeString(meta.vehicle, 64));
  c.zeros(64);
  c.raw(encodeString(meta.venue, 64));
  c.zeros(64);
  c.raw(encodeString("Hello my name is harry pother !", 1024));
  c.u32(0xd20822); // "pro logging" magic
  c.u16(0);
  c.raw(encodeString(meta.session, 64));
  c.raw(encodeString(meta.shortComment, 64));
  c.zeros(8);
  c.u8(99);
  c.zeros(117); // cursor now at EVENT_PTR; event block comes from the template

  // -- Channel metadata blocks (LdChan.Write) --
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    c.seek(metaAddrs[i]);
    c.u32(i === 0 ? 0 : metaAddrs[i - 1]); // prev_meta_ptr
    c.u32(i < channels.length - 1 ? metaAddrs[i + 1] : 0); // next_meta_ptr
    c.u32(dataAddrs[i]);
    c.u32(ch.values.length);
    c.u16(4);
    c.u16(7); // type: float
    c.u16(4); // sample size
    c.u16(clampU16(Math.round(ch.freq)));
    c.u16(0); // shift
    c.u16(1); // mul
    c.u16(1); // scale
    c.i16(0); // dec places
    c.raw(encodeString(ch.name, 32));
    c.raw(encodeString(ch.shortName, 8));
    c.raw(encodeString(ch.unit, 12));
    c.u8(201);
    c.zeros(39);
  }

  // -- Sample data --
  for (let i = 0; i < channels.length; i++) {
    c.seek(dataAddrs[i]);
    for (const v of channels[i].values) c.f32(v);
  }

  return new Uint8Array(buffer);
}

function clampU16(v: number): number {
  return Math.max(0, Math.min(0xffff, v));
}

/**
 * Format a beacon time like C#'s `(t*1e6).ToString("0.00000000000000000E+00")`
 * — 17 decimal places, uppercase E, sign, at least 2 exponent digits.
 */
export function formatBeaconTime(seconds: number): string {
  const micros = seconds * 1e6;
  const [mantissa, exp] = micros.toExponential(17).split("e");
  const sign = exp.startsWith("-") ? "-" : "+";
  const digits = exp.replace(/^[+-]/, "").padStart(2, "0");
  return `${mantissa}E${sign}${digits}`;
}

/** Format lap time as M:SS.mmm (C# `{0}:{1:00}.{2:000}`). */
export function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${minutes}:${pad2(secs)}.${String(ms).padStart(3, "0")}`;
}

/** Write the companion .ldx XML (beacons + lap details). */
export function writeLdx(laps: LapData): string {
  const lines: string[] = [];
  lines.push(
    '<?xml version="1.0"?>\n<LDXFile Locale="English_Canada.1252" DefaultLocale="C" Version="1.6">\n <Layers>\n  <Layer>\n   <MarkerBlock>\n    <MarkerGroup Name="Beacons" Index="3">',
  );
  laps.beaconTimes.forEach((t, i) => {
    lines.push(
      `     <Marker Version="100" ClassName="BCN" Name="${i + 1}" Flags="77" Time="${formatBeaconTime(t)}"/>`,
    );
  });
  lines.push(
    '    </MarkerGroup>\n   </MarkerBlock>\n   <RangeBlock/>\n  </Layer>',
  );
  lines.push(
    `  <Details>\n   <String Id="Total Laps" Value="${laps.totalLaps}"/>\n   <String Id="Fastest Time" Value="${formatLapTime(laps.fastestTime)}"/>\n   <String Id="Fastest Lap" Value="${laps.fastestLap}"/>\n  </Details> `,
  );
  lines.push(" </Layers>\n</LDXFile>");
  return lines.join("\r\n") + "\r\n";
}

export { HEADER_PTR, CHANNEL_HEADER_SIZE, HEADER_TEMPLATE_SIZE };
