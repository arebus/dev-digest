/* OrderToggle — segmented control: role-grouped order vs GitHub's order. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ORDER_OPTIONS } from "./constants";
import type { DiffOrder } from "./types";
import { s, optionFor } from "./styles";

export function OrderToggle({
  value,
  onChange,
}: {
  value: DiffOrder;
  onChange: (order: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderLabel")} style={s.group}>
      {ORDER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          style={optionFor(value === option.value)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
