/**
 * Pure rules of the intent layer: link parsing, path safety, confidence,
 * model messages, answer clean-up and mapping. No I/O.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  IntentRiskKind,
  RiskSeverity,
  type ChatMessage,
  type FeatureModelChoice,
  type IntentConfidence,
  type IntentSource,
  type PrIntentRecord,
  type Risk,
} from '@devdigest/shared';
import {
  INJECTION_GUARD,
  describeSection,
  wrapUntrusted,
  type CountTokens,
  type PromptSectionMeta,
} from '../../platform/prompt.js';
import {
  BARE_FILE_EXTENSIONS,
  BRANCH_PREFIX_RE,
  GENERIC_DOC_RE,
  MAX_CRITERIA,
  MAX_INTENT_CHARS,
  MAX_ITEM_CHARS,
  MAX_RISKS,
  MAX_RISK_EXPLANATION_CHARS,
  MAX_RISK_FILE_REFS,
  MAX_RISK_TITLE_CHARS,
  MAX_SCOPE_ITEMS,
  MAX_SPEC_PATH_CHARS,
  MAX_UNREAD_URLS,
  MAX_URL_REF_CHARS,
  MIN_COMMIT_CHARS,
  MIN_DESCRIPTION_CHARS,
  MIN_PARTIAL_DESCRIPTION_CHARS,
  SPEC_EXTENSIONS,
  TRIVIAL_COMMIT_RE,
} from './constants.js';
import type { StoredIntent } from './types.js';

// ---- Links ------------------------------------------------------------------

export interface IssueLink {
  number: number;
  role: 'target' | 'mention';
}

export interface UnreadLink {
  kind: 'issue' | 'spec' | 'url';
  ref: string;
  reason: string;
}

export interface IntentLinks {
  /** Same-repo issues, targets first. */
  issues: IssueLink[];
  /** Safe same-repo document paths; explicit paths and links before bare names. */
  specs: string[];
  /** Other readings of a path taken from a URL whose branch name may contain `/`. */
  specFallbacks: Record<string, string[]>;
  /** References that are deliberately not followed. */
  notRead: UnreadLink[];
}

