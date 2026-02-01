/**
 * =====================================
 * 🔐 인증 Context - 글로벌 사용자 상태 관리
 * =====================================
 *
 * 이 파일의 역할:
 * 1. 앱 시작 시 토큰 복구 및 사용자 정보 로드
 * 2. OAuth 로그인 후 토큰 저장
 * 3. 로그아웃 시 토큰 삭제
 * 4. 모든 컴포넌트에서 useAuth() 훅으로 사용자 정보 접근
 *
 * 토큰 흐름:
 * [서버 OAuth] → Access Token(URL) + Refresh Token(쿠키)
 *   ↓
 * [초기화] → URL에서 Access Token 추출 → 메모리/sessionStorage 저장
 *   ↓
 * [/auth/me] → Access Token 유효성 검사 → 사용자 정보 로드
 *   ↓
 * [API 요청] → Access Token 만료 → Refresh Token으로 갱신 → 재시도
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User } from '../api/client';
import { saveToken, getToken, removeToken } from '../utils/tokenStorage';

/**
 * =====================================
 * 📝 AuthContextType - Context 타입
 * =====================================
 *
 * user: 현재 로그인한 사용자 정보
 *   - null: 로그인 안 됨
 *   - User: 로그인 됨
 *
 * loading: 초기 사용자 정보 로드 중 여부
 *   - true: 초기화 중
 *   - false: 초기화 완료
 *
 * login(provider): OAuth 로그인 시작
 *   - 'google' 또는 'github' 제공자로 로그인
 *   - 서버로 리다이렉트
 *
 * logout(): 로그아웃
 *   - 비동기 함수
 *   - 서버에서 쿠키 삭제 + 클라이언트 토큰 삭제
 *
 * refetch(): 사용자 정보 다시 로드
 *   - API에서 현재 사용자 정보 조회
 *   - 수동 새로고침 용도
 */
interface AuthContextType {
  user: User | null;
  loading: boolean;
  loadingStatus: 'booting' | 'authorizing' | 'refreshing' | 'idle';
  login: (provider: 'google' | 'github') => void;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * =====================================
 * 🏗️ AuthProvider - Context Provider 컴포넌트
 * =====================================
 *
 * 역할:
 * - 앱 초기화 시 토큰 복구 및 사용자 정보 로드
 * - OAuth 로그인 후 토큰 저장
 * - 로그아웃 처리
 *
 * 사용 방법:
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ===== 상태 관리 =====
  const [user, setUser] = useState<User | null>(null); // 현재 사용자
  const [loading, setLoading] = useState(true); // 초기화 상태
  const [loadingStatus, setLoadingStatus] = useState<'booting' | 'authorizing' | 'refreshing' | 'idle'>('booting');

