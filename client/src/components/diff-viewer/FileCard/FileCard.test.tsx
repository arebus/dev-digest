import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/a.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -1,1 +1,3 @@\n const a = 1;\n+const b = 2;\n+const c = 3;",
};

const finding = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "Anchored finding",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "because",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
});

const Slot = ({ finding: f }: { finding: FindingRecord }) => <div>{f.title}</div>;

function renderCard(list: FindingRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <FileCard file={FILE} findings={{ byFile: new Map([[FILE.path, list]]), FindingSlot: Slot }} />
    </NextIntlClientProvider>,
  );
}

/** The wrapper of one rendered diff line (row + whatever hangs under it). */
const lineWrapper = (code: string) => screen.getByText(code).parentElement!.parentElement!;

describe("FileCard findings", () => {
  it("marks the file and shows the finding under its line; unanchored ones go outside", () => {
    renderCard([
      finding({}),
      finding({ id: "f2", title: "Elsewhere finding", start_line: 40, end_line: 40 }),
    ]);
    expect(screen.getByRole("img", { name: "2 open findings" })).toBeInTheDocument();

    const line = lineWrapper("const b = 2;");
    expect(within(line).getByText("Anchored finding")).toBeInTheDocument();
    expect(within(line).getByText(SEV.WARNING.label)).toBeInTheDocument();
    expect(within(line).queryByText("Elsewhere finding")).not.toBeInTheDocument();

    expect(screen.getByText("1 finding outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Elsewhere finding")).toBeInTheDocument();
  });

  it("keeps a dismissed finding visible but neither dots the file nor decorates the line", () => {
    renderCard([finding({ dismissed_at: "2026-01-01T00:00:00Z" })]);
    expect(screen.getByText("Anchored finding")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(SEV.WARNING.label)).not.toBeInTheDocument();
  });
});
