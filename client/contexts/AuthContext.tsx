import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User, initializeAuth } from '../api/client';
import { saveToken, getToken, saveRefreshTokenBackup, clearAllTokens } from '../utils/tokenStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (provider: 'google' | 'github') => void;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const { user } = await authApi.getMe();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        // Check for token in URL query parameters (from OAuth callback)
        const params = new URLSearchParams(window.location.search);
        const tokenFromURL = params.get('token');

        if (tokenFromURL) {
          // Save token to memory + sessionStorage (XSS 보안)
          saveToken(tokenFromURL);
          // Refresh Token 백업 표시 (실제 Refresh Token은 쿠키에 안전하게 저장됨)
          saveRefreshTokenBackup();
          // URL에서 토큰 제거 (히스토리 보안)
          window.history.replaceState({}, document.title, window.location.pathname);
          await fetchUser();
        } else if (getToken()) {
          // 메모리에 토큰이 있으면 유저 정보 로드
          await fetchUser();
        } else {
          // 메모리 없음 → Refresh Token으로 복구 시도 (PWA 재시작 후)
          const success = await initializeAuth();
          if (success) {
            await fetchUser();
          } else {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('App initialization error:', error);
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const login = (provider: 'google' | 'github') => {
    if (provider === 'google') {
      authApi.googleLogin();
    } else {
      authApi.githubLogin();
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // 메모리 + sessionStorage + localStorage 모두 정리
      clearAllTokens();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