  /**
   * =====================================
   * 👤 fetchUser() - 사용자 정보 조회
   * =====================================
   *
   * 역할:
   * - /auth/me 엔드포인트 호출
   * - 현재 Access Token으로 사용자 정보 조회
   *
   * 처리:
   * 1️⃣ 토큰이 유효하면: 사용자 정보 반환 → setUser()
   * 2️⃣ 토큰이 만료되면: client.ts의 자동 갱신 로직 실행
   *    - /auth/refresh로 새 토큰 요청
   *    - 새 토큰으로 /auth/me 재시도
   *    - 갱신 실패하면: null 반환 → setUser(null)
   * 3️⃣ 에러 발생하면: catch에서 null 처리
   *
   * 호출 시점:
   * - 앱 초기화 (useEffect)
   * - refetch() 호출 시 (수동)
   */
  const fetchUser = async () => {
    // 테스트용 인위적 delay (로컬 테스트 시에만 사용)
    // await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const { user } = await authApi.getMe();
      console.log('받은 user:', user);  // ← 실제 값 확인!
      setUser(user);
    } catch (error: any) {
      // 401 응답: 토큰이 만료되었을 가능성 → refreshing 상태로 변경
      if (error.status === 401) {
        console.log('📡 401 응답 받음, 토큰 갱신 시도...');
        setLoadingStatus('refreshing');

        // refresh 토큰으로 새 access 토큰 요청
        try {
          const refreshResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });

          if (refreshResponse.ok) {
            const { accessToken } = await refreshResponse.json();
            saveToken(accessToken);
            console.log('✅ 토큰 갱신 성공, 다시 시도...');

            // 갱신 후 다시 사용자 정보 조회
            const { user: refreshedUser } = await authApi.getMe();
            setUser(refreshedUser);
          } else {
            console.log('❌ 토큰 갱신 실패');
            setUser(null);
          }
        } catch (refreshError) {
          console.error('❌ 토큰 갱신 오류:', refreshError);
          setUser(null);
        }
      } else {
        // 다른 에러
        setUser(null);
      }
    } finally {
      // 초기화 완료 (성공/실패 무관)
      setLoading(false);
      setLoadingStatus('idle');
    }
  };

  /**
   * =====================================
   * 🚀 useEffect - 앱 초기화 로직
   * =====================================
   *
   * 흐름:
   * 1️⃣ URL 파라미터 확인
   *    - OAuth 콜백에서 ?token=xxx 형태로 Access Token 전달
   *    - URL에서 추출 → saveToken()으로 저장
   *    - URL 정리 (보안): window.history.replaceState()
   *
   * 2️⃣ 토큰 확인
   *    - 메모리/sessionStorage에 토큰 있으면: /auth/me 호출
   *    - 토큰 없으면: 로그인 화면 표시 (loading=false)
   *
   * 3️⃣ 사용자 정보 로드
   *    - fetchUser() 호출
   *    - API 요청 → 자동 토큰 갱신 (필요시)
   *
   * 타이밍:
   * - 컴포넌트 마운트 시 한 번만 실행 ([])
   * - 페이지 새로고침 후에도 실행됨
   *
   * 정상 시나리오:
   * OAuth → ?token=xxx → saveToken() → fetchUser() → setUser()
   *
   * 페이지 새로고침 시나리오:
   * sessionStorage → getToken() → fetchUser() → setUser()
   *
   * 토큰 만료 시나리오:
   * getToken() → fetchUser() → /auth/me 401 → /auth/refresh → 갱신 → 재시도
   */
  useEffect(() => {
    /**
     * ===== Step 1: URL에서 Access Token 추출 =====
     *
     * OAuth 콜백 흐름:
     * 1. /auth/google/callback (또는 /github/callback)
     * 2. Passport 인증 처리
     * 3. res.redirect(`${CLIENT_URL}?token=${accessToken}`)
     * 4. 클라이언트 로드 → URL에서 token 파라미터 추출
     *
     * 보안 처리:
     * - saveToken(): 메모리 + sessionStorage에 저장
     * - window.history.replaceState(): URL에서 token 제거
     *   → 브라우저 히스토리에 토큰이 남지 않음
     *   → 히스토리 노출 방지
     */
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('token');

    if (tokenFromURL) {
      // ✅ URL에 토큰이 있으면: 메모리 + sessionStorage에 저장
      saveToken(tokenFromURL);

      // 🔐 보안: URL에서 token 파라미터 제거
      // 브라우저 히스토리에 ?token=xxx가 남지 않도록 처리
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // 모든 경우 'booting' 상태 유지

    /**
     * ===== Step 2: 사용자 정보 로드 =====
     *
     * 세 가지 경우:
     *
     * ✅ Case 1: Access Token이 유효한 경우
     *    - getToken() → 메모리/sessionStorage에서 토큰 조회
     *    - /auth/me 호출 → 사용자 정보 반환
     *    - setUser(user) → 로그인 상태
     *
     * ✅ Case 2: Access Token이 만료되었지만 Refresh Token이 있는 경우
     *    - getToken() → 토큰 있음 → fetchUser() 호출
     *    - /auth/me에서 401 받음
     *    - client.ts의 자동 갱신: /auth/refresh 호출
     *    - Refresh Token 쿠키 자동 포함 (credentials: 'include')
     *    - 새 Access Token 받음 → saveToken()
     *    - /auth/me 재시도 → 사용자 정보 반환
     *
     * ❌ Case 3: 토큰이 없는 경우 (처음 방문 또는 로그아웃)
     *    - getToken() → null
     *    - fetchUser() 호출하지 않음
     *    - setLoading(false) → 로그인 화면 표시
     *
     * ❌ Case 4: 토큰은 있지만 Refresh Token이 없는 경우 (문제)
     *    - getToken() → 토큰 있음 → fetchUser() 호출
     *    - /auth/me에서 401 받음
     *    - /auth/refresh 시도 → Refresh Token 쿠키 없음
     *    - refreshAccessToken() → null 반환
     *    - setUser(null) → 로그인 화면으로 이동
     *    - 해결: 다시 로그인해야 함
     *
     * 🔍 문제 진단:
     *
     * Q: 페이지 새로고침 후 다시 로그인해야 하는가?
     * A: Refresh Token이 쿠키에 저장되지 않았을 가능성
     *
     * 점검 항목:
     * 1. server/.env에 NODE_ENV=production 설정
     *    → railway 배포 시 필수
     *    → secure: true이므로 HTTPS 필요
     *
     * 2. Railway에서 HTTPS 연결 확인
     *    → curl -I https://your-app.railway.app
     *    → 200 응답 확인
     *
     * 3. 브라우저 개발도구 → Application → Cookies → [도메인]
     *    → refreshToken 쿠키 보이는가?
     *    → HttpOnly, Secure, SameSite=Lax, Path=/ 플래그 확인
     *
     * 4. server/src/index.ts 확인
     *    → app.use(cookieParser()) 있는가?
     *    → cors({ credentials: true }) 있는가?
     *
     * 5. client/api/client.ts 확인
     *    → credentials: 'include' 사용하는가?
     */

    // 항상 fetchUser() 호출
    // 토큰이 있으면: 그냥 사용
    // 토큰이 없으면: client.ts에서 /auth/refresh로 자동 갱신
    setLoadingStatus('authorizing');
    fetchUser();
  }, []); // 앱 초기화 시에만 한 번 실행

  /**
   * =====================================
   * 🔑 login() - OAuth 로그인
   * =====================================
   *
   * 역할:
   * - Google/GitHub OAuth 페이지로 리다이렉트
   * - 사용자가 승인 → 콜백 → 토큰 받음
   *
   * 흐름:
   * 1. login('google') 호출
   * 2. window.location.href = '/auth/google' 리다이렉트
   * 3. Google OAuth 로그인 화면
   * 4. /auth/google/callback으로 콜백
   * 5. Passport 처리 → 토큰 발급
   * 6. ?token=xxx와 함께 클라이언트로 리다이렉트
   * 7. useEffect → URL 파싱 → saveToken() → fetchUser()
   *
   * 구현:
   * - authApi.googleLogin() / githubLogin() 호출
   * - 이 함수들은 window.location.href 설정 (페이지 이동)
   * - 토큰을 받으면 1단계로 돌아감 (useEffect 실행)
   */
  const login = (provider: 'google' | 'github') => {
    if (provider === 'google') {
      authApi.googleLogin();
    } else {
      authApi.githubLogin();
    }
  };

  /**
   * =====================================
   * 🚪 logout() - 로그아웃
   * =====================================
   *
   * 역할:
   * - 서버에서 Refresh Token 쿠키 삭제
   * - 클라이언트에서 Access Token 삭제
   * - 사용자 상태 초기화
   *
   * 흐름:
   * 1. logout() 호출
   * 2. authApi.logout() → /auth/logout POST
   * 3. 서버: Refresh Token 쿠키 삭제 (res.clearCookie())
   * 4. 클라이언트: removeToken() → 메모리/sessionStorage 삭제
   * 5. setUser(null) → 로그인 화면 표시
   *
   * 에러 처리:
   * - 서버 로그아웃 실패 → 어차피 토큰 삭제 (안전)
   * - 오프라인 또는 네트워크 오류 → 토큰만 삭제
   * - 결과: 최악의 경우에도 클라이언트에서는 로그아웃됨
   *
   * 보안:
   * ✓ Refresh Token 쿠키 삭제:
   *   - 더 이상 새 Access Token 발급 불가능
   *   - 7일 후 자동 만료 (maxAge)
   *
   * ✓ Access Token 삭제:
   *   - API 요청 시 Authorization 헤더 없음
   *   - 서버가 401 반환 (token refresh 불가)
   *
   * 결과:
   * - 사용자가 다시 로그인할 때까지 인증 불가능
   */
  const logout = async () => {
    try {
      // 서버에서 Refresh Token 쿠키 삭제
      await authApi.logout();

      // 클라이언트에서 Access Token 삭제
      removeToken();

      // 사용자 상태 초기화
      setUser(null);
    } catch (error) {
      // 서버 요청 실패해도 클라이언트 정리
      console.error('Logout failed:', error);

      // 토큰과 사용자 상태 어차피 삭제
      removeToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loadingStatus, login, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * =====================================
 * 🎣 useAuth() - 커스텀 훅
 * =====================================
 *
 * 역할:
 * - Context의 값에 쉽게 접근
 * - 모든 컴포넌트에서 사용
 *
 * 사용 예:
 * const { user, loading, login, logout, refetch } = useAuth();
 *
 * if (loading) return <div>Loading...</div>;
 * if (!user) return <LoginPage />;
 * return <Dashboard user={user} />;
 *
 * 에러 처리:
 * - AuthProvider 없이 사용하면 에러 throw
 * - 반드시 <AuthProvider>로 감싸야 함
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
