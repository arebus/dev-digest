import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
} as const;

export function optionFor(active: boolean): CSSProperties {
  return {
    border: "none",
    borderRadius: 5,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-hover)" : "transparent",
  };
}
