import type { Severity } from "@devdigest/ui";

/** Sort weight per severity: lower = more severe, shown first. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};
