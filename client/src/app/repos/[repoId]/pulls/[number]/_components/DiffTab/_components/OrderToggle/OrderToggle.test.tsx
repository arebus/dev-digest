import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { OrderToggle } from "./OrderToggle";

afterEach(cleanup);

describe("OrderToggle", () => {
  it("marks the current order and reports the picked one", () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <OrderToggle value="smart" onChange={onChange} />
      </NextIntlClientProvider>,
    );
    const smart = screen.getByRole("button", { name: "Smart order" });
    const original = screen.getByRole("button", { name: "Original order" });
    expect(smart).toHaveAttribute("aria-pressed", "true");
    expect(original).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(original);
    expect(onChange).toHaveBeenCalledWith("original");
  });
});
