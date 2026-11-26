/**
 * `prompt.assembled` records must never carry diff, spec, PR text or secrets,
 * in either mode, and `verbose` must only work on a local process.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { loadConfig } from '../src/platform/config.js';
import { PromptLog, redactSecrets, type PromptLogContext } from '../src/platform/prompt-log.js';
import { buildIntentMessages } from '../src/modules/intent/helpers.js';
import { describeExtractionSections } from '../src/modules/conventions/helpers.js';

const CONTEXT: PromptLogContext = {
  correlationId: 'corr-1',
  feature: 'review',
  runId: 'run-1',
  provider: 'openrouter',
  model: 'some/model',
};
const SECRET = 'sk-or-v1-0123456789abcdef0123456789';

function capture() {
  const records: Record<string, unknown>[] = [];
  const logger = {
    info: (obj: unknown) => void records.push(obj as Record<string, unknown>),
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  return { records, logger };
}

const review = assemblePrompt({
  system: 'You review code.',
  prDescription: 'BODY-CANARY',
  intent: { text: 'INTENT-CANARY', confidence: 'partial' },
  specs: ['SPEC-CANARY'],
  callers: 'CALLERS-CANARY',
  task: 'Review "TITLE-CANARY"',
  diff: `+DIFF-CANARY ${SECRET}`,
});
const intent = buildIntentMessages('Classify.', {
  title: 'TITLE-CANARY',
  branch: 'BRANCH-CANARY',
  description: 'BODY-CANARY',
  commits: ['COMMIT-CANARY'],
  files: [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: '+DIFF-CANARY' }],
  issues: [{ number: 7, role: 'target', title: 'ISSUE-CANARY', body: 'ISSUE-CANARY' }],
  specs: [{ path: 'docs/plan.md', content: 'SPEC-CANARY', changedInPr: false }],
});
const extraction = describeExtractionSections('Extract.', [
  { path: 'src/a.ts', content: 'FILE-CANARY' },
]);

describe.each(['summary', 'verbose'] as const)('PromptLog in %s mode', (mode) => {
  const { records, logger } = capture();
  const log = new PromptLog(logger, mode, CONTEXT);
  for (const sections of [review.sections, intent.sections, extraction]) {
    log.call(sections, {
      details: { files: ['src/a.ts'], issues: [7], specs: ['docs/plan.md'] },
      previews: [{ label: 'system_prompt', text: 'You review code.' }],
    });
  }
  log.flush();
  const text = JSON.stringify(records);

  it('names the model, the correlation id and the sections', () => {
    expect(records.length).toBe(mode === 'summary' ? 1 : 3);
    expect(records[0]).toMatchObject({
      event: 'prompt.assembled',
      correlationId: 'corr-1',
      model: 'some/model',
    });
    expect(text).toContain('"name":"diff"');
    expect(text).toContain('"source":"git.diff"');
  });

  it('never carries content or secrets', () => {
    expect(text).not.toContain('CANARY');
    expect(text).not.toContain(SECRET);
  });

  it(mode === 'summary' ? 'omits previews and details' : 'adds previews and details', () => {
    expect(text.includes('"previews"')).toBe(mode === 'verbose');
    expect(text.includes('docs/plan.md')).toBe(mode === 'verbose');
  });
});

describe('PromptLog', () => {
  it('sums map-reduce calls into one summary record', () => {
    const { records, logger } = capture();
    const log = new PromptLog(logger, 'summary', CONTEXT);
    log.call(review.sections);
    log.call(review.sections);
    log.flush();
    log.flush();
    expect(records).toHaveLength(1);
    const diff = review.sections.find((s) => s.name === 'diff')!;
    expect(records[0]).toMatchObject({
      calls: 2,
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'diff', count: 2, chars: diff.chars * 2 }),
      ]),
    });
  });

  it('writes nothing when off and never throws when the logger does', () => {
    const { records, logger } = capture();
    const off = new PromptLog(logger, 'off', CONTEXT);
    off.call(review.sections);
    off.flush();
    expect(records).toHaveLength(0);

    const broken = new PromptLog(
      { ...logger, info: () => { throw new Error('sink down'); } },
      'verbose',
      CONTEXT,
    );
    expect(() => broken.call(review.sections)).not.toThrow();
  });

  it('redacts a secret that straddles the preview cut', () => {
    const { records, logger } = capture();
    const custom = 'plain-configured-value-123456';
    const log = new PromptLog(logger, 'verbose', CONTEXT, [custom]);
    log.call(review.sections, {
      previews: [
        { label: 'system_prompt', text: `${'a'.repeat(185)} ${SECRET}` },
        { label: 'skill', text: `${'b'.repeat(190)} ${custom}` },
      ],
    });
    const text = JSON.stringify(records);
    expect(text).not.toContain('sk-or');
    expect(text).not.toContain('plain-conf');
  });
});

describe('redactSecrets', () => {
  it.each([
    ['ghp_abcdefghijklmnopqrstuvwx', 'ghp_'],
    ['github_pat_11ABCDEFG0123456789_abcdefghij', '11ABCDEFG'],
    ['AKIAIOSFODNN7EXAMPLE', 'AKIA'],
    ['postgres://user:hunter2@localhost:5432/db', 'hunter2'],
    ['password = "hunter2"', 'hunter2'],
    ['{"api_key":"hunter2"}', 'hunter2'],
    ['Authorization: Bearer abcdef123456', 'abcdef123456'],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', 'MIIEow'],
  ])('removes the credential in %s', (input, leaked) => {
    expect(redactSecrets(input)).not.toContain(leaked);
  });
});

describe('PROMPT_LOG gating', () => {
  const mode = (env: Record<string, string>) => loadConfig({ PROMPT_LOG: 'verbose', ...env });

  it('allows verbose on a local process only', () => {
    expect(mode({}).promptLog).toBe('verbose');
    expect(loadConfig({}).promptLog).toBe('summary');
    expect(loadConfig({ PROMPT_LOG: '' }).promptLog).toBe('summary');
  });

  it.each<Record<string, string>>([
    { NODE_ENV: 'production' },
    { API_HOST: '0.0.0.0' },
    { API_ALLOWED_HOSTS: 'devbox.lan' },
    { CI: 'true' },
  ])('downgrades verbose for %o', (env) => {
    expect(mode(env)).toMatchObject({ promptLog: 'summary', promptLogDowngraded: true });
  });
});
