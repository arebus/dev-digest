/* InlineFinding — a FindingCard shown inside the diff, wired to accept/dismiss. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";

export function InlineFinding({
  finding,
  prId,
  repoFullName,
  headSha,
}: {
  finding: FindingRecord;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}) {
  const action = useFindingAction();
  return (
    <FindingCard
      f={finding}
      defaultExpanded
      pending={action.isPending}
      onAction={(a) =>
        action.mutate({ findingId: finding.id, action: a, prId: prId ?? undefined })
      }
      repoFullName={repoFullName}
      headSha={headSha}
    />
  );
}
