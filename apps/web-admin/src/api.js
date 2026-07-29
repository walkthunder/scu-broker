const TOKEN_KEY = 'comprix_admin_token';
const USER_KEY = 'comprix_admin_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}
export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  headers['Cache-Control'] = 'no-cache';
  headers.Pragma = 'no-cache';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    cache: 'no-store',
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAuth();
  }
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || '请求失败');
  }
  return json;
}
