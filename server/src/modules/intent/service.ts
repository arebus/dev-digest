import type {
  FeatureModelChoice,
  GitHubClient,
  IntentSource,
  LLMProvider,
  PrDetail,
  PrIntentRecord,
  RepoRef,
  StructuredResult,
} from '@devdigest/shared';
import { randomUUID } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  GitHubReadError,
  NotFoundError,
} from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { PromptLog, loadKnownSecrets } from '../../platform/prompt-log.js';
import { withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  INTENT_PROMPT,
  INTENT_PROMPT_VERSION,
  INTENT_SCHEMA_NAME,
  INTENT_TIMEOUT_MS,
  MAX_COMMITS,
  MAX_COMMIT_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_FILE_PATHS,
  MAX_ISSUES,
  MAX_ISSUE_BODY_CHARS,
  MAX_PATCH_CHARS_PER_FILE,
  MAX_PATCH_CHARS_TOTAL,
  MAX_SPECS,
  MAX_SPECS_TOTAL_CHARS,
  MAX_SPEC_BYTES,
  MAX_SPEC_CHARS,
  MAX_TITLE_CHARS,
} from './constants.js';
import {
  IntentExtraction,
  buildIntentMessages,
  computeConfidence,
  finalizeIntent,
  hashIntentInputs,
  parseIntentLinks,
  renderPromptIntent,
  sourceLabel,
  specsReadFrom,
  stripHtmlComments,
  toIntentDto,
  wasRead,
  type IntentInputs,
  type IntentLinks,
} from './helpers.js';
import { IntentRepository, type IntentRow } from './repository.js';
import type { EnsureIntentOptions, IntentOutcome, PrIntentFacade } from './types.js';

type Log = NonNullable<EnsureIntentOptions['onLog']>;

/** What one derivation has gathered so far. */
interface Collected {
  inputs: IntentInputs;
  sources: IntentSource[];
  changedPaths: string[];
  /** Length of each prompt block's source before truncation (for logging only). */
  originals: Record<string, number>;
  /** A GitHub read failed in a way that is likely to succeed later. */
  transientFailure: boolean;
}

/** Where the linked issues and files are read from. */
interface Remote {
  client: GitHubClient | null;
  repo: RepoRef;
  headSha: string;
}

function source(
  kind: IntentSource['kind'],
  ref: string,
  status: IntentSource['status'],
  extra: Partial<IntentSource> = {},
): IntentSource {
  return { kind, ref, role: null, status, reason: null, changed_in_pr: false, chars: 0, ...extra };
}

/** Source entry for a text of which `sent` characters went to the model. */
function textSource(
  kind: IntentSource['kind'],
  ref: string,
  full: string,
  sent: string,
): IntentSource {
  if (!sent) return source(kind, ref, 'skipped', { reason: 'empty' });
  return source(kind, ref, sent.length < full.length ? 'truncated' : 'read', { chars: sent.length });
}

/**
 * Derives a PR's intent from its title, description, commits, changed files,
 * linked same-repo issues and spec files, with one cheap structured LLM call,
 * cached by head SHA + input hash.
 */
export class IntentService implements PrIntentFacade {
  private _repo?: IntentRepository;
  /** Single-flight: one derivation per PR at a time. */
  private inflight = new Map<string, Promise<IntentOutcome>>();

  constructor(private container: Container) {}

  private get repo() {
    return (this._repo ??= new IntentRepository(this.container.db));
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.assertPull(workspaceId, prId);
    const row = await this.repo.get(prId);
    return row ? toIntentDto(row, pull.headSha) : null;
  }

  async ensure(
    workspaceId: string,
    prId: string,
    opts: EnsureIntentOptions = {},
  ): Promise<IntentOutcome> {
    // Tenancy first, so a foreign workspace can never join a running derivation.
    const pull = await this.assertPull(workspaceId, prId);
    const running = this.inflight.get(prId);
    if (running) {
      const outcome = await running;
      // A forced request must not be satisfied by a cache hit.
      return opts.force && outcome.cached ? this.ensure(workspaceId, prId, opts) : outcome;
    }
    const next = this.derive(workspaceId, pull, opts).finally(() => this.inflight.delete(prId));
    this.inflight.set(prId, next);
    return next;
  }

