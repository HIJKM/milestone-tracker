/**
 * =====================================
 * 🔗 API 클라이언트: 자동 토큰 갱신 로직
 * =====================================
 *
 * 이 파일의 핵심 기능:
 * 1. API 요청 시 Access Token을 Authorization 헤더에 자동 포함
 * 2. Access Token 만료 시 자동으로 Refresh Token으로 갱신
 * 3. 갱신 후 원래 요청을 자동 재시도
 *
 * 토큰 플로우:
 * 요청 → Access Token 포함 → 401 응답 → Refresh Token 사용 → 새 Access Token → 요청 재시도
 */

import { getAuthHeader, getToken, saveToken } from '../utils/tokenStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  body?: any;
}

/**
 * =====================================
 * 🔄 refreshAccessToken() - Access Token 갱신
 * =====================================
 *
 * 역할:
 * - Refresh Token으로 새 Access Token 요청
 * - /auth/refresh 엔드포인트 호출
 *
 * 동작 원리:
 * 1️⃣ /auth/refresh POST 요청
 *    - credentials: 'include'로 Refresh Token 쿠키 자동 포함
 *
 * 2️⃣ 서버에서 Refresh Token 검증
 *    - req.cookies.refreshToken에서 쿠키 추출
 *    - 유효하면 새 Access Token 발급
 *    - 만료되면 401 응답
 *
 * 3️⃣ 응답 처리
 *    - 성공: 새 Access Token 추출 → saveToken() 저장
 *    - 실패: null 반환 → 클라이언트 재로그인 필요
 *
 * 보안:
 * ✓ Refresh Token은 httpOnly 쿠키
 *   - JavaScript에서 접근 불가능
 *   - 자동으로 요청에 포함됨 (credentials: 'include')
 *   - XSS 공격으로부터 보호
 *
 * 🔍 문제 해결:
 *
 * ❌ 이 함수가 null 반환 (갱신 실패):
 * 1. Refresh Token 쿠키가 저장되지 않음
 *    → server/.env에서 NODE_ENV=production 확인
 *    → Railway에서 HTTPS 연결 확인
 *
 * 2. Refresh Token이 이미 만료됨 (7일 초과)
 *    → 사용자가 다시 로그인해야 함
 *
 * 3. CORS credentials 설정 미흡
 *    → index.ts에서 cors({ credentials: true }) 확인
 *    → 클라이언트의 fetch(credentials: 'include') 확인
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      // ✅ 중요: credentials: 'include'로 쿠키 자동 포함
      // 이것이 없으면 Refresh Token 쿠키가 서버로 전송되지 않음
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // ❌ 갱신 실패
      // 상황별 분석:
      // - 401: Refresh Token이 없거나 만료됨
      // - 403: Refresh Token 검증 실패 (위변조 등)
      console.warn(`❌ Token refresh failed with status ${response.status}`);
      return null;
    }

    // ✅ 갱신 성공
    const data = await response.json();
    console.log('📡 /auth/refresh 응답:', data);  // ← 뭐가 받아지는지 확인

    const { accessToken } = data;
    console.log('📡 추출된 accessToken:', accessToken?.substring(0, 20) + '...');

    // 새 Access Token을 메모리 + sessionStorage에 저장
    saveToken(accessToken);
    console.log('💾 saveToken() 실행됨');

    console.log('✅ Access token refreshed');
    return accessToken;
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    return null;
  }
}

/**
 * =====================================
 * 📡 request<T>() - 중앙 집중식 API 요청
 * =====================================
 *
 * 역할:
 * - 모든 API 요청의 중앙 처리
 * - Access Token 자동 포함
 * - 토큰 만료 시 자동 갱신
 * - 요청 재시도
 *
 * 사용 흐름:
 * api.get('/api/milestones')
 *   → request<Milestone[]>('/api/milestones', { method: 'GET' })
 *   → 이 함수에서 처리
 *
 * 특징:
 * ✓ 자동 토큰 갱신: 401 → 갱신 → 재시도
 * ✓ Refresh Token 자동 포함: credentials: 'include'
 * ✓ 요청 헤더 병합: Content-Type, Authorization, 커스텀 헤더
 * ✓ JSON body 자동 직렬화
 */
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  // 요청 옵션 분해
  const { body, ...customOptions } = options;

  // 요청 설정 생성
  const config: RequestInit = {
    ...customOptions,
    // ✅ 중요: 모든 요청에 credentials: 'include' 설정
    // 이렇게 하면 Refresh Token 쿠키가 자동으로 포함됨
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // ✅ 현재 메모리/sessionStorage에서 Access Token 추출
      // Authorization: Bearer [token] 헤더 자동 생성
      ...getAuthHeader(),
      // 커스텀 헤더로 기본 헤더 오버라이드 가능
      ...customOptions.headers,
    },
  };

  // JSON body가 있으면 직렬화
  if (body) {
    config.body = JSON.stringify(body);
  }

  // ===== 1단계: 첫 번째 요청 =====
  let response = await fetch(`${API_URL}${endpoint}`, config);
  console.log(`📡 [1단계] ${customOptions.method} ${endpoint} → status: ${response.status}`);
  /**
   * ===== 2단계: Access Token 자동 갱신 로직 =====
   *
   * 상황:
   * - response.status === 401
   *   → Access Token이 만료되거나 유효하지 않음
   *
   * - getToken()이 true
   *   → 메모리/sessionStorage에 토큰이 있음
   *   → 새로 갱신할 수 있음
   *
   * 처리:
   * 1️⃣ refreshAccessToken() 호출
   *    - /auth/refresh 엔드포인트로 POST
   *    - httpOnly 쿠키의 Refresh Token 자동 포함
   *    - 새 Access Token 받기
   *
   * 2️⃣ 새 토큰으로 요청 재시도
   *    - 요청 헤더의 Authorization을 새 토큰으로 갱신
   *    - 원래 요청을 다시 전송
   *
   * 3️⃣ 재시도 응답 처리
   *    - 성공하면 데이터 반환
   *    - 실패하면 다시 401 → 최종 에러 처리
   *
   * ⚠️ 무한 루프 방지:
   * - refreshAccessToken()이 null 반환하면
   * - 재시도하지 않음 → 사용자 재로그인 필요
   */
  if (response.status === 401) { // 이거 안 먹고 그냥 넘어가는듯.
    console.warn('⚠️ Access token expired, attempting to refresh...');
    console.log('401 response 확인');

    // ===== 새 Access Token 요청 =====
    const newToken = await refreshAccessToken();

    if (newToken) {
      // ✅ 갱신 성공 → 새 토큰으로 요청 재시도
      config.headers = {
        ...config.headers,
        // 새 토큰을 Authorization 헤더에 포함
        ...getAuthHeader(), // Authorization: Bearer [newToken]
      };

      console.log('🔄 Retrying request with new token...');
      response = await fetch(`${API_URL}${endpoint}`, config);
    } else {
      // ❌ 갱신 실패 → 재시도하지 않음
      // 가능한 원인:
      // 1. Refresh Token 쿠키가 없음
      // 2. Refresh Token이 만료됨 (7일 초과)
      // 3. CORS 이슈
      console.warn('❌ Refresh token failed - user needs to login again');
      console.log('갱신 실패');
      // 재시도 없이 401 응답 처리로 넘어감
    }
  }

  // ===== 3단계: 최종 응답 처리 =====
  if (!response.ok) {
    // 에러 응답 처리
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  // 성공 응답 반환
  return response.json();
}