const SPEC_EXT = SPEC_EXTENSIONS.join('|');
const SPEC_EXT_RE = new RegExp(`\\.(?:${SPEC_EXT})$`, 'i');
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;
const CLOSING_BEFORE_RE = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\b\s*:?\s*\[?\s*$/i;
const MD_LINK_TARGET_RE = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>()[\]"'`]+/gi;
const CROSS_REPO_RE = /(?<![\w./-])([\w.-]+)\/([\w.-]+)#(\d{1,9})\b/g;
const ISSUE_RE = /(?<![\w/&#])#(\d{1,9})\b/g;
const BARE_PATH_RE = new RegExp(
  `(?<![\\w@./\\\\:-])((?:\\.{1,2}/|/)?(?:[\\w@.-]+/)+[\\w@.-]+\\.(?:${SPEC_EXT}))(?![\\w/-]|\\.\\w)`,
  'gi',
);
const BARE_FILE_RE = new RegExp(
  `(?<![\\w@./\\\\:#-])([\\w-][\\w.-]*\\.(?:${BARE_FILE_EXTENSIONS.join('|')}))(?![\\w/-]|\\.\\w)`,
  'gi',
);
const MD_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;
const BRANCH_ISSUE_RE = /(?:^|\/)(?:(?:issue|gh)[-_]?)?(\d{1,6})(?=$|[-_/])|issue[-_](\d{1,6})/gi;

export function stripHtmlComments(text: string): string {
  return text.replace(HTML_COMMENT_RE, ' ');
}

/**
 * A repo-relative document path that is safe to pass to the contents API, or
 * null. Rejects traversal, backslashes, NUL, schemes, `.git/` and non-documents.
 */
export function normalizeRepoPath(raw: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (path.length > MAX_SPEC_PATH_CHARS || /[\\:\u0000-\u001f\u007f]/.test(path)) return null;
  path = path.replace(/^(?:\.\/)+/, '').replace(/^\//, '');
  const unsafe = path
    .split('/')
    .some((s) => s === '' || s === '.' || s === '..' || s.toLowerCase() === '.git');
  if (unsafe || !SPEC_EXT_RE.test(path)) return null;
  return path;
}

/**
 * Split `<ref>/<path>` of a blob URL. The ref is dropped (files are read at the PR
 * head), but a branch name may contain `/`: the PR's own branches are matched
 * exactly; after a usual branch prefix, longer splits are offered as fallbacks.
 */
function blobPaths(segments: string[], knownRefs: string[]): string[] {
  const joined = segments.join('/');
  const known = knownRefs.find((ref) => ref && joined.startsWith(`${ref}/`));
  const candidates = known
    ? [joined.slice(known.length + 1)]
    : BRANCH_PREFIX_RE.test(segments[0] ?? '')
      ? segments.slice(1).map((_, i) => segments.slice(i + 1).join('/'))
      : [segments.slice(1).join('/')];
  return candidates.map(normalizeRepoPath).filter((p): p is string => p !== null);
}

/**
 * Find what a PR points at. Owner/repo come from the caller (the DB), never from
 * the text; nothing outside that repository is ever returned as readable.
 */
export function parseIntentLinks(
  input: { title: string; body: string; branch: string; base?: string },
  repo: { owner: string; name: string },
  prNumber?: number,
): IntentLinks {
  const issues = new Map<number, IssueLink['role']>();
  const specs = new Set<string>();
  const bareNames = new Set<string>();
  const specFallbacks: Record<string, string[]> = {};
  const notRead = new Map<string, UnreadLink>();

  const addIssue = (n: number, role: IssueLink['role']) => {
    if (n <= 0 || n === prNumber) return;
    if (role === 'target' || !issues.has(n)) issues.set(n, role);
  };
  const addUnread = (kind: UnreadLink['kind'], ref: string, reason: string) => {
    const short = ref.slice(0, MAX_URL_REF_CHARS);
    if (!notRead.has(short)) notRead.set(short, { kind, ref: short, reason });
  };
  const addSpec = (raw: string) => {
    const path = normalizeRepoPath(raw);
    if (path) specs.add(path);
    else addUnread('spec', raw, 'invalid_path');
  };
  const roleAt = (text: string, offset: number): IssueLink['role'] =>
    CLOSING_BEFORE_RE.test(text.slice(Math.max(0, offset - 24), offset)) ? 'target' : 'mention';
  const sameRepo = (owner: string, name: string) =>
    owner.toLowerCase() === repo.owner.toLowerCase() &&
    name.toLowerCase() === repo.name.toLowerCase();

  const addUrl = (raw: string, role: IssueLink['role']) => {
    let url: URL;
    try {
      url = new URL(raw.replace(/[.,;:!?*_]+$/, ''));
    } catch {
      return;
    }
    // Query, fragment and credentials are dropped from what we keep.
    const ref = `${url.protocol}//${url.host}${url.pathname}`;
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
      addUnread('url', ref, 'external_url');
      return;
    }
    const [owner = '', name = '', type, ...rest] = url.pathname.split('/').filter(Boolean);
    if (!sameRepo(owner, name)) {
      addUnread('url', ref, 'other_repository');
    } else if (type === 'issues' && /^\d{1,9}$/.test(rest[0] ?? '')) {
      addIssue(Number(rest[0]), role);
    } else if (type === 'blob' && rest.length > 1) {
      const [path, ...fallbacks] = blobPaths(rest, [input.branch, input.base ?? '']);
      if (!path) addUnread('url', ref, 'unsupported_file');
      else {
        specs.add(path);
        if (fallbacks.length > 0) specFallbacks[path] = fallbacks;
      }
    } else {
      const reason =
        type === 'pull' ? 'pull_request' : type === 'tree' ? 'directory' : 'unsupported';
      addUnread('url', ref, reason);
    }
  };

  const scan = (source: string) => {
    let text = stripHtmlComments(source);
    // Bare names are read from plain prose only: a link's label or URL is not one.
    const prose = text.replace(MD_LINK_RE, ' ').replace(URL_RE, ' ');
    for (const m of prose.matchAll(BARE_FILE_RE)) {
      const path = GENERIC_DOC_RE.test(m[1]!) ? null : normalizeRepoPath(m[1]!);
      if (path) bareNames.add(path);
    }
    // Relative markdown links may point at a root file, which the bare-path rule skips.
    text = text.replace(MD_LINK_TARGET_RE, (whole: string, target: string) => {
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) return whole;
      const path = target.split(/[?#]/)[0] ?? '';
      if (SPEC_EXT_RE.test(path)) addSpec(path);
      return '] ';
    });
    text = text.replace(URL_RE, (url: string, offset: number, all: string) => {
      addUrl(url, roleAt(all, offset));
      return ' ';
    });
    text = text.replace(
      CROSS_REPO_RE,
      (whole: string, owner: string, name: string, n: string, offset: number, all: string) => {
        if (sameRepo(owner, name)) addIssue(Number(n), roleAt(all, offset));
        else addUnread('issue', whole, 'other_repository');
        return ' ';
      },
    );
    for (const m of text.matchAll(ISSUE_RE)) addIssue(Number(m[1]), roleAt(text, m.index));
    for (const m of text.matchAll(BARE_PATH_RE)) addSpec(m[1]!);
  };

  scan(input.title);
  scan(input.body);
  for (const m of input.branch.matchAll(BRANCH_ISSUE_RE)) addIssue(Number(m[1] ?? m[2]), 'mention');

  const unread = [...notRead.values()];
  return {
    issues: [...issues]
      .map(([number, role]) => ({ number, role }))
      .sort((a, b) => Number(b.role === 'target') - Number(a.role === 'target')),
    specs: [...new Set([...specs, ...bareNames])],
    specFallbacks,
    notRead: [
      ...unread.filter((u) => u.kind !== 'url'),
      ...unread.filter((u) => u.kind === 'url').slice(0, MAX_UNREAD_URLS),
    ],
  };
}

// ---- Confidence -------------------------------------------------------------

/** Length of the text once template noise (comments, empty boxes, headings) is gone. */
function meaningfulLength(text: string): number {
  return stripHtmlComments(text)
    .split('\n')
    .filter((line) => !/^\s*[-*+]\s*\[\s*\]/.test(line) && !/^\s*#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function isMeaningfulCommit(message: string): boolean {
  const subject = (message.split('\n')[0] ?? '').trim();
  return subject.length >= MIN_COMMIT_CHARS && !TRIVIAL_COMMIT_RE.test(subject);
}

/** How much the sources actually say. Takes only what was really read. */
export function computeConfidence(read: {
  description: string;
  commits: string[];
  issues: { role: IssueLink['role'] }[];
  specs: { content: string; changedInPr: boolean }[];
}): IntentConfidence {
  // A spec edited by the PR is the author's own text: weigh it like the description.
  const authorLength = Math.max(
    meaningfulLength(read.description),
    ...read.specs.filter((s) => s.changedInPr).map((s) => meaningfulLength(s.content)),
  );
  if (
    read.issues.some((i) => i.role === 'target') ||
    read.specs.some((s) => !s.changedInPr) ||
    authorLength >= MIN_DESCRIPTION_CHARS
  ) {
    return 'stated';
  }
  if (
    read.issues.length > 0 ||
    authorLength >= MIN_PARTIAL_DESCRIPTION_CHARS ||
    read.commits.some(isMeaningfulCommit)
  ) {
    return 'partial';
  }
  return 'inferred';
}

// ---- Model input ------------------------------------------------------------

/** Normalised, truncated inputs — exactly what the model sees. */
export interface IntentInputs {
  title: string;
  branch: string;
  description: string;
  commits: string[];
  files: { path: string; additions: number; deletions: number; patch: string }[];
  issues: { number: number; role: IssueLink['role']; title: string; body: string }[];
  specs: { path: string; content: string; changedInPr: boolean }[];
}

/**
 * System = trusted template + shared injection guard. Every source is wrapped as
 * untrusted with an index label; author-controlled names stay inside the block.
 * `sections` is the content-free description of the same blocks, for logging.
 */
export function buildIntentMessages(
  template: string,
  inputs: IntentInputs,
  opts: {
    /** Length of each source before truncation, by block label. */
    originals?: Record<string, number>;
    countTokens?: CountTokens;
  } = {},
): { messages: ChatMessage[]; sections: PromptSectionMeta[] } {
  const system = `${template}\n\n${INJECTION_GUARD}`;
  const count = opts.countTokens ? { countTokens: opts.countTokens } : {};
  const blocks: string[] = [];
  const sections = [
    describeSection('system', 'prompts.intent+engine.injection_guard', 'trusted', system, count),
  ];
  const add = (
    name: PromptSectionMeta['name'],
    source: PromptSectionMeta['source'],
    heading: string,
    label: string,
    content: string,
  ) => {
    const block = `## ${heading}\n${wrapUntrusted(label, content)}`;
    blocks.push(block);
    sections.push(
      describeSection(name, source, 'untrusted', block, {
        ...count,
        content: { original: opts.originals?.[label] ?? content.length, sent: content.length },
      }),
    );
  };

  add('pr_title', 'pull.title+branch', 'PR title and branch', 'pr-title', `${inputs.title}\nbranch: ${inputs.branch}`);
  if (inputs.description) {
    add('pr_description', 'pull.body', 'PR description', 'pr-description', inputs.description);
  }
  if (inputs.commits.length > 0) {
    add('commits', 'pull.commits', 'Commit messages', 'commits', inputs.commits.map((c) => `- ${c}`).join('\n'));
  }
  if (inputs.files.length > 0) {
    const list = inputs.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`);
    const patches = inputs.files.filter((f) => f.patch).map((f) => `--- ${f.path}\n${f.patch}`);
    add('changed_files', 'pull.files', 'Changed files', 'changed-files', [list.join('\n'), ...patches].join('\n\n'));
  }
  inputs.issues.forEach((issue, i) => {
    add(
      'issue',
      'github.issue',
      `Linked issue (${issue.role})`,
      `issue-${i + 1}`,
      `#${issue.number} ${issue.title}\n\n${issue.body}`,
    );
  });
  inputs.specs.forEach((spec, i) => {
    add(
      'spec',
      'github.file',
      `Spec or plan file${spec.changedInPr ? ' (changed by this PR)' : ''}`,
      `spec-${i + 1}`,
      `${spec.path}\n\n${spec.content}`,
    );
  });

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: blocks.join('\n\n') },
    ],
    sections,
  };
}

