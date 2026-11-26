/**
 * Section metadata of assemblePrompt: it must mirror what is sent, say what was
 * truncated, and carry no content.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

const parts = {
  system: 'SYSTEM-CANARY',
  task: 'Review PR #1 "TITLE-CANARY"',
  prDescription: `DESCRIPTION-CANARY ${'x'.repeat(5000)}`,
  intent: { text: 'INTENT-CANARY', confidence: 'stated' as const },
  skills: ['SKILL-CANARY'],
  callers: 'CALLERS-CANARY',
  diff: '+DIFF-CANARY',
};

describe('assemblePrompt sections', () => {
  const { sections, messages } = assemblePrompt(parts);
  const byName = new Map(sections.map((s) => [s.name, s]));

  it('lists every section sent, in prompt order', () => {
    expect(sections.map((s) => s.name)).toEqual([
      'system',
      'task',
      'pr_description',
      'intent',
      'skills',
      'callers',
      'diff',
    ]);
  });

  it('reports the lengths of exactly what was sent', () => {
    const [system, ...user] = sections;
    expect(system!.chars).toBe(messages[0]!.content.length);
    const joined = user.reduce((n, s) => n + s.chars, 0) + 2 * (user.length - 1);
    expect(joined).toBe(messages[1]!.content.length);
  });

  it('flags truncation with the original length', () => {
    expect(byName.get('pr_description')).toMatchObject({
      truncated: true,
      originalChars: parts.prDescription.length,
    });
    expect(byName.get('diff')!.truncated).toBe(false);
  });

  it('carries no content', () => {
    expect(JSON.stringify(sections)).not.toContain('CANARY');
  });

  it('counts tokens only when asked and leaves the prompt unchanged', () => {
    const counted = assemblePrompt({ ...parts, countTokens: () => 7 });
    expect(counted.sections.every((s) => s.tokens === 7)).toBe(true);
    expect(counted.messages).toEqual(messages);
    expect(byName.get('diff')!.tokens).toBeUndefined();
  });
});
