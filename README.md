# aim2motec-web

Browser-based converter from **AiM** telemetry to **MoTeC i2 Pro** log files (`.ld` + `.ldx`). Drop a native **`.xrk`** / **`.xrz`** logger file — or a RaceStudio **CSV** export — and download an i2 Pro log pair. No AiM or MoTeC software required.

Everything runs client-side; no data leaves the browser.

**[▶ Try it live](https://claude.ai/code/artifact/037be539-a837-403f-9046-53c56c3afa0f)**

## What it does

- **Native `.xrk` / `.xrz`** parsing in the browser via [aim-xrk](https://www.npmjs.com/package/aim-xrk) ([xrk-js](https://github.com/cyprien0312/xrk-js)) — no RaceStudio, no AiM DLL. XRZ is auto-decompressed.
- **RaceStudio CSV** exports also supported (`File → Export → CSV`).
- Writes a MoTeC i2 **Pro** `.ld` + `.ldx` pair. The `.ld` writer is a byte-for-byte port of [Aim_2_MoTeC](https://github.com/ludovicb1239/Aim_2_MoTeC)'s `ldParser.cs`, including the reverse-engineered header template i2 Pro requires to accept a file as a Pro log.

Carried across from the log:

- All data channels (name, unit, sample rate, values) — each channel resampled onto a uniform grid for the `.ld` format
- Session metadata (venue, vehicle, driver, session, date/time), editable before download
- Laps → beacons in the `.ldx` + synthetic `Lap Time` / `Lap Number` channels (10 Hz)
- Optional AiM → MoTeC channel renaming (editable table, `NameConversion.txt` format)

## Usage

```bash
npm install
npm run dev        # dev server (LAN-reachable via --host)
npm run build      # type-check + production build → dist/
npm run test       # Vitest unit tests
npm run verify     # CSV path: generate a sample .ld, re-read with a Python parser
```

Verify the XRK path against a real file:

```bash
npx vite-node scripts/verifyXrk.ts path/to/session.xrk   # → out/*.ld + structure check
```

Open the page, drop `.xrk` / `.xrz` / `.csv` files, adjust metadata if needed, and download the `.ld` / `.ldx` pair. Put both files in the same folder and open the `.ld` in i2 Pro.

## Architecture

```
src/core/            pure, DOM-free, unit-tested
  ldWriter.ts        .ld binary + .ldx XML writer (port of ldParser.cs)
  headerTemplate.ts  13384-byte .ld header template (sparse), from full_header.cs
  aimCsv.ts          RaceStudio CSV parser (RS2/RS3 + generic time-series CSV)
  xrkAdapter.ts      aim-xrk XrkLog → ParsedCsv (resample to uniform grid)
  nameConversion.ts  AiM→MoTeC channel-name table
  convert.ts         orchestration: ParsedCsv → .ld/.ldx bytes
src/main.ts          vanilla-TS UI (drag & drop, metadata editing, preview)
scripts/verify_ld.py   independent .ld reader (CSV path)
scripts/verifyXrk.ts   XRK → .ld end-to-end + structure re-read
```

Both input paths converge on the same `ParsedCsv` shape, so the `.ld`/`.ldx` writer is shared and unchanged.

## Native XRK resampling

MoTeC `.ld` stores each channel at a fixed frequency with samples assumed uniform from t=0. AiM channels arrive at their native rates with explicit per-sample timecodes, so `xrkAdapter.ts` resamples each channel onto a clean 0-based grid (linear interpolation for analog channels, previous-value hold for stepped ones). Verified end-to-end on real files (kart, single-seater XRZ, a 100-channel 42 MB GT86 log, and a file exercising the AiM GPS timing bug): the generated `.ld` round-trips structurally and an independent Python reader confirms physically sane channel ranges.

## Credits & license

MIT.

- `.ld`/`.ldx` writer ported from [Aim_2_MoTeC](https://github.com/ludovicb1239/Aim_2_MoTeC) (MIT).
- Native `.xrk`/`.xrz` parsing by [aim-xrk / xrk-js](https://github.com/cyprien0312/xrk-js) (MIT), a TypeScript port of [libxrk](https://github.com/m3rlin45/libxrk) (MIT).
