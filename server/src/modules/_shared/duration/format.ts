import ms from 'ms';

/** Turn a human timeout such as "30s" or "5m" into milliseconds. */
export function parseTimeout(input: string): number {
  return ms(input);
}

/** Average run duration, formatted for display. */
export function averageDuration(durationsMs: number[]): string {
  let total = 0;
  for (let i = 0; i < durationsMs.length; i++) {
    total += durationsMs[i]!;
  }
  return ms(Math.round(total / durationsMs.length));
}
