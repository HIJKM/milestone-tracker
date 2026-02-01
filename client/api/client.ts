
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  body?: any;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Token refresh failed with status ${response.status}`);
      return null;
    }

    return 'ok';
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...customOptions } = options;

  const config: RequestInit = {
    ...customOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...customOptions.headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  let response = await fetch(`${API_URL}${endpoint}`, config);

  if (response.status === 401) {
    await refreshAccessToken();
    response = await fetch(`${API_URL}${endpoint}`, config);
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

export const milestonesApi = {
  getAll: () => api.get<Milestone[]>('/api/milestones'),

  create: (data: CreateMilestoneData) => api.post<Milestone>('/api/milestones', data),

  update: (id: string, data: UpdateMilestoneData) => api.patch<Milestone>(`/api/milestones/${id}`, data),

  delete: (id: string) => api.delete<{ success: boolean }>(`/api/milestones/${id}`),

  reorder: (orderedIds: string[]) => api.post<Milestone[]>('/api/milestones/reorder', { orderedIds }),
};

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