export function hashIntentInputs(
  inputs: IntentInputs,
  model: FeatureModelChoice,
  promptVersion: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([promptVersion, model.provider, model.model, inputs]))
    .digest('hex');
}

// ---- Model output -----------------------------------------------------------

/** What the model returns. Local to the module, not a wire contract. */
export const IntentExtraction = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()).max(MAX_SCOPE_ITEMS),
  out_of_scope: z.array(z.string()).max(MAX_SCOPE_ITEMS),
  acceptance_criteria: z.array(z.string()).max(MAX_CRITERIA),
  risks: z
    .array(
      z.object({
        kind: IntentRiskKind,
        title: z.string(),
        explanation: z.string(),
        severity: RiskSeverity,
        file_refs: z.array(z.string()),
      }),
    )
    .max(MAX_RISKS),
});
export type IntentExtraction = z.infer<typeof IntentExtraction>;

export interface FinalIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  acceptance_criteria: string[];
  risks: Risk[];
}

const clip = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const k = key(item).toLowerCase();
    if (k && !seen.has(k)) seen.set(k, item);
  }
  return [...seen.values()];
}

/** Trim, dedupe and constrain the answer; low confidence may not invent a scope. */
export function finalizeIntent(
  raw: IntentExtraction,
  confidence: IntentConfidence,
  changedPaths: string[],
): FinalIntent {
  const changed = new Set(changedPaths);
  const list = (items: string[]) =>
    dedupe(
      items.map((i) => clip(i, MAX_ITEM_CHARS)),
      (i) => i,
    );
  const inferred = confidence === 'inferred';
  const risks = raw.risks.map((r) => ({
    kind: r.kind,
    title: clip(r.title, MAX_RISK_TITLE_CHARS),
    explanation: clip(r.explanation, MAX_RISK_EXPLANATION_CHARS),
    severity: r.severity,
    file_refs: [...new Set(r.file_refs.filter((f) => changed.has(f)))].slice(0, MAX_RISK_FILE_REFS),
  }));
  return {
    intent: clip(raw.intent, MAX_INTENT_CHARS),
    in_scope: list(raw.in_scope),
    out_of_scope: inferred ? [] : list(raw.out_of_scope),
    acceptance_criteria: inferred ? [] : list(raw.acceptance_criteria),
    risks: dedupe(risks, (r) => r.title),
  };
}

