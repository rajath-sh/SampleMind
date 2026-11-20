import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, LoginCredentials } from './types';
import { authService } from './authService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  switchDemoRole: (roleEmail: string, rolePassword?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const storedToken = authService.getToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await authService.getCurrentUser();
        setUser(profile);
      } catch (err: any) {
        console.warn('Session expired or invalid token:', err);
        authService.logout();
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.login(credentials);
      setToken(res.access_token);
      const profile = await authService.getCurrentUser();
      setUser(profile);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setToken(null);
    setUser(null);
    setError(null);
  };

  const switchDemoRole = async (roleEmail: string, rolePassword = 'password123') => {
    setError(null);
    const previousToken = authService.getToken();
    try {
      const result = await authService.login({ username: roleEmail, password: rolePassword });
      const profile = await authService.getCurrentUser();
      setToken(result.access_token);
      setUser(profile);
    } catch (error) {
      if (previousToken) localStorage.setItem('samplemind_token', previousToken);
      else authService.logout();
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        switchDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
