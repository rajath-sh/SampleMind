export type UserRole = 'ADMIN' | 'RESEARCHER' | 'TECHNICIAN' | 'REVIEWER' | 'VIEWER';

export interface User {
  user_id: number;
  display_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  user_id: number;
  email: string;
  display_name: string;
  role: UserRole;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SignupCredentials {
  display_name: string;
  email: string;
  password: string;
}
