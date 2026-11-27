export type DiffOrder = "smart" | "original";

export const ORDER_OPTIONS = [
  { value: "smart", labelKey: "smartDiff.smartOrder" },
  { value: "original", labelKey: "smartDiff.originalOrder" },
] as const satisfies readonly { value: DiffOrder; labelKey: string }[];
