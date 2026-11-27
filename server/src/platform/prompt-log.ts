/**
 * Structured `prompt.assembled` records: what a prompt is made of, never what it
 * says. The one exception is `verbose` (local only, see config.ts), which adds
 * short, redacted previews of TRUSTED text that the caller hands over explicitly.
 */
import type { SecretsProvider } from '@devdigest/shared';
import type { PromptSectionMeta as SectionMeta } from './prompt.js';
import type { PromptLogMode } from './config.js';
import type { PinoLike } from './run-logger.js';

export const PROMPT_LOG_EVENT = 'prompt.assembled';
const PREVIEW_CHARS = 200;
const MAX_DETAIL_ITEMS = 50;

export interface PromptLogContext {
  /** One id per user action; ties the records to the run's Live Log. */
  correlationId: string;
  feature: 'review' | 'intent' | 'conventions';
  runId?: string;
  prId?: string;
  agentId?: string;
  provider: string;
  model: string;
}

/** Names and references (never content). Written in `verbose` only. */
export interface PromptDetails {
  files?: string[];
  skills?: string[];
  issues?: number[];
  specs?: string[];
}

/** Trusted text only: there is deliberately no label for diff, spec, issue or PR text. */
export interface PromptPreview {
  label: 'system_prompt' | 'skill' | 'system_template';
  text: string;
}

const REDACTIONS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
  [/\bsk[-_][A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, '[REDACTED]'],
  [/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g, '[REDACTED]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]'],
  [
    /\b([\w-]*(?:password|passwd|secret|token|api[_-]?key)[\w-]*)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1$2[REDACTED]',
  ],
];

/** Remove the configured secret values, then anything shaped like a credential. */
export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  let out = text;
  for (const secret of knownSecrets) {
    if (secret.length >= 6) out = out.split(secret).join('[REDACTED]');
  }
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

/** The configured secret values, for exact-match redaction. Read only in `verbose`. */
export async function loadKnownSecrets(
  mode: PromptLogMode,
  secrets: SecretsProvider,
): Promise<string[]> {
  if (mode !== 'verbose') return [];
  const keys = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY',
    'GITHUB_TOKEN',
    'DATABASE_URL',
  ];
  const values = await Promise.all(keys.map((k) => secrets.get(k).catch(() => undefined)));
  return values.filter((v): v is string => !!v);
}

interface SectionTotal {
  name: SectionMeta['name'];
  source: SectionMeta['source'];
  trust: SectionMeta['trust'];
  count: number;
  chars: number;
  truncated: boolean;
}

/**
 * Collects the model calls of one logical operation. `summary` writes a single
 * record on `flush()`; `verbose` writes one per call. Logging never throws.
 */
export class PromptLog {
  private calls = 0;
  private totals = new Map<string, SectionTotal>();

  constructor(
    private readonly logger: PinoLike | undefined,
    private readonly mode: PromptLogMode,
    private readonly context: PromptLogContext,
    private readonly knownSecrets: string[] = [],
  ) {}

  get verbose(): boolean {
    return this.mode === 'verbose';
  }

  call(
    sections: SectionMeta[],
    extra: {
      chunk?: number;
      chunks?: number;
      details?: PromptDetails;
      previews?: PromptPreview[];
    } = {},
  ): void {
    if (this.mode === 'off') return;
    this.calls += 1;
    if (this.mode === 'summary') {
      for (const s of sections) {
        const total = this.totals.get(s.name) ?? {
          name: s.name,
          source: s.source,
          trust: s.trust,
          count: 0,
          chars: 0,
          truncated: false,
        };
        total.count += 1;
        total.chars += s.chars;
        total.truncated ||= s.truncated;
        this.totals.set(s.name, total);
      }
      return;
    }
    const tokens = sections.reduce((n, s) => n + (s.tokens ?? 0), 0);
    this.write({
      chunk: extra.chunk ?? this.calls,
      chunks: extra.chunks ?? 1,
      totalChars: sections.reduce((n, s) => n + s.chars, 0),
      ...(tokens > 0 ? { totalTokens: tokens } : {}),
      sections,
      ...(extra.details ? { details: this.cleanDetails(extra.details) } : {}),
      // Previews repeat across chunks, so only the first call carries them.
      ...(extra.previews && this.calls === 1
        ? {
            previews: extra.previews.map((p) => ({
              label: p.label,
              // Redact the WHOLE text first, so a secret cannot survive the cut.
              preview: redactSecrets(p.text, this.knownSecrets).slice(0, PREVIEW_CHARS),
            })),
          }
        : {}),
    });
  }

  /** Writes the `summary` record. Call in `finally`, so a failed run is logged too. */
  flush(): void {
    if (this.mode !== 'summary' || this.calls === 0) return;
    const sections = [...this.totals.values()];
    this.write({
      calls: this.calls,
      totalChars: sections.reduce((n, s) => n + s.chars, 0),
      sections,
    });
    this.calls = 0;
    this.totals.clear();
  }

  private cleanDetails(details: PromptDetails): PromptDetails {
    const clean = (items: string[]) =>
      items.slice(0, MAX_DETAIL_ITEMS).map((i) => redactSecrets(i, this.knownSecrets));
    return {
      ...(details.files ? { files: clean(details.files) } : {}),
      ...(details.skills ? { skills: clean(details.skills) } : {}),
      ...(details.issues ? { issues: details.issues } : {}),
      ...(details.specs ? { specs: clean(details.specs) } : {}),
    };
  }

  private write(body: Record<string, unknown>): void {
    try {
      this.logger?.info({ event: PROMPT_LOG_EVENT, ...this.context, ...body }, PROMPT_LOG_EVENT);
    } catch {
      /* observability must never break a model call */
    }
  }
}
