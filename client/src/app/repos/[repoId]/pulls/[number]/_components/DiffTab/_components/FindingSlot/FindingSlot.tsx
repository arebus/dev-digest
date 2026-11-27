/* FindingSlot — what the diff viewer renders per finding. Defined at module level
   so cards keep their identity; the PR it belongs to comes from context. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { InlineFinding } from "../InlineFinding";

interface FindingSlotContextValue {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

export const FindingSlotContext = React.createContext<FindingSlotContextValue | null>(null);

export function FindingSlot({ finding }: { finding: FindingRecord }) {
  const pr = React.useContext(FindingSlotContext);
  if (!pr) throw new Error("FindingSlot needs a FindingSlotContext provider");
  return <InlineFinding finding={finding} {...pr} />;
}
