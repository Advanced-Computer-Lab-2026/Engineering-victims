/**
 * Single source of truth for backend URLs.
 *
 * In development the app calls relative "/api/..." URLs, which Vite proxies to
 * the backend (see VITE_API_PROXY_TARGET in vite.config.ts). This keeps the
 * browser on one origin, so there is no CORS setup to maintain.
 *
 * For a production build set VITE_API_URL to the absolute backend URL
 * (e.g. https://api.example.com) in the environment used for `npm run build`.
 */
const configuredUrl = (import.meta.env.VITE_API_URL ?? '').trim();

export const API_BASE_URL = configuredUrl.replace(/\/+$/, '');

/** Builds a full API URL for a path such as "/api/auth/login". */
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

/** Reads the JWT stored by the login page and builds auth headers for it. */
export const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Small fetch wrapper that always resolves or throws an ApiError with the
 * server's own message, so components never inspect response shapes.
 */
export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // A dead or unreachable backend is the most common failure by far, so it
    // gets a message that says what to do rather than "Failed to fetch".
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The server returned an unexpected response.', response.status);
  }

  const data = payload as { message?: string };
  if (!response.ok) {
    throw new ApiError(data.message || `Request failed with status ${response.status}`, response.status);
  }

  return payload as T;
};
