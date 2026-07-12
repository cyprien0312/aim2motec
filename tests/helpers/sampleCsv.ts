// Shared synthetic AiM RaceStudio-style CSV fixture used by unit tests and
// the end-to-end verify script.

export interface SampleSpec {
  freq: number; // Hz
  duration: number; // seconds (exclusive of the final sample step)
  beaconMarkers: number[];
}

export const SAMPLE_SPEC: SampleSpec = {
  freq: 20,
  duration: 30,
  beaconMarkers: [9.5, 19.25],
};

/** Deterministic sine-ish channel values so the verifier can recompute them. */
export function sampleValue(channel: number, t: number): number {
  return Math.fround(
    Math.sin(t * (channel + 1) * 0.7) * 100 + channel * 10,
  );
}

export const SAMPLE_CHANNELS = [
  { name: "RPM", unit: "rpm" },
  { name: "SpeedVeh", unit: "km/h" },
  { name: "GLat", unit: "g" },
];

export function makeSampleCsv(): string {
  const { freq, duration, beaconMarkers } = SAMPLE_SPEC;
  const lines: string[] = [
    '"Format","AIM CSV File"',
    '"Venue","Calder Park"',
    '"Vehicle","Kart 32"',
    '"User","Test Driver"',
    '"Data Source","AIM Data Logger"',
    '"Comment","practice session"',
    '"Date","Saturday, July 01, 2023"',
    '"Time","10:03:24 AM"',
    `"Sample Rate","${freq}"`,
    `"Duration","${duration}"`,
    '"Segment","Session 2"',
    `"Beacon Markers","${beaconMarkers.map((m) => m.toFixed(3)).join("  ")}"`,
    '"Segment Times"," 0:09.500"," 0:09.750"," 0:10.800"',
    "",
    `"Time",${SAMPLE_CHANNELS.map((c) => `"${c.name}"`).join(",")}`,
    `"sec",${SAMPLE_CHANNELS.map((c) => `"${c.unit}"`).join(",")}`,
  ];
  const n = freq * duration + 1;
  for (let i = 0; i < n; i++) {
    const t = i / freq;
    const cells = [t.toFixed(3)];
    for (let c = 0; c < SAMPLE_CHANNELS.length; c++) {
      cells.push(sampleValue(c, t).toFixed(6));
    }
    lines.push(cells.map((v) => `"${v}"`).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
