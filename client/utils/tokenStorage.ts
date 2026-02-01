const TOKEN_KEY = 'auth_token';

let tokenInMemory: string | null = null;

export function saveToken(token: string): void {
  tokenInMemory = token;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (tokenInMemory) {
    return tokenInMemory;
  }

  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) {
    tokenInMemory = stored;
    return stored;
  }

  return null;
}

export function removeToken(): void {
  tokenInMemory = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeader(): { Authorization: string } | {} {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
