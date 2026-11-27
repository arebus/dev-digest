/* hooks/run-settled.ts — notice when a PR's live runs finish. */
"use client";

import React from "react";

/**
 * Call `onSettled` when a run that was live for this PR no longer is. Switching to
 * another PR does not count.
 */
export function useOnRunSettled(
  prId: string | null | undefined,
  liveRunIds: string[],
  onSettled: () => void,
) {
  const seen = React.useRef<{ prId: typeof prId; runIds: string[] }>({ prId, runIds: [] });
  const key = liveRunIds.join(",");

  React.useEffect(() => {
    const runIds = key ? key.split(",") : [];
    const before = seen.current;
    seen.current = { prId, runIds };
    if (before.prId === prId && before.runIds.some((id) => !runIds.includes(id))) {
      onSettled();
    }
    // Re-running for a new `onSettled` identity is harmless: `seen` is already current.
  }, [prId, key, onSettled]);
}
