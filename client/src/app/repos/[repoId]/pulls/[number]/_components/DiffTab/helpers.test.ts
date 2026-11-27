import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord, SmartDiff } from "@devdigest/shared";
import {
  currentFindings,
  diffOrderParam,
  diffTotals,
  findingsByFile,
  parseDiffOrder,
  toRoleGroups,
} from "./helpers";

const finding = (id: string, kind = "finding"): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: id,
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "because",
  confidence: 0.9,
  kind: kind as FindingRecord["kind"],
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
});

const review = (
  agent: string,
  day: number,
  findings: FindingRecord[],
  kind: ReviewRecord["kind"] = "review",
): ReviewRecord => ({
  id: `${agent}-${day}-${kind}`,
  pr_id: "pr",
  agent_id: agent,
  run_id: null,
  kind,
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at: `2026-01-0${day}T00:00:00Z`,
  findings,
});

const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

describe("DiffTab helpers", () => {
  it("takes findings from the newest review per agent, skipping summaries and trifecta", () => {
    const out = currentFindings([
      review("a1", 1, [finding("old")]),
      review("a1", 2, [finding("new"), finding("trifecta", "lethal_trifecta")]),
      review("a1", 3, [finding("summary")], "summary"),
      review("a2", 1, [finding("other")]),
    ]);
    expect(out.map((f) => f.id).sort()).toEqual(["new", "other"]);
    expect(findingsByFile(out).get("src/a.ts")).toHaveLength(2);
  });

  it("keeps GitHub order inside a group, sends orphans to core and drops unknown paths", () => {
    const entry = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
    const smart: SmartDiff = {
      groups: [
        { role: "tests", files: [entry("b.test.ts"), entry("a.test.ts")] },
        { role: "docs", files: [entry("gone.md")] },
      ],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    };
    const groups = toRoleGroups(smart, [file("a.test.ts"), file("orphan.ts"), file("b.test.ts")]);
    expect(groups.map((g) => [g.role, g.files.map((f) => f.path)])).toEqual([
      ["core", ["orphan.ts"]],
      ["tests", ["a.test.ts", "b.test.ts"]],
    ]);
  });

  it("reads and writes the order query param, with smart as the unlisted default", () => {
    expect([null, "smart", "bogus", "original"].map(parseDiffOrder)).toEqual([
      "smart",
      "smart",
      "smart",
      "original",
    ]);
    expect(diffOrderParam("smart")).toBeNull();
    expect(diffOrderParam("original")).toBe("original");
  });

  it("sums additions and deletions", () => {
    expect(diffTotals([file("a", 3, 1), file("b", 4, 2)])).toEqual({ additions: 7, deletions: 3 });
  });
});
