import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/reviews/smart-diff/constants.js';

// Rules are checked in this order, first match wins:
// boilerplate → tests → wiring → docs → core (fallback).
const TABLE: [path: string, role: SmartDiffRole, why: string][] = [
  ['server/src/modules/reviews/service.ts', 'core', 'application logic'],
  ['client/src/lib/api.ts', 'core', 'application logic'],
  // package.json is deliberately not in the wiring patterns.
  ['package.json', 'core', 'not listed in any pattern'],

  ['pnpm-lock.yaml', 'boilerplate', 'pnpm lock file'],
  ['client/package-lock.json', 'boilerplate', 'npm lock file, nested'],
  ['yarn.lock', 'boilerplate', 'yarn lock file'],
  ['Cargo.lock', 'boilerplate', 'any *.lock'],
  ['dist/a.js', 'boilerplate', 'build output directory'],
  ['server/build/main.js', 'boilerplate', 'build output directory, nested'],
  ['x.min.js', 'boilerplate', 'minified'],
  ['api.generated.ts', 'boilerplate', 'generated'],
  // Pinned: a snapshot under __tests__ is generated output, so boilerplate beats tests.
  ['src/__tests__/__snapshots__/x.snap', 'boilerplate', 'boilerplate is checked before tests'],

  // Pinned: .claude/** configures the agent harness, so wiring beats docs for *.md.
  ['.claude/skills/security/SKILL.md', 'wiring', 'wiring is checked before docs'],
  // Pinned: everything under e2e/ belongs to the test suite, so tests beats docs.
  ['e2e/README.md', 'tests', 'tests is checked before docs'],

  ['server/test/helpers/pg.ts', 'tests', 'test/ directory'],
  ['server/tests/util.ts', 'tests', 'tests/ directory'],
  ['a.it.test.ts', 'tests', 'integration test suffix'],
  ['b.spec.ts', 'tests', 'spec suffix'],
  ['src/x.test.tsx', 'tests', 'tsx test suffix'],

  ['server/src/modules/index.ts', 'wiring', 'barrel / registration file'],
  ['vitest.config.ts', 'wiring', 'tool config'],
  ['tsconfig.base.json', 'wiring', 'TypeScript config'],
  ['.eslintrc.json', 'wiring', 'lint config'],
  ['.env.example', 'wiring', 'environment template'],
  ['docker-compose.yml', 'wiring', 'compose file'],
  ['.github/workflows/ci.yml', 'wiring', 'CI config'],

  ['docs/agent-prompts/x.md', 'docs', 'docs/ directory'],
  ['README.md', 'docs', 'readme'],
  ['NOTES.MD', 'docs', 'markdown extension is case-insensitive'],
  ['CHANGELOG.md', 'docs', 'changelog'],
  ['LICENSE', 'docs', 'license'],
];

describe('classifyFile', () => {
  it.each(TABLE)('%s → %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('orders every contract role exactly once', () => {
    expect([...SMART_DIFF_ROLE_ORDER].sort()).toEqual([...SmartDiffRole.options].sort());
  });
});
