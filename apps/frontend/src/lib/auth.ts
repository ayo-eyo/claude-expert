const ACCESS_TOKEN_KEY = 'accessToken';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function decodeAccessToken(token: string): AuthenticatedUser | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64)) as { sub?: unknown; email?: unknown };
    if (typeof json.sub !== 'string' || typeof json.email !== 'string') return null;
    return { id: json.sub, email: json.email };
  } catch {
    return null;
  }
}
