import type { SmartDiffRole } from "@devdigest/shared";

/** Colour square per role (never the severity colours). */
export const ROLE_SWATCH: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--info)",
  docs: "var(--text-secondary)",
  boilerplate: "var(--text-muted)",
};

export const COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>([
  "docs",
  "boilerplate",
]);

/** `prReview` message keys per role. */
export const ROLE_MESSAGE_KEY: Record<SmartDiffRole, { label: string; hint: string }> = {
  core: { label: "smartDiff.coreLabel", hint: "smartDiff.coreHint" },
  tests: { label: "smartDiff.testsLabel", hint: "smartDiff.testsHint" },
  wiring: { label: "smartDiff.wiringLabel", hint: "smartDiff.wiringHint" },
  docs: { label: "smartDiff.docsLabel", hint: "smartDiff.docsHint" },
  boilerplate: { label: "smartDiff.boilerplateLabel", hint: "smartDiff.boilerplateHint" },
};
