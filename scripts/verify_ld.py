#!/usr/bin/env python3
"""Independent verifier for generated MoTeC .ld files.

Re-reads out/sample.ld with a from-scratch parser (offsets per the ldparser
format, https://github.com/gotzl/ldparser) and checks it against
out/expected.json produced by scripts/makeSample.ts. Exits non-zero on any
mismatch, so `npm run verify` fails loudly.
"""

import json
import math
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "out"

FAILURES = []


def check(label, actual, expected):
    ok = actual == expected
    if isinstance(expected, float):
        ok = math.isclose(actual, expected, rel_tol=1e-5, abs_tol=1e-5)
    status = "ok " if ok else "FAIL"
    print(f"  [{status}] {label}: {actual!r}" + ("" if ok else f" != expected {expected!r}"))
    if not ok:
        FAILURES.append(label)


def cstr(raw: bytes) -> str:
    return raw.split(b"\x00", 1)[0].decode("utf-8", "replace")


def main():
    data = (OUT / "sample.ld").read_bytes()
    expected = json.loads((OUT / "expected.json").read_text())

    print("== .ld header ==")
    (magic,) = struct.unpack_from("<I", data, 0)
    check("magic", magic, 0x40)
    meta_ptr, data_ptr = struct.unpack_from("<II", data, 8)
    check("channel meta ptr", meta_ptr, 0x3448)
    (event_ptr,) = struct.unpack_from("<I", data, 36)
    check("event ptr", event_ptr, 1762)
    (serial,) = struct.unpack_from("<I", data, 70)
    check("device serial", serial, 12007)
    check("device type", cstr(data[74:82]), "ADL")
    (version,) = struct.unpack_from("<H", data, 82)
    check("device version", version, 420)
    (num_channels,) = struct.unpack_from("<I", data, 86)
    check("channel count", num_channels, len(expected["channels"]))
    check("date", cstr(data[94:110]), expected["date"])
    check("time", cstr(data[126:142]), expected["time"])
    check("driver", cstr(data[158:222]), expected["driver"])
    check("vehicle", cstr(data[222:286]), expected["vehicle"])
    check("venue", cstr(data[350:414]), expected["venue"])
    check("session", cstr(data[1508:1572]), expected["session"])
    check("event name (template)", cstr(data[1762:1826]), "i2 data day")

    print("== channel chain ==")
    channels = []
    ptr = meta_ptr
    prev = 0
    while ptr:
        (p_prev, p_next, d_ptr, d_len, _x, ctype, size, freq, shift, mul, scale, dec) = (
            struct.unpack_from("<IIIIHHHHHHHh", data, ptr)
        )
        name = cstr(data[ptr + 32 : ptr + 64])
        short = cstr(data[ptr + 64 : ptr + 72])
        unit = cstr(data[ptr + 72 : ptr + 84])
        if p_prev != prev:
            FAILURES.append(f"prev ptr of {name}")
            print(f"  [FAIL] prev ptr of {name}: {p_prev} != {prev}")
        if ctype != 7 or size != 4:
            FAILURES.append(f"type/size of {name}")
            print(f"  [FAIL] {name}: type={ctype} size={size}, expected float32")
        values = struct.unpack_from(f"<{d_len}f", data, d_ptr)
        channels.append({"name": name, "short": short, "unit": unit, "freq": freq, "values": values})
        prev = ptr
        ptr = p_next

    check("channels found by walking the chain", len(channels), num_channels)
    for i, exp in enumerate(expected["channels"]):
        ch = channels[i]
        check(f"ch{i} name", ch["name"], exp["name"])
        check(f"ch{i} unit", ch["unit"], exp["unit"])
        check(f"ch{i} freq", ch["freq"], exp["freq"])
        check(f"ch{i} samples", len(ch["values"]), exp["samples"])

    print("== sample values ==")
    for ch_idx, sample_idx, value in expected["probes"]:
        check(f"ch{ch_idx}[{sample_idx}]", channels[ch_idx]["values"][sample_idx], float(value))

    # Data must fill the file exactly: no gaps, no trailing garbage.
    total_data = sum(len(c["values"]) * 4 for c in channels)
    check("file size", len(data), 0x3448 + num_channels * 124 + total_data)

    print("== .ldx ==")
    ldx = (OUT / "sample.ldx").read_text()
    root = ET.fromstring(ldx)
    markers = root.findall(".//Marker")
    check("beacon count", len(markers), len(expected["beaconTimes"]))
    for m, t in zip(markers, expected["beaconTimes"]):
        check(f"beacon @{t}s", float(m.get("Time")) / 1e6, float(t))

    print()
    if FAILURES:
        print(f"VERIFY FAILED: {len(FAILURES)} mismatches: {FAILURES}")
        sys.exit(1)
    print("VERIFY OK: .ld structure, channel chain, sample data and .ldx beacons all match.")


if __name__ == "__main__":
    main()
