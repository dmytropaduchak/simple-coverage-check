export type Severity = "high" | "medium" | "low";
export type Finding = {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  file: string;
};

export function parseCoverageSummary(text: string): number | null {
  try {
    const json = JSON.parse(text) as { total?: { lines?: { pct?: number } } };
    const pct = json.total?.lines?.pct;
    return typeof pct === "number" ? pct : null;
  } catch {
    return null;
  }
}

export function parseLcovLines(text: string): number | null {
  let found = 0;
  let hit = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("LF:")) found += Number(line.slice(3)) || 0;
    if (line.startsWith("LH:")) hit += Number(line.slice(3)) || 0;
  }
  if (!found) return null;
  return (hit / found) * 100;
}

export function compareCoverage(
  basePct: number,
  headPct: number,
  maxDrop: number,
  file: string,
): Finding[] {
  const drop = basePct - headPct;
  if (drop <= maxDrop) return [];
  return [
    {
      ruleId: "coverage-drop",
      severity: drop >= maxDrop * 2 ? "high" : "medium",
      title: `Lines coverage dropped ${drop.toFixed(2)}pp (${basePct.toFixed(2)}% → ${headPct.toFixed(2)}%)`,
      detail: `Allowed drop is ${maxDrop} percentage points.`,
      file,
    },
  ];
}
