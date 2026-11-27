import type { IntentSource } from "@devdigest/shared";

/** Source kinds worth listing when they could not be read. */
const REFERENCE_KINDS: ReadonlyArray<IntentSource["kind"]> = ["issue", "spec", "url"];

/**
 * Split sources for the footer. Changed files and commits are always inputs, so
 * only the textual sources count as "read"; unread entries are the references.
 */
export function splitSources(sources: IntentSource[]): {
  read: IntentSource[];
  notRead: IntentSource[];
} {
  const wasRead = (s: IntentSource) => s.status === "read" || s.status === "truncated";
  return {
    read: sources.filter((s) => wasRead(s) && s.kind !== "files"),
    notRead: sources.filter((s) => !wasRead(s) && REFERENCE_KINDS.includes(s.kind)),
  };
}

export function formatComputedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
