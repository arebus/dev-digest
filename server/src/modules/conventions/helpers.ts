import { z } from 'zod';
import type { ChatMessage, ConventionCandidate } from '@devdigest/shared';
import {
  INJECTION_GUARD,
  describeSection,
  wrapUntrusted,
  type CountTokens,
  type PromptSectionMeta,
} from '../../platform/prompt.js';
import { MAX_CANDIDATES, MAX_SNIPPET_CHARS } from './constants.js';
import type { ConventionRow } from './repository.js';

/** What the model returns. Local to the module, not a wire contract. */
export const ConventionExtraction = z.object({
  conventions: z
    .array(
      z.object({
        rule: z.string(),
        evidence_path: z.string(),
        evidence_snippet: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_CANDIDATES),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type RawCandidate = ConventionExtraction['conventions'][number];

/** A candidate that passed the evidence check, ready to persist. */
export interface GroundedCandidate {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

/** Collapse whitespace runs so indentation/line-wrap differences don't fail the check. */
export function normalizeWs(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The evidence gate: keep a candidate only when its file was one of the files we
 * actually sent AND its snippet (whitespace-normalized) occurs in that file.
 * Everything else is dropped before anything is written to the DB.
 */
export function groundCandidates(
  candidates: RawCandidate[],
  filesByPath: ReadonlyMap<string, string>,
): { kept: GroundedCandidate[]; dropped: number } {
  const normalized = new Map<string, string>();
  const kept: GroundedCandidate[] = [];
  const seenRules = new Set<string>();
  let dropped = 0;
  for (const c of candidates) {
    const path = c.evidence_path.trim();
    const rule = c.rule.trim();
    const source = filesByPath.get(path);
    const snippet = normalizeWs(c.evidence_snippet);
    let ok = rule.length > 0 && source !== undefined && snippet.length > 0;
    if (ok) {
      let hay = normalized.get(path);
      if (hay === undefined) {
        hay = normalizeWs(source!);
        normalized.set(path, hay);
      }
      ok = hay.includes(snippet);
    }
    const key = normalizeWs(rule).toLowerCase();
    if (!ok || seenRules.has(key)) {
      dropped++;
      continue;
    }
    seenRules.add(key);
    kept.push({
      rule,
      evidencePath: path,
      evidenceSnippet: c.evidence_snippet.trim().slice(0, MAX_SNIPPET_CHARS),
      confidence: c.confidence,
    });
  }
  return { kept, dropped };
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

type SampleInput = ReadonlyArray<{ path: string; content: string }>;

/** The exact blocks sent, shared by the message builder and its log description. */
function extractionBlocks(template: string, files: SampleInput) {
  return {
    system: `${template}\n\n${INJECTION_GUARD}`,
    files: files.map((f) => wrapUntrusted(f.path, f.content)),
  };
}

/** System prompt (trusted template + shared injection guard) and the untrusted file dump. */
export function buildExtractionMessages(template: string, files: SampleInput): ChatMessage[] {
  const blocks = extractionBlocks(template, files);
  return [
    { role: 'system', content: blocks.system },
    { role: 'user', content: `Files (${files.length}):\n\n${blocks.files.join('\n\n')}` },
  ];
}

/** Content-free description of that prompt, for logging. */
export function describeExtractionSections(
  template: string,
  files: SampleInput,
  countTokens?: CountTokens,
): PromptSectionMeta[] {
  const blocks = extractionBlocks(template, files);
  const opts = countTokens ? { countTokens } : {};
  return [
    describeSection('system', 'prompts.conventions+engine.injection_guard', 'trusted', blocks.system, opts),
    ...blocks.files.map((b) => describeSection('repo_file', 'repo.clone', 'untrusted', b, opts)),
  ];
}
