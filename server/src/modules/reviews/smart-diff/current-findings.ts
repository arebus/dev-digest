import { currentReviewIds } from '../../_shared/current-review.js';

/**
 * Open findings of a PR's current review (newest `review` per agent). Dismissed
 * findings, non-`finding` kinds and `summary` reviews are skipped.
 */
export function currentOpenFindings(
  rows: readonly {
    review: { id: string; prId: string; agentId: string | null; createdAt: Date; kind: string };
    findings: readonly {
      file: string;
      startLine: number;
      kind: string;
      dismissedAt: Date | null;
    }[];
  }[],
): { file: string; start_line: number }[] {
  const reviews = rows.filter((r) => r.review.kind === 'review');
  const current = new Set(currentReviewIds(reviews.map((r) => r.review)));
  return reviews
    .filter((r) => current.has(r.review.id))
    .flatMap((r) => r.findings)
    .filter((f) => f.kind === 'finding' && !f.dismissedAt)
    .map((f) => ({ file: f.file, start_line: f.startLine }));
}
