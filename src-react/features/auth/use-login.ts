import { useState } from "react";

import { saveSession } from "@react/lib/auth/session";
import type { PancatCredentials, PancatLoginSession } from "@react/lib/auth/types";

export type LoginFunction = (credentials: PancatCredentials) => Promise<PancatLoginSession>;

export function useLogin(login: LoginFunction, onAuthenticated: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(credentials: PancatCredentials) {
    if (!credentials.username.trim() || !credentials.password) {
      setError("请输入 Pancat 账号和密码");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const session = await login({
        username: credentials.username.trim(),
        password: credentials.password,
      });
      saveSession(session);
      onAuthenticated();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return { error, isSubmitting, submit };
}
