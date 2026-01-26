const TOKEN_KEY = 'auth_token';

/**
 * 메모리 저장소 (XSS 보안)
 * - 페이지 새로고침 시 사라짐 (XSS 공격 범위 제한)
 * - 메모리는 다른 탭과 공유 안됨
 * - Refresh Token으로 자동 갱신됨 (추후 구현)
 */
let tokenInMemory: string | null = null;

export function saveToken(token: string): void {
  // 메모리에만 저장 (XSS 방어)
  tokenInMemory = token;
  // 하이브리드: sessionStorage 백업 (페이지 새로고침 복구용)
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  // 메모리 우선
  if (tokenInMemory) {
    return tokenInMemory;
  }
  // 메모리 없으면 sessionStorage에서 복구
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
