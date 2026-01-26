import { getAuthHeader, getToken, saveToken, getRefreshTokenBackup, clearAllTokens } from '../utils/tokenStorage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  body?: any;
}

/**
 * 토큰 갱신 (Refresh Token 사용)
 * Refresh Token은 httpOnly 쿠키에 있으므로 자동 전송됨
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    console.log('[refreshAccessToken] Calling /auth/refresh endpoint...');
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Refresh Token 쿠키 자동 포함
    });

    console.log('[refreshAccessToken] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[refreshAccessToken] Server error:', response.status, errorData);

      // 401이면 Refresh Token도 만료됨
      if (response.status === 401) {
        console.log('[refreshAccessToken] Refresh token expired, clearing all tokens');
        clearAllTokens();
      }
      return null;
    }

    const { accessToken } = await response.json();
    console.log('[refreshAccessToken] New access token received');
    saveToken(accessToken); // 새 토큰 저장
    return accessToken;
  } catch (error) {
    console.error('[refreshAccessToken] Network error:', error);
    return null;
  }
}

/**
 * 앱 시작 시 호출: Refresh Token으로 새 Access Token 받기
 * PWA 재시작 후 자동 로그인 복구용
 */
export async function initializeAuth(): Promise<boolean> {
  try {
    // localStorage에 Refresh Token 백업 여부 확인
    const hasBackup = getRefreshTokenBackup();
    console.log('[initializeAuth] Refresh token backup exists:', hasBackup);

    if (!hasBackup) {
      console.log('[initializeAuth] No previous login info found');
      return false; // 이전 로그인 정보 없음
    }

    console.log('[initializeAuth] Attempting to refresh access token...');
    // Refresh Token으로 새 Access Token 받기
    const newToken = await refreshAccessToken();
    const success = !!newToken;
    console.log('[initializeAuth] Token refresh result:', success);
    return success;
  } catch (error) {
    console.error('Auth initialization failed:', error);
    return false;
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...customOptions } = options;

  const config: RequestInit = {
    ...customOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...customOptions.headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  let response = await fetch(`${API_URL}${endpoint}`, config);

  // ✅ Access Token 만료 시 자동 갱신
  if (response.status === 401 && getToken()) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // 새 토큰으로 요청 재시도
      config.headers = {
        ...config.headers,
        ...getAuthHeader(), // 새 토큰 포함
      };
      response = await fetch(`${API_URL}${endpoint}`, config);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: any) => request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

// Auth API
export const authApi = {
  getMe: () => api.get<{ user: User | null }>('/auth/me'),
  logout: () => api.post<{ success: boolean }>('/auth/logout'),
  googleLogin: () => {
    window.location.href = `${API_URL}/auth/google`;
  },
  githubLogin: () => {
    window.location.href = `${API_URL}/auth/github`;
  },
  devLogin: () => {
    window.location.href = `${API_URL}/auth/dev-login`;
  },
};

// Milestones API
export const milestonesApi = {
  getAll: () => api.get<Milestone[]>('/api/milestones'),
  create: (data: CreateMilestoneData) => api.post<Milestone>('/api/milestones', data),
  update: (id: string, data: UpdateMilestoneData) => api.patch<Milestone>(`/api/milestones/${id}`, data),
  delete: (id: string) => api.delete<{ success: boolean }>(`/api/milestones/${id}`),
  reorder: (orderedIds: string[]) => api.post<Milestone[]>('/api/milestones/reorder', { orderedIds }),
};

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string;
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
