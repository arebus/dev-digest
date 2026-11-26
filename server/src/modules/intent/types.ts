/**
 * PR intent facade — the single interface other modules code against
 * (`container.prIntent`).
 */
import type { IntentConfidence, IntentSource, PrIntentRecord, Risk } from '@devdigest/shared';
import type { PromptIntent } from '@devdigest/reviewer-core';
import type { PinoLike } from '../../platform/run-logger.js';

/** A persisted intent as the module's rules see it, independent of the storage layer. */
export interface StoredIntent {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  acceptanceCriteria: string[];
  risks: Risk[];
  sources: IntentSource[];
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  computedAt: Date;
}

export interface EnsureIntentOptions {
  /** Recompute even when the head and sources are unchanged. */
  force?: boolean;
  /** Progress sink (run Live Log). Never receives source content. */
  onLog?: (kind: 'info' | 'tool' | 'result', msg: string) => void;
  logger?: PinoLike;
  /** Ties prompt records to the caller's action; generated when absent. */
  correlationId?: string;
}

export interface IntentOutcome {
  record: PrIntentRecord;
  cached: boolean;
  /** The intent as the review prompt takes it. */
  promptIntent: PromptIntent;
  /** Spec files that were read, for the run trace. */
  specsRead: string[];
  durationMs: number;
}

export interface PrIntentFacade {
  /** Stored intent, or null. Never calls GitHub or a model. */
  get(workspaceId: string, prId: string): Promise<PrIntentRecord | null>;
  /** Return the cached intent when still valid, otherwise derive and store it. */
  ensure(workspaceId: string, prId: string, opts?: EnsureIntentOptions): Promise<IntentOutcome>;
}
