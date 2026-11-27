"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentRiskKind, Risk } from "@devdigest/shared";
import { FALLBACK_RISK_ICON, RISK_COLORS, RISK_KIND_ICON } from "../../constants";
import { s } from "../../styles";

/** Informational chips (not buttons); the explanation is in the tooltip. */
export function RiskChips({ risks }: { risks: Risk[] }) {
  const t = useTranslations("prReview");
  if (risks.length === 0) return null;
  return (
    <div style={s.riskSection}>
      <h3 style={s.groupTitle}>{t("intent.riskAreas")}</h3>
      <ul style={s.chips}>
        {risks.map((risk) => {
          // `Risk.kind` is an open string on the wire.
          const I = Icon[RISK_KIND_ICON[risk.kind as IntentRiskKind] ?? FALLBACK_RISK_ICON];
          const tone = RISK_COLORS[risk.severity];
          const tooltip = t("intent.riskTooltip", {
            severity: t(`intent.severity.${risk.severity}`),
            explanation: risk.explanation,
          });
          return (
            <li
              key={risk.title}
              title={tooltip}
              style={{ ...s.chip, color: tone.c, background: tone.bg }}
            >
              <I size={13} aria-hidden />
              {risk.title}
              <span style={s.srOnly}>{tooltip}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
