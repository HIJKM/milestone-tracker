const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_BACKUP_KEY = 'refresh_token_backup';

/**
 * 메모리 저장소 (XSS 보안)
 * - 페이지 새로고침 시 사라짐 (XSS 공격 범위 제한)
 * - 메모리는 다른 탭과 공유 안됨
 * - Refresh Token(쿠키)으로 자동 갱신됨
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

/**
 * Refresh Token 백업 (localStorage)
 * - PWA 재시작 후 토큰 복구용
 * - 실제 Refresh Token은 httpOnly 쿠키에 안전하게 저장됨
 * - 이것은 "쿠키가 존재한다"는 신호만 저장
 */
export function saveRefreshTokenBackup(): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_BACKUP_KEY, 'true');
  } catch (error) {
    console.warn('Failed to save refresh token backup:', error);
  }
}

export function getRefreshTokenBackup(): boolean {
  try {
    return localStorage.getItem(REFRESH_TOKEN_BACKUP_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

/**
 * 완전 로그아웃: 메모리 + sessionStorage + localStorage 모두 정리
 */
export function clearAllTokens(): void {
  tokenInMemory = null;
  sessionStorage.removeItem(TOKEN_KEY);
  try {
    localStorage.removeItem(REFRESH_TOKEN_BACKUP_KEY);
  } catch (error) {
    console.warn('Failed to clear refresh token backup:', error);
  }
}

export function getAuthHeader(): { Authorization: string } | {} {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
