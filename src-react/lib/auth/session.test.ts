import { describe, expect, it } from "vitest";

import { clearSession, readSession, saveSession } from "./session";

const loginSession = {
  token: "Bearer pancat-session",
  id: "operator",
  name: "operator",
  partnerId: "pancat",
  partnerName: "PanCat",
  role: "super_admin",
};

describe("Pancat session storage", () => {
  it("uses the legacy storage keys during migration", () => {
    saveSession(loginSession);

    expect(localStorage.getItem("token")).toBe("Bearer pancat-session");
    expect(localStorage.getItem("userId")).toBe("operator");
    expect(JSON.parse(localStorage.getItem("pancatAccount") ?? "null")).toEqual({
      username: "operator",
      partnerId: "pancat",
      partnerName: "PanCat",
      role: "super_admin",
    });
    expect(readSession()).toEqual(loginSession);
  });

  it("clears every compatible session key", () => {
    saveSession(loginSession);

    clearSession();

    expect(readSession()).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("userId")).toBeNull();
    expect(localStorage.getItem("pancatAccount")).toBeNull();
  });
});
