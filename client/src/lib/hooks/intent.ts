/* hooks/intent.ts — React Query hooks for the PR Intent card: the stored intent
   (never triggers a model call) and an explicit recalculation. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useOnRunSettled } from "./run-settled";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

export const intentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Derive (or re-derive) the intent. Errors surface through the global toast. */
export function useRecalculateIntent(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recalculate`),
    onSuccess: (intent) => qc.setQueryData<PrIntentResponse>(intentKey(prId), { intent }),
  });
}

/**
 * Refetch the intent when any run of this PR settles. Call it from the page, not a
 * tab, so it works whichever tab is open.
 */
export function useRefreshIntentOnRunSettled(
  prId: string | null | undefined,
  liveRunIds: string[],
) {
  const qc = useQueryClient();
  useOnRunSettled(prId, liveRunIds, () => {
    qc.invalidateQueries({ queryKey: intentKey(prId) });
  });
}
