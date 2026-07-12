// MoTeC .ld header template (13384 bytes), extracted from Aim_2_MoTeC full_header.cs
// (https://github.com/ludovicb1239/Aim_2_MoTeC, MIT). Mostly zeros; stored as sparse runs.
export const HEADER_TEMPLATE_SIZE = 13384;

const RUNS: Array<[number, string]> = [
  [0, "40"],
  [8, "48340000105a"],
  [36, "e206"],
  [66, "40420f00e72e000041444c"],
  [82, "a40180004e0000006400010032332f31312f32303035"],
  [126, "30393a35333a3030"],
  [221, "20313141"],
  [285, "20"],
  [349, "2043616c646572"],
  [413, "20"],
  [1502, "2208d200000032"],
  [1572, "7365636f6e64207761726d7570"],
  [1635, "20"],
  [1644, "63"],
  [1762, "6932206461746120646179"],
  [1826, "32"],
  [1890, "43616c646572205061726b2c2032332f31312f30352c2066696e652073756e6e7920646179"],
  [2914, "36130000482c"],
  [4918, "43616c646572"],
  [6016, "541f"],
  [8020, "313141"],
  [8084, "446179746f6e61"],
  [8216, "436172"],
  [8282, "0a0ac6077c0646057404e803"],
  [8304, "d007"],
];

export function headerTemplate(): Uint8Array {
  const buf = new Uint8Array(HEADER_TEMPLATE_SIZE);
  for (const [off, hexStr] of RUNS) {
    for (let i = 0; i < hexStr.length / 2; i++) {
      buf[off + i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
    }
  }
  return buf;
}
