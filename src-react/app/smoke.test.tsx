import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HodorApp } from "./hodor-app";

describe("Hodor React app", () => {
  it("renders the product name", () => {
    render(<HodorApp />);

    expect(screen.getByText("Hodor")).toBeInTheDocument();
  });
});
