import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { InlineFinding } from "./InlineFinding";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "Off by one",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "The loop overruns.",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("InlineFinding", () => {
  it("shows the expanded finding and sends accept / dismiss for this PR", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <InlineFinding finding={FINDING} prId="pr1" repoFullName="acme/x" headSha="abc" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("The loop overruns.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });
  });
});
