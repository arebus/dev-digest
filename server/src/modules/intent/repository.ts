import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type IntentRow = typeof t.prIntent.$inferSelect;
export type IntentValues = Omit<typeof t.prIntent.$inferInsert, 'computedAt'>;

/**
 * Intent data-access. Owns `pr_intent`. The table has no workspace_id: callers
 * must have checked that the PR belongs to the workspace.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }

  async upsert(values: IntentValues): Promise<IntentRow> {
    const next = { ...values, computedAt: new Date() };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(next)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: next })
      .returning();
    return row!;
  }

  /** Persisted commit messages, oldest first (fallback when GitHub is unreachable). */
  async commitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(asc(t.prCommits.committedAt), asc(t.prCommits.sha));
    return rows.map((r) => r.message);
  }
}
