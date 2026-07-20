import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HodorApp } from "./hodor-app";

describe("Hodor React app", () => {
  it("renders the product name", async () => {
    window.scrollTo = vi.fn();
    window.history.replaceState(null, "", "/index.react.html#/login");
    render(<HodorApp />);

    expect(await screen.findByText("Hodor")).toBeInTheDocument();
  });
});
