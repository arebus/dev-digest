import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES } from './constants.js';

/** The review role of a changed file, decided from its repo-relative path alone. */
export function classifyFile(path: string): SmartDiffRole {
  return ROLE_RULES.find((rule) => rule.pattern.test(path))?.role ?? 'core';
}