  /** `pr_intent` has no workspace_id: the PR lookup is the tenancy guard. */
  private async assertPull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private async derive(
    workspaceId: string,
    pull: PullRow,
    opts: EnsureIntentOptions,
  ): Promise<IntentOutcome> {
    const start = Date.now();
    const log: Log = opts.onLog ?? ((_kind, msg) => opts.logger?.info({ prId: pull.id }, msg));

    const stored = await this.repo.get(pull.id);
    const sameHead = stored?.headSha === pull.headSha;
    const { inputs, originals, sources, changedPaths, transientFailure } = await this.collect(pull, log);
    this.logSources(pull.id, sources, log, opts);

    // A passing GitHub failure must not replace a good intent with a poorer one.
    if (transientFailure && stored && sameHead) {
      log('info', 'intent: cached (a GitHub read failed; keeping the stored intent)');
      return this.outcome(stored, pull, true, start);
    }

    const confidence = computeConfidence(inputs);
    const choice = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const sourcesHash = hashIntentInputs(inputs, choice, INTENT_PROMPT_VERSION);

    if (!opts.force && stored && sameHead && stored.sourcesHash === sourcesHash) {
      log('info', `intent: cached (head ${pull.headSha.slice(0, 7)}, sources unchanged)`);
      return this.outcome(stored, pull, true, start);
    }

    const result = await this.askModel(choice, inputs, log, { pull, opts, originals });
    const final = finalizeIntent(result.data, confidence, changedPaths);
    if (!final.intent) throw new ExternalServiceError('Intent model returned an empty intent');

    const row = await this.repo.upsert({
      prId: pull.id,
      intent: final.intent,
      inScope: final.in_scope,
      outOfScope: final.out_of_scope,
      acceptanceCriteria: final.acceptance_criteria,
      risks: final.risks,
      confidence,
      sources,
      headSha: pull.headSha,
      sourcesHash,
      provider: choice.provider,
      model: choice.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    const cost = result.costUsd == null ? 'cost n/a' : `$${result.costUsd.toFixed(4)}`;
    log(
      'result',
      `intent: confidence=${confidence} · ${final.in_scope.length} in / ${final.out_of_scope.length} out · ` +
        `${final.risks.length} risks · ${result.tokensIn}/${result.tokensOut} tok · ${cost}`,
    );
    return this.outcome(row, pull, false, start);
  }

  private outcome(row: IntentRow, pull: PullRow, cached: boolean, start: number): IntentOutcome {
    const record = toIntentDto(row, pull.headSha);
    return {
      record,
      cached,
      promptIntent: { text: renderPromptIntent(record), confidence: record.confidence },
      specsRead: specsReadFrom(record.sources),
      durationMs: Date.now() - start,
    };
  }

  private async askModel(
    choice: FeatureModelChoice,
    inputs: IntentInputs,
    log: Log,
    trace: { pull: PullRow; opts: EnsureIntentOptions; originals: Record<string, number> },
  ): Promise<StructuredResult<IntentExtraction>> {
    let llm: LLMProvider;
    try {
      llm = await this.container.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError('intent_model_unavailable', err.message, 409);
      }
      throw err;
    }
    const template = await loadPromptTemplate(INTENT_PROMPT);
    const mode = this.container.config.promptLog;
    const promptLog = new PromptLog(
      trace.opts.logger,
      mode,
      {
        correlationId: trace.opts.correlationId ?? randomUUID(),
        feature: 'intent',
        prId: trace.pull.id,
        provider: choice.provider,
        model: choice.model,
      },
      await loadKnownSecrets(mode, this.container.secrets),
    );
    const { messages, sections } = buildIntentMessages(template, inputs, {
      originals: trace.originals,
      ...(promptLog.verbose
        ? { countTokens: (text: string) => this.container.tokenizer.count(text) }
        : {}),
    });
    promptLog.call(sections, {
      details: {
        files: inputs.files.map((f) => f.path),
        issues: inputs.issues.map((i) => i.number),
        specs: inputs.specs.map((s) => s.path),
      },
      previews: [{ label: 'system_template', text: template }],
    });
    promptLog.flush();

    const label = `Deriving PR intent (${choice.provider}/${choice.model})`;
    log('tool', `${label}…`);
    const t0 = Date.now();
    try {
      const result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: IntentExtraction,
          schemaName: INTENT_SCHEMA_NAME,
          messages,
          temperature: 0,
          timeoutMs: INTENT_TIMEOUT_MS,
        }),
        INTENT_TIMEOUT_MS,
      );
      log('tool', `${label} done (${Date.now() - t0}ms)`);
      return result;
    } catch (err) {
      throw new ExternalServiceError(
        `Intent model call failed: ${(err as Error).message.slice(0, 200)}`,
      );
    }
  }

  /** Gather every source. Fresh from GitHub when possible, else from the DB. */
  private async collect(pull: PullRow, log: Log): Promise<Collected> {
    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    // Owner/name always come from the DB, never from PR text.
    const remote: Remote = {
      client: null,
      repo: { owner: repoRow.owner, name: repoRow.name },
      headSha: pull.headSha,
    };
    let transientFailure = false;
    const failed = (err: unknown) => {
      transientFailure ||= err instanceof GitHubReadError && err.reason === 'transient';
    };

    let detail: PrDetail | null = null;
    try {
      remote.client = await this.container.github();
      // Body, commits and files reach the DB only when the PR page is opened.
      detail = await remote.client.getPullRequest(remote.repo, pull.number);
    } catch (err) {
      failed(err);
      log('info', 'intent: GitHub PR read unavailable, using stored PR data');
    }

    const title = (detail?.title ?? pull.title).trim();
    const body = (detail ? (detail.body ?? '') : (pull.body ?? '')).replace(/\r\n/g, '\n');
    const commits = detail
      ? detail.commits.map((c) => c.message)
      : await this.repo.commitMessages(pull.id);
    const files = [
      ...(detail ? detail.files : await this.container.reviewRepo.getPrFiles(pull.id)),
    ].sort((a, b) => a.path.localeCompare(b.path));
    const changedPaths = files.map((f) => f.path);

    const visibleBody = stripHtmlComments(body).trim();
    const originals: Record<string, number> = {
      'pr-title': title.length + `\nbranch: ${pull.branch}`.length,
      'pr-description': visibleBody.length,
    };
    let patchBudget = MAX_PATCH_CHARS_TOTAL;
    const inputs: IntentInputs = {
      title: title.slice(0, MAX_TITLE_CHARS),
      branch: pull.branch,
      description: visibleBody.slice(0, MAX_DESCRIPTION_CHARS),
      commits: commits
        .slice(-MAX_COMMITS)
        .map((c) => c.trim().slice(0, MAX_COMMIT_CHARS))
        .filter(Boolean),
      files: files.slice(0, MAX_FILE_PATHS).map((f) => {
        const patch = (f.patch ?? '').slice(0, Math.min(MAX_PATCH_CHARS_PER_FILE, patchBudget));
        patchBudget -= patch.length;
        return { path: f.path, additions: f.additions, deletions: f.deletions, patch };
      }),
      issues: [],
      specs: [],
    };

    const list = (kind: 'commits' | 'files', count: number, chars: number) =>
      source(kind, `${count} ${count === 1 ? kind.slice(0, -1) : kind}`, count > 0 ? 'read' : 'skipped', {
        chars,
      });
    const sources: IntentSource[] = [
      textSource('title', 'title', title, inputs.title),
      textSource('description', 'description', visibleBody, inputs.description),
      source('branch', pull.branch, 'read', { chars: pull.branch.length }),
      list('commits', inputs.commits.length, inputs.commits.join('').length),
      list(
        'files',
        inputs.files.length,
        inputs.files.reduce((n, f) => n + f.path.length + f.patch.length, 0),
      ),
    ];

    const links = parseIntentLinks(
      { title, body, branch: pull.branch, base: pull.base },
      remote.repo,
      pull.number,
    );
    await this.readIssues(remote, links.issues, inputs, originals, sources, failed);
    await this.readSpecs(remote, links, changedPaths, inputs, originals, sources, failed);
    for (const u of links.notRead) {
      sources.push(source(u.kind, u.ref, 'not_read', { reason: u.reason }));
    }

    return { inputs, originals, sources, changedPaths, transientFailure };
  }

  private async readIssues(
    remote: Remote,
    links: IntentLinks['issues'],
    inputs: IntentInputs,
    originals: Record<string, number>,
    sources: IntentSource[],
    failed: (err: unknown) => void,
  ): Promise<void> {
    for (const [i, link] of links.entries()) {
      const add = (status: IntentSource['status'], reason: string | null, chars = 0) =>
        sources.push(
          source('issue', `#${link.number}`, status, { role: link.role, reason, chars }),
        );
      if (i >= MAX_ISSUES) {
        add('skipped', 'limit');
        continue;
      }
      if (!remote.client) {
        add('failed', 'github_unavailable');
        continue;
      }
      try {
        const issue = await remote.client.getIssue(remote.repo, link.number);
        if (issue.is_pull_request) {
          add('skipped', 'pull_request');
          continue;
        }
        const full = (issue.body ?? '').replace(/\r\n/g, '\n').trim();
        const body = full.slice(0, MAX_ISSUE_BODY_CHARS);
        const title = issue.title.slice(0, MAX_TITLE_CHARS);
        inputs.issues.push({ number: link.number, role: link.role, title, body });
        originals[`issue-${inputs.issues.length}`] =
          `#${link.number} ${title}\n\n`.length + full.length;
        add(body.length < full.length ? 'truncated' : 'read', null, title.length + body.length);
      } catch (err) {
        if (err instanceof GitHubReadError && err.reason === 'not_found') {
          add('not_read', 'not_found');
        } else {
          failed(err);
          add('failed', 'github_error');
        }
      }
    }
  }

  private async readSpecs(
    remote: Remote,
    links: IntentLinks,
    changedPaths: string[],
    inputs: IntentInputs,
    originals: Record<string, number>,
    sources: IntentSource[],
    failed: (err: unknown) => void,
  ): Promise<void> {
    let budget = MAX_SPECS_TOTAL_CHARS;
    for (const [i, linked] of links.specs.entries()) {
      let path = linked;
      let changedInPr = changedPaths.includes(path);
      const add = (status: IntentSource['status'], reason: string | null, chars = 0) =>
        sources.push(source('spec', path, status, { reason, chars, changed_in_pr: changedInPr }));
      if (i >= MAX_SPECS || budget <= 0) {
        add('skipped', i >= MAX_SPECS ? 'limit' : 'budget');
        continue;
      }
      if (!remote.client) {
        add('failed', 'github_unavailable');
        continue;
      }
      try {
        const read = (p: string) =>
          remote.client!.getFileAtRef(remote.repo, p, remote.headSha, {
            maxBytes: MAX_SPEC_BYTES,
          });
        let file = await read(path);
        for (const candidate of links.specFallbacks[linked] ?? []) {
          if (file.status !== 'not_found') break;
          const next = await read(candidate);
          if (next.status === 'not_found') continue;
          file = next;
          path = candidate;
          changedInPr = changedPaths.includes(path);
        }
        if (file.status !== 'ok') {
          add('not_read', file.status);
          continue;
        }
        const full = file.content.replace(/\r\n/g, '\n').trim();
        const content = full.slice(0, Math.min(MAX_SPEC_CHARS, budget));
        if (!content) {
          add('skipped', 'empty');
          continue;
        }
        budget -= content.length;
        inputs.specs.push({ path, content, changedInPr });
        originals[`spec-${inputs.specs.length}`] = `${path}\n\n`.length + full.length;
        add(content.length < full.length ? 'truncated' : 'read', null, content.length);
      } catch (err) {
        failed(err);
        add('failed', 'github_error');
      }
    }
  }

  /** References and lengths only — source content is never logged. */
  private logSources(prId: string, sources: IntentSource[], log: Log, opts: EnsureIntentOptions) {
    const names = sources
      .filter((s) => wasRead(s) && s.kind !== 'branch' && s.kind !== 'files')
      .map(sourceLabel);
    const unread = sources.filter(
      (s) => !wasRead(s) && (s.kind === 'issue' || s.kind === 'spec' || s.kind === 'url'),
    ).length;
    log('info', `intent: sources — ${names.join(', ')}${unread > 0 ? `; not read: ${unread}` : ''}`);
    opts.logger?.info(
      { prId, sources: sources.map((s) => ({ kind: s.kind, status: s.status, chars: s.chars })) },
      'intent: source lengths',
    );
  }
}