/**
 * =====================================
 * 🎯 API 객체 - 사용자 친화적 인터페이스
 * =====================================
 *
 * 모든 API 요청을 request() 함수로 처리
 * 자동 토큰 갱신 기능 포함
 *
 * 사용 예:
 * - api.get('/api/milestones')
 *   → GET /api/milestones + Authorization: Bearer [token]
 *
 * - api.post('/api/milestones', { title: '...' })
 *   → POST /api/milestones + body + Authorization: Bearer [token]
 *
 * - api.patch('/api/milestones/123', { completed: true })
 *   → PATCH /api/milestones/123 + body + Authorization: Bearer [token]
 *
 * - api.delete('/api/milestones/123')
 *   → DELETE /api/milestones/123 + Authorization: Bearer [token]
 */
export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

/**
 * =====================================
 * 🔐 인증 API - OAuth 및 사용자 정보
 * =====================================
 *
 * getMe():
 * - 현재 로그인한 사용자 정보 조회
 * - 토큰이 유효하면 사용자 반환
 * - 토큰이 만료되면 /auth/refresh로 자동 갱신
 * - 갱신 실패하면 null 반환
 *
 * logout():
 * - 서버에서 Refresh Token 쿠키 삭제
 * - 클라이언트에서 tokenStorage.removeToken() 호출
 * - 로그인 화면으로 이동
 *
 * googleLogin() / githubLogin() / devLogin():
 * - OAuth 서버로 리다이렉트
 * - 서버에서 인증 처리
 * - 콜백으로 Access Token 전달
 * - Refresh Token은 쿠키로 자동 설정
 */
