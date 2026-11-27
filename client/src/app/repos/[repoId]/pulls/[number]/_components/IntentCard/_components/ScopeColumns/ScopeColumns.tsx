"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../../styles";

function ScopeColumn({ title, items }: { title: string; items: string[] }) {
  const t = useTranslations("prReview");
  return (
    <div>
      <h3 style={s.groupTitle}>{title}</h3>
      {items.length === 0 ? (
        <span style={s.muted}>{t("intent.notStated")}</span>
      ) : (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScopeColumns({ inScope, outOfScope }: { inScope: string[]; outOfScope: string[] }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.columns}>
      <ScopeColumn title={t("intent.inScope")} items={inScope} />
      <ScopeColumn title={t("intent.outOfScope")} items={outOfScope} />
    </div>
  );
}
