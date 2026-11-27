import { describe, it, expect } from 'vitest';
import { currentOpenFindings } from '../src/modules/reviews/smart-diff/index.js';

const row = (
  id: string,
  agentId: string,
  day: number,
  findings: { startLine: number; kind?: string; dismissedAt?: Date }[],
  kind = 'review',
) => ({
  review: { id, prId: 'pr', agentId, createdAt: new Date(Date.UTC(2026, 0, day)), kind },
  findings: findings.map((f) => ({
    file: 'src/a.ts',
    startLine: f.startLine,
    kind: f.kind ?? 'finding',
    dismissedAt: f.dismissedAt ?? null,
  })),
});

describe('currentOpenFindings', () => {
  it('takes the newest review per agent, counting every agent', () => {
    const out = currentOpenFindings([
      row('new', 'a1', 2, [{ startLine: 10 }]),
      row('old', 'a1', 1, [{ startLine: 3 }]),
      row('other', 'a2', 1, [{ startLine: 7 }]),
    ]);
    expect(out.map((f) => f.start_line).sort((a, b) => a - b)).toEqual([7, 10]);
  });

  it('ignores summary reviews, dismissed findings and non-finding kinds', () => {
    const out = currentOpenFindings([
      row('summary', 'a1', 3, [{ startLine: 1 }], 'summary'),
      row('review', 'a1', 2, [
        { startLine: 10 },
        { startLine: 5, dismissedAt: new Date() },
        { startLine: 6, kind: 'lethal_trifecta' },
      ]),
    ]);
    expect(out).toEqual([{ file: 'src/a.ts', start_line: 10 }]);
  });
});
