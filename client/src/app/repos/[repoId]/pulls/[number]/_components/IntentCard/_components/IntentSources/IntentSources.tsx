"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { IntentSource, PrIntentRecord } from "@devdigest/shared";
import { formatCost } from "@/app/repos/[repoId]/pulls/helpers";
import { KNOWN_REASONS } from "../../constants";
import { formatComputedAt, splitSources } from "../../helpers";
import { s } from "../../styles";

/** Card footer: what was and wasn't read, and what the derivation cost. */
export function IntentSources({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview");
  const { read, notRead } = splitSources(intent.sources);

  const name = (source: IntentSource): string => {
    switch (source.kind) {
      case "title":
      case "description":
        return t(`intent.source.${source.kind}`);
      case "branch":
      case "issue":
      case "spec": {
        const label = t(`intent.source.${source.kind}`, { ref: source.ref });
        return source.changed_in_pr ? t("intent.source.changedInPr", { label }) : label;
      }
      default:
        return source.ref;
    }
  };
  const nameWithReason = (source: IntentSource): string => {
    const { reason } = source;
    if (!reason) return name(source);
    return t("intent.source.withReason", {
      label: name(source),
      reason: KNOWN_REASONS.includes(reason) ? t(`intent.reason.${reason}`) : reason,
    });
  };

  return (
    <div style={s.footer}>
      {read.length > 0 && (
        <div>
          <span style={s.footerLabel}>{t("intent.footer.read")}</span>
          {read.map(name).join(" · ")}
        </div>
      )}
      {notRead.length > 0 && (
        <div>
          <span style={s.footerLabel}>{t("intent.footer.notRead")}</span>
          {notRead.map(nameWithReason).join(" · ")}
        </div>
      )}
      <div>
        <span style={s.footerLabel}>{t("intent.footer.model")}</span>
        <span className="mono">{intent.model ?? "—"}</span>
        {" · "}
        <span style={s.footerLabel}>{t("intent.footer.cost")}</span>
        {formatCost(intent.cost_usd)}
        {" · "}
        <span style={s.footerLabel}>{t("intent.footer.computed")}</span>
        {formatComputedAt(intent.computed_at)}
      </div>
    </div>
  );
}
