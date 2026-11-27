import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const api = vi.hoisted(() => ({
  reviews: [] as unknown[],
  smartDiff: undefined as unknown,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: api.reviews }),
  useSmartDiff: () => ({ data: api.smartDiff }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { DiffTab } from "./DiffTab";

const file = (path: string): PrFile => ({
  path,
  additions: 2,
  deletions: 1,
  patch: `@@ -1 +1,2 @@\n const kept = 1;\n+added in ${path}`,
});

// GitHub order.
const PATHS = [
  "pnpm-lock.yaml",
  "src/b.ts",
  "src/a.test.ts",
  "README.md",
  "src/index.ts",
  "src/a.ts",
];
const FILES = PATHS.map(file);

const group = (role: SmartDiffRole, ...paths: string[]) => ({
  role,
  files: paths.map((path) => ({ path, additions: 2, deletions: 1, finding_lines: [] })),
});
const SMART: SmartDiff = {
  groups: [
    group("core", "src/b.ts", "src/a.ts"),
    group("tests", "src/a.test.ts"),
    group("wiring", "src/index.ts"),
    group("docs", "README.md"),
    group("boilerplate", "pnpm-lock.yaml"),
  ],
  split_suggestion: { too_big: false, total_lines: 18, proposed_splits: [] },
};

const REVIEW: ReviewRecord = {
  id: "r1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: null,
  kind: "review",
  verdict: null,
  summary: null,
  score: null,
  model: null,
  created_at: "2026-01-01T00:00:00Z",
  findings: [
    {
      id: "f1",
      severity: "WARNING",
      category: "bug",
      title: "Unchecked input",
      file: "src/a.ts",
      start_line: 2,
      end_line: 2,
      rationale: "because",
      confidence: 0.9,
      kind: "finding",
      review_id: "r1",
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

const onOrderChange = vi.fn();
const tab = (order: "smart" | "original") => (
  <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
    <DiffTab
      prId="pr1"
      files={FILES}
      repoFullName="acme/x"
      headSha="abc"
      order={order}
      onOrderChange={onOrderChange}
    />
  </NextIntlClientProvider>
);

const GROUP_NAME = /^(Core logic|Tests|Wiring|Docs|Boilerplate)/;
const shownPaths = () =>
  screen.getAllByText((text) => PATHS.includes(text)).map((el) => el.textContent);

beforeEach(() => {
  api.reviews = [REVIEW];
  api.smartDiff = SMART;
});
afterEach(cleanup);

describe("DiffTab", () => {
  it("groups files by role with findings inline, and switches to the original order", () => {
    const view = render(tab("smart"));

    expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
    expect(screen.getByText("6 files · +12 −6")).toBeInTheDocument();
    const headers = screen.getAllByRole("button", { name: GROUP_NAME });
    expect(headers.map((h) => h.textContent?.match(GROUP_NAME)?.[0])).toEqual([
      "Core logic",
      "Tests",
      "Wiring",
      "Docs",
      "Boilerplate",
    ]);

    // The lock file is hidden in the collapsed Boilerplate group.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(headers[4]!);
    const boilerplate = screen.getByRole("group", { name: "Boilerplate" });
    expect(within(boilerplate).getByText("pnpm-lock.yaml")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: "1 open finding" })).toBeInTheDocument();
    const line = screen.getByRole("group", { name: "Line 2" });
    expect(within(line).getByText("added in src/a.ts")).toBeInTheDocument();
    expect(within(line).getByText("Unchecked input")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(onOrderChange).toHaveBeenCalledWith("original");

    view.rerender(tab("original"));
    expect(screen.queryByRole("button", { name: GROUP_NAME })).not.toBeInTheDocument();
    expect(shownPaths()).toEqual(PATHS);
    expect(screen.getByText("Unchecked input")).toBeInTheDocument();
  });

  it("keeps an inline finding card mounted when the reviews are refetched", () => {
    const view = render(tab("smart"));
    const title = screen.getByText("Unchecked input");

    api.reviews = [structuredClone(REVIEW)];
    view.rerender(tab("smart"));

    expect(screen.getByText("Unchecked input")).toBe(title);
  });

  it("shows the flat list while the smart diff is not available", () => {
    api.smartDiff = undefined;
    render(tab("smart"));
    expect(screen.queryByRole("button", { name: GROUP_NAME })).not.toBeInTheDocument();
    expect(shownPaths()).toEqual(PATHS);
  });
});
