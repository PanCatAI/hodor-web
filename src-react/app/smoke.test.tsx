import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HodorApp } from "./hodor-app";

describe("Hodor React app", () => {
  it("resolves the runtime backend before rendering the product", async () => {
    window.scrollTo = vi.fn();
    window.history.replaceState(null, "", "/index.react.html#/login");
    const resolveBackendApiBaseUrl = vi.fn(async () => "http://127.0.0.1:10588/api");
    render(<HodorApp resolveBackendApiBaseUrl={resolveBackendApiBaseUrl} />);

    expect(screen.getByText("正在连接 Hodor 后端…")).toBeInTheDocument();
    expect(await screen.findByText("Hodor")).toBeInTheDocument();
    expect(resolveBackendApiBaseUrl).toHaveBeenCalledOnce();
  });
});
