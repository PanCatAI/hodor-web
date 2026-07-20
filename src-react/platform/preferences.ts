export const HODOR_THEME_KEY = "hodorTheme";
export const HODOR_LANGUAGE_KEY = "hodorLanguage";

export type ThemePreference = "auto" | "light" | "dark";
export type HodorLanguage = "zh-CN" | "en";

export interface PlatformPreferences {
  theme: ThemePreference;
  language: HodorLanguage;
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ReadPreferencesOptions {
  storage?: Pick<PreferenceStorage, "getItem">;
  navigatorLanguage?: string;
}

interface ApplyThemeOptions {
  root?: HTMLElement;
  prefersDark?: boolean;
}

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "auto" || value === "light" || value === "dark";
}

function isHodorLanguage(value: string | null | undefined): value is HodorLanguage {
  return value === "zh-CN" || value === "en";
}

export function normalizeLanguage(language: string | null | undefined): HodorLanguage {
  if (language?.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

export function readPreferences(options: ReadPreferencesOptions = {}): PlatformPreferences {
  const storage = options.storage ?? globalThis.localStorage;
  const storedTheme = storage?.getItem(HODOR_THEME_KEY);
  const storedLanguage = storage?.getItem(HODOR_LANGUAGE_KEY);

  return {
    theme: isThemePreference(storedTheme) ? storedTheme : "auto",
    language: isHodorLanguage(storedLanguage)
      ? storedLanguage
      : normalizeLanguage(options.navigatorLanguage ?? globalThis.navigator?.language),
  };
}

export function saveThemePreference(theme: ThemePreference, storage: PreferenceStorage = globalThis.localStorage): void {
  storage.setItem(HODOR_THEME_KEY, theme);
}

export function saveLanguagePreference(language: HodorLanguage, storage: PreferenceStorage = globalThis.localStorage): void {
  storage.setItem(HODOR_LANGUAGE_KEY, language);
}

export function applyThemePreference(theme: ThemePreference, options: ApplyThemeOptions = {}): "light" | "dark" {
  const root = options.root ?? globalThis.document.documentElement;
  const prefersDark =
    options.prefersDark ?? globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const effectiveTheme = theme === "auto" ? (prefersDark ? "dark" : "light") : theme;

  root.classList.toggle("dark", effectiveTheme === "dark");
  root.setAttribute("theme-mode", effectiveTheme);
  root.style.colorScheme = effectiveTheme;

  return effectiveTheme;
}
