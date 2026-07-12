# aim2motec-web

Browser-based converter from **AiM RaceStudio CSV exports** to **MoTeC i2 Pro** log files (`.ld` + `.ldx`). A web port of [Aim_2_MoTeC](https://github.com/ludovicb1239/Aim_2_MoTeC) (Windows/C#, MIT) — the `.ld` binary writer is a byte-for-byte port of its `ldParser.cs`, including the reverse-engineered header template that i2 Pro requires to recognise the file as a Pro log.

Everything runs client-side; no data leaves the browser.

## Why CSV and not .xrk/.drk?

The original Windows tool reads AiM's native `.xrk`/`.drk` files through AiM's **proprietary closed-source DLL** (`MatLabXRK-*.dll`), which only runs on Windows x64. That DLL cannot run in a browser, and the XRK container format is not publicly documented. So the web version takes the officially supported escape hatch: export your session from RaceStudio as CSV (`File → Export → CSV`), then convert here.

What carries over from the CSV export:

- All data channels (name, unit, sample rate, values)
- Session metadata (venue, vehicle, driver, session, date/time)
- Beacon markers → lap beacons in the `.ldx` + synthetic `Lap Time` / `Lap Number` channels (10 Hz, same as the original tool)
- Optional AiM → MoTeC channel renaming (editable mapping table, same format as `NameConversion.txt`)

## Usage

```bash
npm install
npm run dev        # dev server (LAN-reachable via --host)
npm run build      # type-check + production build → dist/
npm run test       # Vitest unit tests
npm run verify     # end-to-end: generate sample .ld via the TS core,
                   # re-read it with an independent Python parser
```

Then open the page, drop one or more RaceStudio CSV exports, adjust driver/vehicle/venue if needed, and download the `.ld`/`.ldx` pair. Put both files in the same folder and open the `.ld` in i2 Pro.

## Architecture

```
src/core/            pure, DOM-free, unit-tested
  headerTemplate.ts  13384-byte .ld header template (sparse), from full_header.cs
  ldWriter.ts        .ld binary + .ldx XML writer (port of ldParser.cs)
  aimCsv.ts          RaceStudio CSV parser (RS2/RS3 + generic time-series CSV)
  nameConversion.ts  AiM→MoTeC channel-name table (NameConversion.txt format)
  convert.ts         orchestration: parsed CSV → .ld/.ldx bytes
src/main.ts          vanilla-TS UI (drag & drop, metadata editing, preview)
scripts/verify_ld.py independent .ld reader used by `npm run verify`
```

## Format notes

The `.ld` layout (little-endian throughout):

| offset | content |
|---|---|
| 0x0000 | header: magic `0x40`, pointers to channel meta / data / event block, device info, date/time, driver/vehicle/venue/session strings |
| 0x06E2 | event block (from template) |
| 0x3448 | channel metadata: doubly-linked list of 124-byte records (name, short name, unit, Hz, type=float32) |
| after  | raw float32 sample data, one contiguous block per channel |

Lap beacons live in the companion `.ldx` XML as microsecond timestamps.

## License

MIT, same as the upstream project it ports.
