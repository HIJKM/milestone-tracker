import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User } from '../api/client';
import { saveToken, getToken, removeToken } from '../utils/tokenStorage';

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
    // Check for token in URL query parameters (from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('token');

    if (tokenFromURL) {
      // Save token to memory + sessionStorage (XSS 보안)
      saveToken(tokenFromURL);
      // URL에서 토큰 제거 (히스토리 보안)
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Fetch user if token exists
    if (getToken()) {
      fetchUser();
    } else {
      setLoading(false);
    }
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
      removeToken();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      // Still remove token even if logout call fails
      removeToken();
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
