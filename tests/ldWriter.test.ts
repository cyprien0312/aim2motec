import { describe, expect, it } from "vitest";
import {
  formatBeaconTime,
  formatLapTime,
  writeLd,
  writeLdx,
  HEADER_PTR,
  CHANNEL_HEADER_SIZE,
} from "../src/core/ldWriter";
import type { Channel, LapData, SessionMeta } from "../src/core/types";

const META: SessionMeta = {
  driver: "Test Driver",
  vehicle: "Kart 32",
  venue: "Calder Park",
  session: "Session 2",
  shortComment: "practice",
  year: 2023,
  month: 7,
  day: 1,
  hour: 10,
  minute: 3,
  second: 24,
};

function chan(name: string, unit: string, freq: number, values: number[]): Channel {
  return { name, shortName: "", unit, freq, values: Float32Array.from(values) };
}

function readCString(bytes: Uint8Array, offset: number, size: number): string {
  const slice = bytes.subarray(offset, offset + size);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

describe("writeLd", () => {
  const channels = [
    chan("RPM", "rpm", 20, [1000, 2000, 3000]),
    chan("Speed", "km/h", 20, [10.5, 20.25]),
  ];
  const ld = writeLd(META, channels);
  const view = new DataView(ld.buffer);

  it("lays out header pointers like the C# original", () => {
    expect(view.getInt32(0, true)).toBe(0x40);
    expect(view.getUint32(8, true)).toBe(HEADER_PTR); // channel meta ptr
    const expectedDataPtr = HEADER_PTR + 2 * CHANNEL_HEADER_SIZE;
    expect(view.getUint32(12, true)).toBe(expectedDataPtr);
    expect(view.getUint32(36, true)).toBe(1762); // event ptr
    expect(view.getUint16(66, true)).toBe(0x4240);
    expect(view.getInt32(70, true)).toBe(12007); // device serial
    expect(readCString(ld, 74, 8)).toBe("ADL");
    expect(view.getUint16(82, true)).toBe(420); // device version
    expect(view.getInt32(86, true)).toBe(2); // channel count
  });

  it("writes date, time and session strings at fixed offsets", () => {
    expect(readCString(ld, 94, 16)).toBe("01/07/2023");
    expect(readCString(ld, 126, 16)).toBe("10:03:24");
    expect(readCString(ld, 158, 64)).toBe("Test Driver");
    expect(readCString(ld, 222, 64)).toBe("Kart 32");
    expect(readCString(ld, 350, 64)).toBe("Calder Park");
    expect(readCString(ld, 1508, 64)).toBe("Session 2");
    expect(readCString(ld, 1572, 64)).toBe("practice");
  });

  it("keeps the event block from the header template", () => {
    expect(readCString(ld, 1762, 64)).toBe("i2 data day");
    expect(readCString(ld, 1890, 64)).toBe(
      "Calder Park, 23/11/05, fine sunny day",
    );
  });

  it("writes a linked list of 124-byte channel headers", () => {
    const m0 = HEADER_PTR;
    const m1 = HEADER_PTR + CHANNEL_HEADER_SIZE;
    // prev / next pointers
    expect(view.getUint32(m0, true)).toBe(0);
    expect(view.getUint32(m0 + 4, true)).toBe(m1);
    expect(view.getUint32(m1, true)).toBe(m0);
    expect(view.getUint32(m1 + 4, true)).toBe(0);
    // data pointer / length
    const d0 = HEADER_PTR + 2 * CHANNEL_HEADER_SIZE;
    expect(view.getUint32(m0 + 8, true)).toBe(d0);
    expect(view.getUint32(m0 + 12, true)).toBe(3);
    expect(view.getUint32(m1 + 8, true)).toBe(d0 + 3 * 4);
    expect(view.getUint32(m1 + 12, true)).toBe(2);
    // type/size/freq and trailing magic
    expect(view.getUint16(m0 + 16, true)).toBe(4);
    expect(view.getUint16(m0 + 18, true)).toBe(7);
    expect(view.getUint16(m0 + 20, true)).toBe(4);
    expect(view.getUint16(m0 + 22, true)).toBe(20);
    expect(view.getUint16(m0 + 26, true)).toBe(1); // mul
    expect(view.getUint16(m0 + 28, true)).toBe(1); // scale
    expect(ld[m0 + 84]).toBe(201);
    // names and units
    expect(readCString(ld, m0 + 32, 32)).toBe("RPM");
    expect(readCString(ld, m0 + 72, 12)).toBe("rpm");
    expect(readCString(ld, m1 + 32, 32)).toBe("Speed");
  });

  it("round-trips float32 sample data", () => {
    const d0 = HEADER_PTR + 2 * CHANNEL_HEADER_SIZE;
    expect(view.getFloat32(d0, true)).toBe(1000);
    expect(view.getFloat32(d0 + 8, true)).toBe(3000);
    expect(view.getFloat32(d0 + 12, true)).toBeCloseTo(10.5, 5);
    expect(view.getFloat32(d0 + 16, true)).toBeCloseTo(20.25, 5);
    expect(ld.length).toBe(d0 + 5 * 4);
  });

  it("rejects empty channel lists", () => {
    expect(() => writeLd(META, [])).toThrow();
  });
});

describe("beacon/lap formatting", () => {
  it("matches C# scientific notation", () => {
    expect(formatBeaconTime(95.335)).toBe("9.53350000000000000E+07");
    expect(formatBeaconTime(0)).toBe("0.00000000000000000E+00");
    expect(formatBeaconTime(1234.5)).toBe("1.23450000000000000E+09");
  });

  it("formats lap times as M:SS.mmm", () => {
    expect(formatLapTime(95.335)).toBe("1:35.335");
    expect(formatLapTime(60)).toBe("1:00.000");
    expect(formatLapTime(0)).toBe("0:00.000");
  });
});

describe("writeLdx", () => {
  const laps: LapData = {
    beaconTimes: [95.335, 190.591],
    lapDurations: [95.335, 95.256, 30],
    totalLaps: 3,
    fastestTime: 95.256,
    fastestLap: 2,
  };
  const ldx = writeLdx(laps);

  it("contains one marker per beacon with µs timestamps", () => {
    expect(ldx).toContain(
      '<Marker Version="100" ClassName="BCN" Name="1" Flags="77" Time="9.53350000000000000E+07"/>',
    );
    expect(ldx).toContain(
      '<Marker Version="100" ClassName="BCN" Name="2" Flags="77" Time="1.90591000000000000E+08"/>',
    );
  });

  it("contains lap details", () => {
    expect(ldx).toContain('<String Id="Total Laps" Value="3"/>');
    expect(ldx).toContain('<String Id="Fastest Time" Value="1:35.256"/>');
    expect(ldx).toContain('<String Id="Fastest Lap" Value="2"/>');
    expect(ldx.startsWith('<?xml version="1.0"?>')).toBe(true);
    expect(ldx).toContain("</LDXFile>");
  });
});
