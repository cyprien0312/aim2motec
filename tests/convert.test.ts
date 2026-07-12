import { describe, expect, it } from "vitest";
import { buildLapChannels, convert, renameChannel } from "../src/core/convert";
import { parseAimCsv } from "../src/core/aimCsv";
import { DEFAULT_NAME_TABLE } from "../src/core/nameConversion";
import { HEADER_PTR } from "../src/core/ldWriter";
import { makeSampleCsv, SAMPLE_CHANNELS } from "./helpers/sampleCsv";

const parsed = parseAimCsv(makeSampleCsv());

describe("buildLapChannels", () => {
  it("samples lap time and lap number at 10 Hz", () => {
    const [lapTime, lapNumber] = buildLapChannels(parsed);
    expect(lapTime.freq).toBe(10);
    expect(lapNumber.freq).toBe(10);
    // floor(9.5*10) + floor(9.75*10) + floor(~10.8*10)
    const expected = parsed.laps.lapDurations.reduce(
      (acc, d) => acc + Math.floor(d * 10),
      0,
    );
    expect(lapTime.values.length).toBe(expected);
    expect(lapNumber.values.length).toBe(expected);
    expect(lapTime.values[0]).toBeCloseTo(9.5, 3);
    expect(lapNumber.values[0]).toBe(0);
    expect(lapNumber.values[lapNumber.values.length - 1]).toBe(2);
  });
});

describe("renameChannel", () => {
  it("maps AiM names to MoTeC names", () => {
    const ch = renameChannel(
      { name: "SpeedVeh", shortName: "", unit: "km/h", freq: 20, values: new Float32Array(1) },
      DEFAULT_NAME_TABLE,
    );
    expect(ch.name).toBe("Ground Speed");
    expect(ch.shortName).toBe("Gnd Spd");
  });

  it("leaves unmapped names alone", () => {
    const ch = renameChannel(
      { name: "MysteryChan", shortName: "", unit: "", freq: 20, values: new Float32Array(1) },
      DEFAULT_NAME_TABLE,
    );
    expect(ch.name).toBe("MysteryChan");
  });
});

describe("convert", () => {
  it("produces a .ld with lap channels + data channels and a datestamped name", () => {
    const result = convert(parsed, parsed.meta, {
      renameChannels: true,
      nameTable: DEFAULT_NAME_TABLE,
    });
    expect(result.baseName).toBe("20230701-100324");
    const view = new DataView(result.ld.buffer);
    expect(view.getInt32(86, true)).toBe(SAMPLE_CHANNELS.length + 2);
    expect(view.getUint32(8, true)).toBe(HEADER_PTR);
    expect(result.ldx).toContain('Name="Beacons"');
  });
});
