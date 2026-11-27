import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

const file = (path: string) => ({
  path,
  additions: 1,
  deletions: 0,
  patch: `@@ -0,0 +1,1 @@\n+line of ${path}`,
});

describe("DiffViewer", () => {
  it("renders files in the given order without a findings prop", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <DiffViewer files={[file("z.ts"), file("a.ts")]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByText(/^(z|a)\.ts$/).map((el) => el.textContent)).toEqual([
      "z.ts",
      "a.ts",
    ]);
    expect(screen.getByText("line of z.ts")).toBeInTheDocument();
  });
});