export const authApi = {
  // 현재 사용자 정보 조회
  getMe: () => api.get<{ user: User | null }>('/auth/me'),

  // 로그아웃
  logout: () => api.post<{ success: boolean }>('/auth/logout'),

  // OAuth 로그인 (서버로 리다이렉트)
  googleLogin: () => {
    window.location.href = `${API_URL}/auth/google`; // '백엔드 API URL'/auth/google로 들어가는 것. 그러면 백엔드에서 router.get()으로 받음.
  },

  githubLogin: () => {
    window.location.href = `${API_URL}/auth/github`;
  },

  // 개발 모드 빠른 로그인
  devLogin: () => {
    window.location.href = `${API_URL}/auth/dev-login`;
  },
};

/**
 * =====================================
 * 📋 마일스톤 API
 * =====================================
 *
 * 모든 엔드포인트는 자동으로:
 * - Access Token을 Authorization 헤더에 포함
 * - 토큰 만료 시 Refresh Token으로 자동 갱신
 * - Refresh Token 쿠키 자동 포함 (credentials: 'include')
 */
export const milestonesApi = {
  // 모든 마일스톤 조회
  getAll: () => api.get<Milestone[]>('/api/milestones'),

  // 새 마일스톤 생성
  create: (data: CreateMilestoneData) => api.post<Milestone>('/api/milestones', data),

  // 마일스톤 수정
  update: (id: string, data: UpdateMilestoneData) => api.patch<Milestone>(`/api/milestones/${id}`, data),

  // 마일스톤 삭제
  delete: (id: string) => api.delete<{ success: boolean }>(`/api/milestones/${id}`),

  // 마일스톤 순서 변경
  reorder: (orderedIds: string[]) => api.post<Milestone[]>('/api/milestones/reorder', { orderedIds }),
};

/**
 * =====================================
 * 📝 타입 정의
 * =====================================
 *
 * User: 사용자 정보
 *   - OAuth 제공자 (Google, GitHub 등)에서 받은 기본 정보
 *
 * Milestone: 마일스톤 (프로젝트 목표)
 *   - completed: 완료 여부
 *   - type: feature, release, fix, internal 중 하나
 *
 * CreateMilestoneData: 마일스톤 생성 요청
 *   - 필수: title
 *   - 선택: description, type, tags
 *
 * UpdateMilestoneData: 마일스톤 수정 요청
 *   - 모든 필드 선택 (partial)
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string; // 'google', 'github', 'dev' 등
}

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  date: string;
  completed: boolean;
  type: 'feature' | 'release' | 'fix' | 'internal';
  tags: string[];
  order: number;
  userId: string;
}

export interface CreateMilestoneData {
  title: string;
  description?: string;
  type?: 'feature' | 'release' | 'fix' | 'internal';
  tags?: string[];
}

export interface UpdateMilestoneData {
  title?: string;
  description?: string;
  type?: 'feature' | 'release' | 'fix' | 'internal';
  tags?: string[];
  completed?: boolean;
}
