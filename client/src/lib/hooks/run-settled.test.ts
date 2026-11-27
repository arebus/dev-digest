import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOnRunSettled } from "./run-settled";

describe("useOnRunSettled", () => {
  it("fires once per settled run, not for new runs or a PR switch", () => {
    const onSettled = vi.fn();
    const { rerender } = renderHook(
      ({ prId, runIds }) => useOnRunSettled(prId, runIds, () => onSettled(prId)),
      { initialProps: { prId: "pr1", runIds: ["a"] } },
    );
    rerender({ prId: "pr1", runIds: ["a", "b"] });
    expect(onSettled).not.toHaveBeenCalled();

    rerender({ prId: "pr1", runIds: ["b"] });
    rerender({ prId: "pr1", runIds: ["b"] });
    expect(onSettled).toHaveBeenCalledTimes(1);

    rerender({ prId: "pr2", runIds: [] });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
