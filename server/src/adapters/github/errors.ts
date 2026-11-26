import { GitHubReadError } from '../../platform/errors.js';

const NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];

/** Octokit, timeout and network failures → the domain's read error. */
export function toReadError(err: unknown): GitHubReadError {
  const e = err as { status?: number; code?: string; name?: string; message?: string };
  const message = e?.message ?? String(err);
  if (e?.status === 404) return new GitHubReadError('not_found', message);
  const rateLimited = e?.status === 403 && /rate limit/i.test(message);
  const transient =
    e?.name === 'TimeoutError' ||
    NETWORK_CODES.includes(e?.code ?? '') ||
    e?.status === 429 ||
    (e?.status ?? 0) >= 500 ||
    rateLimited;
  return new GitHubReadError(transient ? 'transient' : 'permanent', message);
}
