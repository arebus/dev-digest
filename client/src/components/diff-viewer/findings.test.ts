import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import {
  countFilesWithOpenFindings,
  openFindings,
  partitionFindings,
  worstSeverity,
} from "./findings";

const finding = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "A finding",
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "because",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

describe("diff finding helpers", () => {
  it("anchors a finding only when its new-file start line is rendered", () => {
    const hit = finding({ id: "hit", start_line: 2 });
    const leftOnly = finding({ id: "left", start_line: 5 });
    const absent = finding({ id: "absent", start_line: 99 });
    const { matched, outside } = partitionFindings(
      [hit, leftOnly, absent],
      new Set(["RIGHT:2", "LEFT:5"]),
    );
    expect([...matched]).toEqual([["RIGHT:2", [hit]]]);
    expect(outside).toEqual([leftOnly, absent]);
  });

  it("ignores dismissed findings in open lists and counts, and picks the worst severity", () => {
    const sugg = finding({ id: "s", severity: "SUGGESTION" });
    const crit = finding({ id: "c", severity: "CRITICAL" });
    const gone = finding({ id: "g", dismissed_at: "2026-01-01T00:00:00Z" });
    expect(openFindings([sugg, gone])).toEqual([sugg]);
    expect(worstSeverity([sugg, crit])).toBe("CRITICAL");
    expect(worstSeverity([])).toBeNull();
    const byFile = new Map([
      ["a", [sugg, crit]],
      ["b", [gone]],
    ]);
    expect(countFilesWithOpenFindings(["a", "b", "c"], byFile)).toBe(1);
  });
});
