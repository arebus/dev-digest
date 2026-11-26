import { SEV, type IconName, type Severity } from "@devdigest/ui";
import type { IntentConfidence, IntentRiskKind, RiskSeverity } from "@devdigest/shared";

export const RISK_KIND_ICON: Record<IntentRiskKind, IconName> = {
  security: "Shield",
  auth: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  data: "Database",
  api: "Globe",
  config: "Settings",
  concurrency: "Activity",
  other: "AlertTriangle",
};

export const FALLBACK_RISK_ICON: IconName = "AlertTriangle";

/** Risk severity borrows the finding-severity palette. */
const SEVERITY_TONE: Record<RiskSeverity, Severity> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};

export const RISK_COLORS: Record<RiskSeverity, { c: string; bg: string }> = {
  high: SEV[SEVERITY_TONE.high],
  medium: SEV[SEVERITY_TONE.medium],
  low: SEV[SEVERITY_TONE.low],
};

export const CONFIDENCE_COLORS: Record<IntentConfidence, { c: string; bg: string }> = {
  stated: { c: "var(--ok)", bg: "var(--ok-bg)" },
  partial: { c: "var(--info)", bg: "var(--info-bg)" },
  inferred: { c: "var(--warn)", bg: "var(--warn-bg)" },
};

/** Reason codes that have a translation under `intent.reason`. */
export const KNOWN_REASONS: readonly string[] = [
  "not_found",
  "not_file",
  "too_large",
  "not_text",
  "invalid_path",
  "external_url",
  "other_repository",
  "pull_request",
  "directory",
  "unsupported",
  "unsupported_file",
  "limit",
  "budget",
  "empty",
  "github_unavailable",
  "github_error",
];
