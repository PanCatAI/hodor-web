import type { PancatAccount, PancatLoginSession } from "./types";

const TOKEN_KEY = "token";
const USER_ID_KEY = "userId";
const ACCOUNT_KEY = "pancatAccount";

export function saveSession(session: PancatLoginSession): void {
  const account: PancatAccount = {
    username: session.name,
    partnerId: session.partnerId,
    partnerName: session.partnerName,
    role: session.role,
  };

  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_ID_KEY, session.id);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function readSession(): PancatLoginSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const id = localStorage.getItem(USER_ID_KEY);
  const accountJson = localStorage.getItem(ACCOUNT_KEY);
  if (!token || !id || !accountJson) return null;

  try {
    const account = JSON.parse(accountJson) as Partial<PancatAccount>;
    if (!account.username || !account.partnerId || !account.partnerName || !account.role) return null;

    return {
      token,
      id,
      name: account.username,
      partnerId: account.partnerId,
      partnerName: account.partnerName,
      role: account.role,
    };
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}
