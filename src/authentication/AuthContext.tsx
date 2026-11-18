import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types/jam.ts';
import { apiRequest, getStoredToken, setStoredToken } from '../aws-services/apiClient.ts';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  loginAsGuest: (displayName?: string, avatarUrl?: string) => Promise<void>;
  loginWithGoogle: (params: {
    idToken?: string;
    credential?: string;
    accessToken?: string;
    email?: string;
    name?: string;
    picture?: string;
    googleId?: string;
  }) => Promise<void>;
  register: (params: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    avatarUrl?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  switchDemoUser: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  loginAsGuest: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  switchDemoUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      try {
        const pendingGoogle = localStorage.getItem('jamtogether_google_pending_login');
        if (pendingGoogle) {
          localStorage.removeItem('jamtogether_google_pending_login');
          try {
            const profile = JSON.parse(pendingGoogle);
            if (profile && profile.email) {
              const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/google', {
                method: 'POST',
                body: JSON.stringify(profile),
              });
              setStoredToken(res.token);
              setUser(res.user);
              setLoading(false);
              return;
            }
          } catch {
            // ignore
          }
        }

        const token = getStoredToken();
        if (token) {
          const res = await apiRequest<{ user: UserProfile }>('/api/auth/me');
          setUser(res.user);
        } else {
          // If no saved token, keep user null so user can choose Guest or Google login
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    initAuth();

    const handleStorage = async (e: StorageEvent) => {
      if (e.key === 'jamtogether_google_pending_login' && e.newValue) {
        try {
          const profile = JSON.parse(e.newValue);
          localStorage.removeItem('jamtogether_google_pending_login');
          if (profile && profile.email) {
            const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify(profile),
            });
            setStoredToken(res.token);
            setUser(res.user);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = async (usernameOrEmail: string, password?: string) => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const loginAsGuest = async (displayName?: string, avatarUrl?: string) => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName, avatarUrl }),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const loginWithGoogle = async (params: {
    idToken?: string;
    credential?: string;
    accessToken?: string;
    email?: string;
    name?: string;
    picture?: string;
    googleId?: string;
  }) => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const register = async (params: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    avatarUrl?: string;
  }) => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setStoredToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setUser(res.user);
  };

  const switchDemoUser = async (username: string) => {
    await login(username);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginAsGuest,
        loginWithGoogle,
        register,
        logout,
        updateProfile,
        switchDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
