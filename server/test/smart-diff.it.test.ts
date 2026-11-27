/**
 * GET /pulls/:id/smart-diff — PR files grouped by review role, with the finding
 * lines of the current review (newest per agent). Gated on Docker (Postgres).
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES = [
  'pnpm-lock.yaml',
  'src/b.ts',
  'src/a.test.ts',
  'README.md',
  'src/index.ts',
  'src/a.ts',
];

async function setupPr(db: PgFixture['handle']['db'], workspaceId: string, name: string) {
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      status: 'open',
    })
    .returning();
  return pr!;
}

d('smart diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

  it('groups files by role with the finding lines of the newest review', async () => {
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId, 'smart');
    await db
      .insert(t.prFiles)
      .values(FILES.map((path) => ({ prId: pr.id, path, additions: 2, deletions: 1 })));

    const agentId = randomUUID();
    const review = (day: number) => ({
      workspaceId,
      prId: pr.id,
      agentId,
      kind: 'review' as const,
      createdAt: new Date(Date.UTC(2026, 0, day)),
    });
    const [older] = await db.insert(t.reviews).values(review(1)).returning();
    const [newer] = await db.insert(t.reviews).values(review(2)).returning();
    const finding = (reviewId: string, line: number) => ({
      reviewId,
      file: 'src/a.ts',
      startLine: line,
      endLine: line,
      severity: 'WARNING',
      category: 'bug',
      title: `finding at ${line}`,
      rationale: 'because',
      confidence: 0.9,
    });
    await db.insert(t.findings).values([
      finding(older!.id, 3),
      finding(newer!.id, 10),
      finding(newer!.id, 10),
      { ...finding(newer!.id, 5), dismissedAt: new Date() },
      { ...finding(newer!.id, 8), kind: 'lethal_trifecta' },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);
    const core = body.groups[0]!.files;
    expect(core.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(core.map((f) => f.finding_lines)).toEqual([[], [10]]);
    expect(body.split_suggestion).toEqual({
      too_big: false,
      total_lines: FILES.length * 3,
      proposed_splits: [],
    });
  });

  it('hides PRs of another workspace and unknown ids, and rejects a non-uuid', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await setupPr(pg.handle.db, other!.id, 'foreign');

    expect((await get(foreign.id)).statusCode).toBe(404);
    expect((await get(randomUUID())).statusCode).toBe(404);
    expect((await get('not-a-uuid')).statusCode).toBe(422);
  });
});
