import { describe, expect, it } from "vitest";
import { detectDelimiter, parseAimCsv, tokenizeCsv } from "../src/core/aimCsv";
import { makeSampleCsv, SAMPLE_SPEC, SAMPLE_CHANNELS } from "./helpers/sampleCsv";

describe("tokenizeCsv", () => {
  it("handles quoted cells with embedded delimiters and quotes", () => {
    const rows = tokenizeCsv('"a,b","c""d",e\n1,2,3', ",");
    expect(rows[0]).toEqual(['a,b', 'c"d', "e"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });
});

describe("detectDelimiter", () => {
  it("detects semicolons", () => {
    expect(detectDelimiter('"a";"b";"c"\n1;2;3')).toBe(";");
  });
  it("defaults to comma", () => {
    expect(detectDelimiter("abc\ndef")).toBe(",");
  });
});

describe("parseAimCsv on an AiM-style export", () => {
  const parsed = parseAimCsv(makeSampleCsv());

  it("extracts session metadata", () => {
    expect(parsed.meta.venue).toBe("Calder Park");
    expect(parsed.meta.vehicle).toBe("Kart 32");
    expect(parsed.meta.driver).toBe("Test Driver");
    expect(parsed.meta.session).toBe("Session 2");
    expect(parsed.meta.year).toBe(2023);
    expect(parsed.meta.month).toBe(7);
    expect(parsed.meta.day).toBe(1);
    expect(parsed.meta.hour).toBe(10);
    expect(parsed.meta.minute).toBe(3);
    expect(parsed.meta.second).toBe(24);
  });

  it("extracts channels excluding the time column", () => {
    expect(parsed.channels.map((c) => c.name)).toEqual(
      SAMPLE_CHANNELS.map((c) => c.name),
    );
    expect(parsed.channels.map((c) => c.unit)).toEqual(
      SAMPLE_CHANNELS.map((c) => c.unit),
    );
    for (const ch of parsed.channels) {
      expect(ch.freq).toBe(SAMPLE_SPEC.freq);
      expect(ch.values.length).toBe(SAMPLE_SPEC.freq * SAMPLE_SPEC.duration + 1);
    }
  });

  it("computes duration from the time column", () => {
    expect(parsed.duration).toBeCloseTo(
      SAMPLE_SPEC.duration + 1 / SAMPLE_SPEC.freq,
      3,
    );
  });

  it("derives laps from beacon markers", () => {
    expect(parsed.laps.beaconTimes).toEqual(SAMPLE_SPEC.beaconMarkers);
    expect(parsed.laps.totalLaps).toBe(3);
    expect(parsed.laps.lapDurations[0]).toBeCloseTo(9.5, 3);
    expect(parsed.laps.lapDurations[1]).toBeCloseTo(9.75, 3);
    // Fastest excludes out-lap and in-lap → lap 2
    expect(parsed.laps.fastestLap).toBe(2);
    expect(parsed.laps.fastestTime).toBeCloseTo(9.75, 3);
    expect(parsed.warnings).toEqual([]);
  });
});

describe("parseAimCsv on generic CSVs", () => {
  it("parses a bare names+data CSV", () => {
    const csv = "Time,RPM,Speed\n0,1000,10\n0.1,1100,11\n0.2,1200,12\n";
    const parsed = parseAimCsv(csv);
    expect(parsed.channels.map((c) => c.name)).toEqual(["RPM", "Speed"]);
    expect(parsed.channels[0].freq).toBe(10);
    expect(parsed.laps.totalLaps).toBe(1);
    expect(parsed.laps.beaconTimes).toEqual([]);
  });

  it("parses semicolon-delimited exports", () => {
    const csv = '"Time";"RPM"\n"sec";"rpm"\n0;1000\n0.5;1100\n1.0;1200\n';
    const parsed = parseAimCsv(csv);
    expect(parsed.channels[0].name).toBe("RPM");
    expect(parsed.channels[0].unit).toBe("rpm");
    expect(parsed.channels[0].freq).toBe(2);
  });

  it("warns on non-uniform sampling", () => {
    const csv = "Time,RPM\n0,1\n0.1,2\n0.9,3\n1.0,4\n";
    const parsed = parseAimCsv(csv);
    expect(parsed.warnings.some((w) => w.includes("not uniform"))).toBe(true);
  });

  it("rejects CSVs without numeric data", () => {
    expect(() => parseAimCsv("hello\nworld\n")).toThrow();
  });

  it("rejects non-increasing time", () => {
    expect(() => parseAimCsv("Time,RPM\n5,1\n5,2\n5,3\n")).toThrow(
      /not increasing/,
    );
  });
});
