"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffGroups,
  DiffViewer,
  type DiffCommentApi,
  type DiffFindingApi,
} from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingSlot, FindingSlotContext } from "./_components/FindingSlot";
import { OrderToggle, type DiffOrder } from "./_components/OrderToggle";
import { currentFindings, diffTotals, findingsByFile, toRoleGroups } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** "owner/repo" and head sha, for the findings' github.com deep-links. */
  repoFullName: string | null;
  headSha: string;
  order: DiffOrder;
  onOrderChange: (order: DiffOrder) => void;
}

export function DiffTab({
  prId,
  files,
  canComment,
  repoFullName,
  headSha,
  order,
  onOrderChange,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const { data: reviews } = usePrReviews(prId);
  const byFile = React.useMemo(() => findingsByFile(currentFindings(reviews ?? [])), [reviews]);
  const slotContext = React.useMemo(
    () => ({ prId, repoFullName, headSha }),
    [prId, repoFullName, headSha],
  );
  const findings: DiffFindingApi = { byFile, FindingSlot };

  // No groups while the smart diff is loading or failed → the flat list.
  const { data: smartDiff } = useSmartDiff(prId);
  const groups = smartDiff ? toRoleGroups(smartDiff, files) : null;
  const totals = diffTotals(files);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.actions}>
            <OrderToggle value={order} onChange={onOrderChange} />
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.title")}
        <span className="tnum" style={s.summary}>
          {t("smartDiff.summary", { count: files.length, ...totals })}
        </span>
      </SectionLabel>
      <FindingSlotContext.Provider value={slotContext}>
        {order === "smart" && groups ? (
          <DiffGroups groups={groups} commenting={commenting} findings={findings} />
        ) : (
          <DiffViewer files={files} commenting={commenting} findings={findings} />
        )}
      </FindingSlotContext.Provider>
    </section>
  );
}
