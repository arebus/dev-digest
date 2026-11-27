export interface CurrentReviewRow {
  id: string;
  prId: string;
  agentId: string | null;
  createdAt: Date;
}

/** Review ids that make up each PR's CURRENT review: the newest `review` per agent. */
export function currentReviewIds(rows: CurrentReviewRow[]): string[] {
  const latest = new Map<string, CurrentReviewRow>(); // key: prId + agentId
  for (const r of rows) {
    const key = `${r.prId}:${r.agentId ?? ''}`;
    const prev = latest.get(key);
    if (!prev || r.createdAt > prev.createdAt) latest.set(key, r);
  }
  return [...latest.values()].map((r) => r.id);
}
