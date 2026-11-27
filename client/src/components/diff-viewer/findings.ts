/* Review-finding support for the DiffViewer: pure helpers + the API shape the
   viewer needs. The finding card itself is supplied by the caller. */
import type React from "react";
import type { Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineKey } from "./comments";
import { SEVERITY_RANK } from "./constants";

/** What the viewer needs to show findings inline. */
export interface DiffFindingApi {
  byFile: ReadonlyMap<string, FindingRecord[]>;
  /** Renders one finding. Must keep a stable identity across renders. */
  FindingSlot: React.ComponentType<{ finding: FindingRecord }>;
}

/**
 * Split findings into those whose `start_line` is rendered in this patch (keyed)
 * and those outside it, so nothing is silently dropped.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outside: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outside: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outside.push(f);
    }
  }
  return { matched, outside };
}

/** Findings still awaiting action or accepted, i.e. not dismissed. */
export function openFindings(list: FindingRecord[]): FindingRecord[] {
  return list.filter((f) => !f.dismissed_at);
}

export function worstSeverity(list: FindingRecord[]): Severity | null {
  return list.reduce<Severity | null>(
    (worst, f) =>
      worst === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst,
    null,
  );
}

export function countFilesWithOpenFindings(
  paths: string[],
  byFile: ReadonlyMap<string, FindingRecord[]>,
): number {
  return paths.filter((path) => openFindings(byFile.get(path) ?? []).length > 0).length;
}
