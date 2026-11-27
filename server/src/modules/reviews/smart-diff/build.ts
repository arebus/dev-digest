import type { SmartDiff } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

/**
 * Group a PR's files by review role. Groups follow `SMART_DIFF_ROLE_ORDER`, empty
 * ones are left out, and files keep their input order inside a group.
 */
export function buildSmartDiff(
  files: readonly { path: string; additions: number; deletions: number }[],
  findings: readonly { file: string; start_line: number }[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const lines = linesByFile.get(f.file) ?? new Set<number>();
    lines.add(f.start_line);
    linesByFile.set(f.file, lines);
  }

  const classified = files.map((file) => ({ role: classifyFile(file.path), file }));
  const groups = SMART_DIFF_ROLE_ORDER.map((role) => ({
    role,
    files: classified
      .filter((c) => c.role === role)
      .map(({ file }) => ({
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
      })),
  })).filter((group) => group.files.length > 0);

  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: files.reduce((sum, f) => sum + f.additions + f.deletions, 0),
      proposed_splits: [],
    },
  };
}
