/* IntentCard — why this PR exists: derived intent, scope, risk areas and the
   sources behind them. Reading it never calls a model; the button does. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { ScopeColumns } from "./_components/ScopeColumns";
import { RiskChips } from "./_components/RiskChips";
import { IntentSources } from "./_components/IntentSources";
import { CONFIDENCE_COLORS } from "./constants";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("prReview");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const recalculate = useRecalculateIntent(prId);
  const intent = data?.intent ?? null;

  const header = intent && (
    <div style={s.headerRight}>
      <Badge
        color={CONFIDENCE_COLORS[intent.confidence].c}
        bg={CONFIDENCE_COLORS[intent.confidence].bg}
      >
        {t(`intent.confidence.${intent.confidence}`)}
      </Badge>
      {intent.stale && (
        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
          {t("intent.outdated")}
        </Badge>
      )}
      <Button
        kind="ghost"
        size="sm"
        icon="RefreshCw"
        loading={recalculate.isPending}
        onClick={() => recalculate.mutate()}
      >
        {t("intent.recalculate")}
      </Button>
    </div>
  );

  return (
    <section>
      <SectionLabel icon="Target" right={header}>
        {t("intent.title")}
      </SectionLabel>
      <div style={s.box}>
        {isLoading ? (
          <Skeleton height={72} />
        ) : isError ? (
          <div role="alert" style={s.empty}>
            <span style={s.muted}>{t("intent.loadError")}</span>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refetch()}>
              {t("intent.retry")}
            </Button>
          </div>
        ) : !intent ? (
          <div style={s.empty}>
            <span style={s.muted}>{t("intent.empty")}</span>
            <Button
              kind="secondary"
              size="sm"
              icon="Sparkles"
              loading={recalculate.isPending}
              onClick={() => recalculate.mutate()}
            >
              {t("intent.compute")}
            </Button>
          </div>
        ) : (
          <>
            <p style={s.quote}>{t("intent.quoted", { intent: intent.intent })}</p>
            <ScopeColumns inScope={intent.in_scope} outOfScope={intent.out_of_scope} />
            <RiskChips risks={intent.risks} />
            <IntentSources intent={intent} />
          </>
        )}
      </div>
    </section>
  );
}
