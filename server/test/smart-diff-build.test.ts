import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff } from '../src/modules/reviews/smart-diff/index.js';

const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

describe('buildSmartDiff', () => {
  it('orders groups by role, keeps input order inside a group and omits empty groups', () => {
    const out = buildSmartDiff(
      [file('pnpm-lock.yaml'), file('src/b.ts'), file('src/a.test.ts'), file('src/a.ts')],
      [],
    );
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'tests', 'boilerplate']);
    expect(out.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('attaches sorted, unique finding lines to the matching file only', () => {
    const out = buildSmartDiff(
      [file('src/a.ts'), file('src/b.ts')],
      [
        { file: 'src/a.ts', start_line: 30 },
        { file: 'src/a.ts', start_line: 4 },
        { file: 'src/a.ts', start_line: 30 },
        { file: 'src/not-in-pr.ts', start_line: 1 },
      ],
    );
    expect(out.groups[0]!.files.map((f) => [f.path, f.finding_lines])).toEqual([
      ['src/a.ts', [4, 30]],
      ['src/b.ts', []],
    ]);
  });

  it('sums changed lines, never proposes a split and matches the contract', () => {
    const out = buildSmartDiff([file('src/a.ts', 10, 3), file('README.md', 2, 1)], []);
    expect(out.split_suggestion).toEqual({
      too_big: false,
      total_lines: 16,
      proposed_splits: [],
    });
    expect(SmartDiff.parse(out)).toEqual(out);
  });
});