// ---- Rendering + mapping ----------------------------------------------------

export const wasRead = (s: IntentSource) => s.status === 'read' || s.status === 'truncated';

/** Human name of a source, e.g. `issue #471 (target)`. A reference, never content. */
export function sourceLabel(s: IntentSource): string {
  if (s.kind === 'issue') return `issue ${s.ref}${s.role ? ` (${s.role})` : ''}`;
  if (s.kind === 'spec') return `spec ${s.ref}`;
  if (s.kind === 'commits' || s.kind === 'files' || s.kind === 'url') return s.ref;
  return s.kind;
}

export function specsReadFrom(sources: IntentSource[]): string[] {
  return sources.filter((s) => s.kind === 'spec' && wasRead(s)).map((s) => s.ref);
}

/** The text of the review prompt's intent block. */
export function renderPromptIntent(record: PrIntentRecord): string {
  const lines = [`Intent: ${record.intent}`];
  const list = (heading: string, items: string[]) => {
    if (items.length > 0) lines.push(`${heading}:`, ...items.map((i) => `- ${i}`));
  };
  list('In scope', record.in_scope);
  list('Out of scope', record.out_of_scope);
  list('Acceptance criteria', record.acceptance_criteria);
  list(
    'Risk areas to check',
    record.risks.map((r) => `${r.title} (${r.kind}): ${r.explanation}`),
  );
  list('Sources read', record.sources.filter(wasRead).map(sourceLabel));
  return lines.join('\n');
}

export function toIntentDto(row: StoredIntent, currentHeadSha: string): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    acceptance_criteria: row.acceptanceCriteria,
    risks: row.risks,
    sources: row.sources,
    head_sha: row.headSha,
    stale: row.headSha !== currentHeadSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    computed_at: row.computedAt.toISOString(),
  };
}
