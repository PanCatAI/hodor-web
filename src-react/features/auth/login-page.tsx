import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";

import { Input } from "@react/components/ui/input";
import { Label } from "@react/components/ui/label";
import { createApiClient, resolveApiBaseUrl } from "@react/lib/api/client";
import { clearSession, getSessionToken } from "@react/lib/auth/session";
import { LoginForm } from "./login-form";
import type { LoginFunction } from "./use-login";

const API_BASE_URL_KEY = "hodorApiBaseUrl";

interface LoginPageProps {
  login?: LoginFunction;
  onAuthenticated?: () => void;
  initialApiBaseUrl?: string;
}

function getInitialApiBaseUrl(initialApiBaseUrl?: string): string {
  if (initialApiBaseUrl) return initialApiBaseUrl;
  return resolveApiBaseUrl({
    envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL,
    storedBaseUrl: localStorage.getItem(API_BASE_URL_KEY),
    location: window.location,
  });
}

export function LoginPage({ login, onAuthenticated, initialApiBaseUrl }: LoginPageProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getInitialApiBaseUrl(initialApiBaseUrl));
  const defaultLogin = useMemo<LoginFunction>(() => {
    const client = createApiClient({
      baseUrl: apiBaseUrl,
      getToken: getSessionToken,
      onUnauthorized: clearSession,
    });
    return client.login;
  }, [apiBaseUrl]);

  const handleAuthenticated = onAuthenticated ?? (() => window.location.assign("#/projects"));

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090b10] px-5 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <section className="relative w-full max-w-sm">
        <header className="mb-9">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary font-black text-primary-foreground">H</div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Hodor</h1>
              <p className="mt-1 text-sm text-slate-500">自动内容生产线</p>
            </div>
          </div>
          <p className="max-w-xs text-sm leading-6 text-slate-400">使用 Pancat 账号进入项目、资产和生产工作台。</p>
        </header>

        <LoginForm login={login ?? defaultLogin} onAuthenticated={handleAuthenticated} />

        <details className="group mt-6 border-t border-border pt-4 text-sm text-slate-500">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-2 hover:text-slate-300">
            <Settings2 size={15} />
            后端地址
          </summary>
          <div className="mt-2 space-y-2">
            <Label htmlFor="api-base-url">Hodor API</Label>
            <Input
              id="api-base-url"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              onBlur={() => localStorage.setItem(API_BASE_URL_KEY, apiBaseUrl.trim())}
            />
          </div>
        </details>
      </section>
    </main>
  );
}
