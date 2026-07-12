# CLAUDE.md

Web-based AiM RaceStudio CSV → MoTeC i2 Pro `.ld`/`.ldx` converter. Port of the Windows tool [Aim_2_MoTeC](https://github.com/ludovicb1239/Aim_2_MoTeC) (C#). Pure client-side: Vite + vanilla TypeScript, no framework, no backend.

## Commands

```bash
npm run dev      # Vite dev server (LAN-reachable)
npm run build    # tsc --noEmit + vite build
npm run test     # Vitest (26+ unit tests)
npm run verify   # generates out/sample.ld via vite-node, re-reads it with
                 # scripts/verify_ld.py (independent Python parser) — run this
                 # after ANY change to src/core/ldWriter.ts
```

## Architecture

- `src/core/` — pure TS, DOM-free, fully unit-tested. UI code never does format work.
- `src/core/ldWriter.ts` — **byte-for-byte port of the C# `ldParser.cs`**. i2 Pro rejects files with minor deviations (or silently downgrades them to "Standard" logs), so do not "clean up" magic constants, the write order, or the header template. Offsets are load-bearing.
- `src/core/headerTemplate.ts` — generated sparse encoding of the 13384-byte header template extracted from the C# `full_header.cs`. Regenerate only from the original bytes; never hand-edit runs.
- `src/core/aimCsv.ts` — tolerant parser for RaceStudio 2/3 CSV exports and generic time-series CSVs. Data-start detection is heuristic (first run of all-numeric rows); metadata rows are key/value pairs above the channel-names row.
- Native `.xrk`/`.drk` input is impossible in the browser (needs AiM's proprietary Windows DLL) — don't attempt it; CSV is the supported input.

## Conventions

- Lap channels ("Lap Time", "Lap Number") are synthesized at 10 Hz from beacon markers, mirroring the original tool's `DataLog.fromXRK`.
- Channel rename table follows the upstream `NameConversion.txt` format (`"FROM", "TO", "TO_SHORT"` lines); defaults live in `nameConversion.ts`.
- Tests and the verify script share the synthetic fixture in `tests/helpers/sampleCsv.ts` — if you change it, update `scripts/makeSample.ts` expectations too.
