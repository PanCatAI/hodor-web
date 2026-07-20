import { useEffect, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";

import { applyThemePreference, readBackendApiBaseUrl, readPreferences } from "@react/platform";
import { createHodorRouter, createRouterContext, type HodorRouter } from "./router";

interface HodorAppProps {
  resolveBackendApiBaseUrl?: () => Promise<string>;
}

function resolveDefaultBackendApiBaseUrl() {
  return readBackendApiBaseUrl({ envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL });
}

export function HodorApp({
  resolveBackendApiBaseUrl = resolveDefaultBackendApiBaseUrl,
}: HodorAppProps) {
  const [router, setRouter] = useState<HodorRouter | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const preferences = readPreferences();
    applyThemePreference(preferences.theme);
    document.documentElement.lang = preferences.language;

    let cancelled = false;
    void resolveBackendApiBaseUrl()
      .then((apiBaseUrl) => {
        if (!cancelled) setRouter(createHodorRouter(createRouterContext(apiBaseUrl)));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Hodor 后端地址解析失败");
      });
    return () => {
      cancelled = true;
    };
  }, [resolveBackendApiBaseUrl]);

  if (error) {
    return <main role="alert" className="grid min-h-screen place-items-center bg-[#090b10] px-6 text-red-300">{error}</main>;
  }

  if (!router) {
    return <main className="grid min-h-screen place-items-center bg-[#090b10] text-sm text-slate-400">正在连接 Hodor 后端…</main>;
  }

  return <RouterProvider router={router} />;
}
