const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  extra?: Record<string, any>;

  constructor(message: string, status: number, code: string = 'API_ERROR', extra?: Record<string, any>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('samplemind_token');
  const headers = new Headers(options.headers || {});

  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the SampleMind server.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetail = data.detail ?? data;
    const message = Array.isArray(errorDetail)
      ? errorDetail.map(issue => issue.loc?.slice(1).join('.') + ': ' + issue.msg).join(' · ')
      : typeof errorDetail === 'string' ? errorDetail : errorDetail.message || 'Request failed. Try again.';
    const code = errorDetail.code || 'HTTP_ERROR';
    throw new ApiError(message, response.status, code, errorDetail.extra);
  }

  return data as T;
}
