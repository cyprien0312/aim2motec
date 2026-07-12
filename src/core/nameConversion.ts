// AiM → MoTeC channel-name mapping. Default table ported from
// Aim_2_MoTeC's NameConversion.txt; users can extend it in the UI.

export interface NameConvert {
  from: string;
  to: string;
  toShort: string;
}

export const DEFAULT_NAME_TABLE: NameConvert[] = [
  { from: "ASteering", to: "Steered Angle", toShort: "Str Ang" },
  { from: "Brake", to: "Brake Pos", toShort: "Brk Pos" },
  { from: "SpeedVeh", to: "Ground Speed", toShort: "Gnd Spd" },
  { from: "RPM", to: "Engine RPM", toShort: "RPM" },
  { from: "GLat", to: "G Force Lat", toShort: "G Lat" },
  { from: "GVert", to: "G Force Vert", toShort: "G Vert" },
  { from: "GLong", to: "G Force Long", toShort: "G Long" },
  { from: "VWheelFL", to: "Wheel Speed FL", toShort: "WSpd FL" },
  { from: "VWheelFR", to: "Wheel Speed FR", toShort: "WSpd FR" },
  { from: "VWheelRL", to: "Wheel Speed RL", toShort: "WSpd RL" },
  { from: "VWheelRR", to: "Wheel Speed RR", toShort: "WSpd RR" },
  { from: "WaterTemps", to: "Eng Water Temp", toShort: "WaterTemp" },
];

/**
 * Parse a user-edited mapping in the NameConversion.txt format:
 * one `"FROM", "TO", "TO_SHORT"` triple per line, `#` comments allowed.
 */
export function parseNameTable(text: string): NameConvert[] {
  const table: NameConvert[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"/);
    if (m) table.push({ from: m[1], to: m[2], toShort: m[3] });
  }
  return table;
}

/** Serialize a table back to the NameConversion.txt format. */
export function stringifyNameTable(table: NameConvert[]): string {
  return [
    "# FROM, TO, TO_SHORT",
    ...table.map((e) => `"${e.from}", "${e.to}", "${e.toShort}"`),
  ].join("\n");
}

/** Look up a channel name; returns undefined when no mapping exists. */
export function lookupName(
  table: NameConvert[],
  name: string,
): NameConvert | undefined {
  return table.find((e) => e.from === name);
}
