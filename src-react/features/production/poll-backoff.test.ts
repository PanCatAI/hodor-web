import { describe, expect, it } from "vitest";

import { nextPollDelay } from "./production-workbench";

describe("production polling recovery", () => {
  it("backs off repeated failures and caps recovery polling at thirty seconds", () => {
    expect(nextPollDelay(1_000, 0)).toBe(1_000);
    expect(nextPollDelay(1_000, 1)).toBe(2_000);
    expect(nextPollDelay(1_000, 4)).toBe(16_000);
    expect(nextPollDelay(1_000, 9)).toBe(30_000);
  });
});
