import { computed, ref } from 'vue';

const TOKEN_KEY = 'comprix_customer_token';
const USER_KEY = 'comprix_customer_user';

const tokenRef = ref(localStorage.getItem(TOKEN_KEY));
const userRef = ref(readUser());

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getToken() {
  return tokenRef.value || localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  return userRef.value;
}

export const currentUser = computed(() => userRef.value);
export const isLoggedIn = computed(() => !!tokenRef.value);

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  tokenRef.value = token;
  userRef.value = user;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  tokenRef.value = null;
  userRef.value = null;
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
