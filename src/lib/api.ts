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
