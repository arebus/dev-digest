import type { CSSProperties } from "react";

export const s = {
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  /** Sits inside the uppercased section label, but reads as plain text. */
  summary: {
    marginLeft: 12,
    fontWeight: 500,
    letterSpacing: "normal",
    textTransform: "none",
  } satisfies CSSProperties,
} as const;
