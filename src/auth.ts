export type AuthUser = {
  id: number;
  email: string | null;
  nickname: string;
};

const storageKey = "mybank.user";
const savedIdentifierKey = "mybank.savedIdentifier";

export function getSavedIdentifier(): string {
  return localStorage.getItem(savedIdentifierKey) ?? "";
}

export function setSavedIdentifier(identifier: string | null) {
  const trimmed = identifier?.trim();
  if (trimmed) {
    localStorage.setItem(savedIdentifierKey, trimmed);
    return;
  }
  localStorage.removeItem(savedIdentifierKey);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function storeUser(user: AuthUser, autoLogin: boolean) {
  const serialized = JSON.stringify(user);
  if (autoLogin) {
    sessionStorage.removeItem(storageKey);
    localStorage.setItem(storageKey, serialized);
    return;
  }

  localStorage.removeItem(storageKey);
  sessionStorage.setItem(storageKey, serialized);
}

export function clearStoredUser() {
  localStorage.removeItem(storageKey);
  sessionStorage.removeItem(storageKey);
}

export async function apiFetch<T>(path: string, user: AuthUser, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(user.id),
      ...(init.headers ?? {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? "요청에 실패했습니다.");
  }

  return body as T;
}
