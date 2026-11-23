import { apiRequest } from '../../common/apiClient';
import { LoginCredentials, SignupCredentials, TokenResponse, User } from './types';

interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<TokenResponse> {
    const res = await apiRequest<ApiResponseEnvelope<TokenResponse>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.data && res.data.access_token) {
      localStorage.setItem('samplemind_token', res.data.access_token);
    }
    return res.data;
  },

  async signup(credentials: SignupCredentials): Promise<TokenResponse> {
    const res = await apiRequest<ApiResponseEnvelope<TokenResponse>>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.data && res.data.access_token) {
      localStorage.setItem('samplemind_token', res.data.access_token);
    }
    return res.data;
  },

  async getCurrentUser(): Promise<User> {
    const res = await apiRequest<ApiResponseEnvelope<User>>('/auth/me');
    return res.data;
  },

  logout(): void {
    localStorage.removeItem('samplemind_token');
  },

  getToken(): string | null {
    return localStorage.getItem('samplemind_token');
  },
};
