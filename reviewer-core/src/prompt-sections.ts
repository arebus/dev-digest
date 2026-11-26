/**
 * Content-free description of one prompt section, safe to log. `name` and
 * `source` are closed unions, so no author-controlled text can get into a record.
 * Pure: the engine only describes; the caller decides whether and how to log.
 */
import { createHash } from 'node:crypto';

export type PromptSectionName =
  | 'system'
  | 'task'
  | 'pr_description'
  | 'intent'
  | 'skills'
  | 'memory'
  | 'repo_map'
  | 'project_context'
  | 'callers'
  | 'diff'
  | 'pr_title'
  | 'commits'
  | 'changed_files'
  | 'issue'
  | 'spec'
  | 'repo_file';

export type PromptSectionSource =
  | 'agent.system_prompt+engine.injection_guard'
  | 'prompts.intent+engine.injection_guard'
  | 'prompts.conventions+engine.injection_guard'
  | 'server.task_line'
  | 'pull.body'
  | 'pull.title+branch'
  | 'pull.commits'
  | 'pull.files'
  | 'intent_layer'
  | 'agent.skills'
  | 'memory'
  | 'project_context'
  | 'repo_intel.repo_map'
  | 'repo_intel.callers'
  | 'git.diff'
  | 'github.issue'
  | 'github.file'
  | 'repo.clone';

export interface PromptSectionMeta {
  name: PromptSectionName;
  source: PromptSectionSource;
  trust: 'trusted' | 'untrusted';
  /** Characters sent, including headings and delimiters. */
  chars: number;
  /** Length of the source content before any truncation. */
  originalChars: number;
  truncated: boolean;
  /** First 12 hex chars of the sent block's SHA-256: compare runs without the text. */
  sha12: string;
  /** Present only when the caller supplied a token counter. */
  tokens?: number;
}

export type CountTokens = (text: string) => number;

export function describeSection(
  name: PromptSectionName,
  source: PromptSectionSource,
  trust: PromptSectionMeta['trust'],
  block: string,
  opts: {
    /** Source content length and the part of it that was kept. */
    content?: { original: number; sent: number };
    countTokens?: CountTokens;
  } = {},
): PromptSectionMeta {
  const content = opts.content ?? { original: block.length, sent: block.length };
  return {
    name,
    source,
    trust,
    chars: block.length,
    originalChars: content.original,
    truncated: content.original > content.sent,
    sha12: createHash('sha256').update(block).digest('hex').slice(0, 12),
    ...(opts.countTokens ? { tokens: opts.countTokens(block) } : {}),
  };
}
