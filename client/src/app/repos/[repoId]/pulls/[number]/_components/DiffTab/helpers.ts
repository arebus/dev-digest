/** Pure derivations for the Files changed tab. */
import type { DiffGroup } from "@/components/diff-viewer";
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiff,
  SmartDiffRole,
} from "@devdigest/shared";

/**
 * Findings of the PR's current review: the newest `review` per agent. Dismissed
 * ones are kept (shown muted); non-`finding` kinds are not.
 */
export function currentFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const latest = new Map<string, ReviewRecord>(); // key: agent_id
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const key = review.agent_id ?? "";
    const prev = latest.get(key);
    if (!prev || Date.parse(review.created_at) > Date.parse(prev.created_at)) {
      latest.set(key, review);
    }
  }
  return [...latest.values()].flatMap((r) => r.findings).filter((f) => f.kind === "finding");
}

export function findingsByFile(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byFile = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }
  return byFile;
}

/**
 * Resolve the smart diff's paths to the PR's files, keeping GitHub order inside a
 * group. A file the smart diff doesn't list goes to `core`, so none disappears.
 */
export function toRoleGroups(smartDiff: SmartDiff, files: PrFile[]): DiffGroup[] {
  const roleByPath = new Map<string, SmartDiffRole>(
    smartDiff.groups.flatMap((g) => g.files.map((f) => [f.path, g.role] as const)),
  );
  const roles = smartDiff.groups.map((g) => g.role);
  if (!roles.includes("core")) roles.unshift("core");

  return roles
    .map((role) => ({
      role,
      files: files.filter((f) => (roleByPath.get(f.path) ?? "core") === role),
    }))
    .filter((g) => g.files.length > 0);
}

export function diffTotals(files: PrFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (sum, f) => ({
      additions: sum.additions + f.additions,
      deletions: sum.deletions + f.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}
