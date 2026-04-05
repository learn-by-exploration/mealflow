// ─── MealFlow API Client ───
// Centralized fetch wrapper with CSRF, auth redirect, and error handling.

let _onError = (msg) => console.warn(msg);

export function setApiErrorHandler(fn) { _onError = fn; }

function getCsrf() {
  const m = document.cookie.match(/csrf_token=([a-f0-9]{64})/);
  return m ? m[1] : '';
}

async function _fetch(method, url, data) {
  try {
    const opts = { method };
    if (data !== undefined) {
      opts.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() };
      opts.body = JSON.stringify(data);
    } else if (method !== 'GET') {
      opts.headers = { 'X-CSRF-Token': getCsrf() };
    }
    const r = await fetch(url, opts);
    if (r.status === 401) { window.location.href = '/login'; return {}; }
    if (!r.ok) { return await r.json().catch(() => ({})); }
    return await r.json();
  } catch (e) {
    _onError('Network error — please try again');
    throw e;
  }
}

export const api = {
  get: (u) => _fetch('GET', u),
  post: (u, d) => _fetch('POST', u, d),
  put: (u, d) => _fetch('PUT', u, d),
  del: (u) => _fetch('DELETE', u),
  patch: (u, d) => _fetch('PATCH', u, d),
};
