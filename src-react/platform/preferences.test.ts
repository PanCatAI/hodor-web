import { describe, expect, it } from "vitest";

import {
  HODOR_LANGUAGE_KEY,
  HODOR_THEME_KEY,
  applyThemePreference,
  readPreferences,
  saveLanguagePreference,
  saveThemePreference,
} from "./preferences";

describe("Hodor platform preferences", () => {
  it("reads valid preferences and derives the language from the browser", () => {
    localStorage.setItem(HODOR_THEME_KEY, "light");

    expect(readPreferences({ storage: localStorage, navigatorLanguage: "en-US" })).toEqual({
      theme: "light",
      language: "en",
    });
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(HODOR_THEME_KEY, "midnight");
    localStorage.setItem(HODOR_LANGUAGE_KEY, "fr");

    expect(readPreferences({ storage: localStorage, navigatorLanguage: "zh-TW" })).toEqual({
      theme: "auto",
      language: "zh-CN",
    });
  });

  it("persists theme and language independently", () => {
    saveThemePreference("dark", localStorage);
    saveLanguagePreference("en", localStorage);

    expect(localStorage.getItem(HODOR_THEME_KEY)).toBe("dark");
    expect(localStorage.getItem(HODOR_LANGUAGE_KEY)).toBe("en");
  });

  it("applies the effective theme to both the React and legacy theme hooks", () => {
    applyThemePreference("auto", {
      root: document.documentElement,
      prefersDark: true,
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("theme-mode")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyThemePreference("light", {
      root: document.documentElement,
      prefersDark: true,
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("theme-mode")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
