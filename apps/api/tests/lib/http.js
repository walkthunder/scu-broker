/**
 * HTTP client for functional tests against local API.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';

export async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export { BASE };
