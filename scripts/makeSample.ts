// Generates out/sample.ld + out/sample.ldx from the synthetic AiM CSV fixture,
// plus out/expected.json describing what an independent reader should find.
// Run with: npx vite-node scripts/makeSample.ts   (or `npm run verify`)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAimCsv } from "../src/core/aimCsv";
import { convert } from "../src/core/convert";
import { DEFAULT_NAME_TABLE } from "../src/core/nameConversion";
import { makeSampleCsv, SAMPLE_SPEC } from "../tests/helpers/sampleCsv";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(outDir, { recursive: true });

const csv = makeSampleCsv();
writeFileSync(join(outDir, "sample.csv"), csv);

const parsed = parseAimCsv(csv);
const result = convert(parsed, parsed.meta, {
  renameChannels: true,
  nameTable: DEFAULT_NAME_TABLE,
});

writeFileSync(join(outDir, "sample.ld"), result.ld);
writeFileSync(join(outDir, "sample.ldx"), result.ldx);

// What scripts/verify_ld.py should find when it re-reads sample.ld.
const lapChannelSamples = parsed.laps.lapDurations.reduce(
  (acc, d) => acc + Math.floor(d * 10),
  0,
);
const expected = {
  driver: parsed.meta.driver,
  vehicle: parsed.meta.vehicle,
  venue: parsed.meta.venue,
  session: parsed.meta.session,
  date: "01/07/2023",
  time: "10:03:24",
  channels: [
    { name: "Lap Time", unit: "s", freq: 10, samples: lapChannelSamples },
    { name: "Lap Number", unit: "", freq: 10, samples: lapChannelSamples },
    // Renamed via DEFAULT_NAME_TABLE where applicable:
    {
      name: "Engine RPM",
      unit: "rpm",
      freq: SAMPLE_SPEC.freq,
      samples: SAMPLE_SPEC.freq * SAMPLE_SPEC.duration + 1,
    },
    {
      name: "Ground Speed",
      unit: "km/h",
      freq: SAMPLE_SPEC.freq,
      samples: SAMPLE_SPEC.freq * SAMPLE_SPEC.duration + 1,
    },
    {
      name: "G Force Lat",
      unit: "g",
      freq: SAMPLE_SPEC.freq,
      samples: SAMPLE_SPEC.freq * SAMPLE_SPEC.duration + 1,
    },
  ],
  // Spot-check values: [channelIndex, sampleIndex, value]
  probes: [
    [2, 0, parsed.channels[0].values[0]],
    [2, 100, parsed.channels[0].values[100]],
    [3, 0, parsed.channels[1].values[0]],
    [4, 600, parsed.channels[2].values[600]],
    [0, 0, parsed.laps.lapDurations[0]],
    [1, 0, 0],
  ],
  beaconTimes: parsed.laps.beaconTimes,
};
writeFileSync(join(outDir, "expected.json"), JSON.stringify(expected, null, 2));

console.log(`Wrote sample.ld (${result.ld.length} bytes), sample.ldx, expected.json to ${outDir}`);
