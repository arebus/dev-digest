import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { DiffGroups, type DiffGroup } from "./DiffGroups";

afterEach(cleanup);

const file = (path: string) => ({ path, additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+x" });

const GROUPS: DiffGroup[] = [
  { role: "core", files: [file("src/a.ts"), file("src/b.ts")] },
  { role: "tests", files: [file("src/a.test.ts")] },
  { role: "docs", files: [file("README.md")] },
  { role: "boilerplate", files: [file("pnpm-lock.yaml")] },
];

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "Broken",
  file: "src/a.ts",
  start_line: 1,
  end_line: 1,
  rationale: "because",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("DiffGroups", () => {
  it("shows role sections in order, with docs and boilerplate collapsed until clicked", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <DiffGroups
          groups={GROUPS}
          findings={{ byFile: new Map([["src/a.ts", [FINDING]]]), FindingSlot: () => null }}
        />
      </NextIntlClientProvider>,
    );

    const headers = screen.getAllByRole("button", {
      name: /^(Core logic|Tests|Docs|Boilerplate)/,
    });
    expect(headers.map((h) => h.getAttribute("aria-expanded"))).toEqual([
      "true",
      "true",
      "false",
      "false",
    ]);
    expect(headers[0]).toHaveTextContent(/^Core logic.*2 files$/);
    expect(headers[1]).toHaveTextContent(/^Tests.*1 file$/);
    expect(headers[2]).toHaveTextContent(/^Docs/);
    expect(headers[3]).toHaveTextContent(/^Boilerplate/);

    const counter = screen.getByRole("img", { name: "1 file with findings" });
    expect(counter).toHaveTextContent("● 1");
    expect(headers[0]).toContainElement(counter);
    expect(headers[1]).not.toHaveTextContent("●");

    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    fireEvent.click(headers[3]!);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});
