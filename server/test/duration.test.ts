import { describe, it, expect } from 'vitest';
import { parseTimeout, averageDuration } from '../src/modules/_shared/duration/index.js';

describe('duration helpers', () => {
  it('parses a human timeout', () => {
    expect(parseTimeout('30s')).toBe(30_000);
  });

  it('formats the average of several runs', () => {
    expect(averageDuration([1000, 3000])).toBe('2s');
  });
});
