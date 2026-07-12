(function (global) {
  if (global.GontuAuth) return;

  const TOKEN_KEY = 'gontu_token';
  const USER_KEY = 'gontu_user';
  const API_BASE = global.__GONTU_API_BASE__ ||
    (location.port === '8089' ? 'http://127.0.0.1:8888' : location.origin);

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function user() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setSession(payload) {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(USER_KEY, JSON.stringify({
      id: payload.user_id,
      username: payload.username,
      is_admin: payload.is_admin || 0
    }));
  }

  function clearIdentity(reason) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    localStorage.removeItem('is_admin');
    global.dispatchEvent(new CustomEvent('gontu:auth-required', {
      detail: { reason: reason || 'unauthorized' }
    }));
  }

  function loginUrl(nextPath) {
    const next = nextPath || `${location.pathname}${location.search}${location.hash}`;
    return `/login.html?next=${encodeURIComponent(next)}`;
  }

  async function request(path, options) {
    const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
    const value = token();
    const headers = Object.assign({}, options?.headers || {});
    if (value) headers.Authorization = `Bearer ${value}`;
    const response = await fetch(url, Object.assign({}, options || {}, { headers }));
    if (response.status === 401) clearIdentity('unauthorized');
    return response;
  }

  async function me() {
    if (!token()) return null;
    const response = await request('/api/auth/me');
    if (!response.ok) return null;
    const current = await response.json();
    localStorage.setItem(USER_KEY, JSON.stringify({
      id: current.user_id,
      username: current.username,
      is_admin: current.is_admin || 0
    }));
    return current;
  }

  global.GontuAuth = Object.freeze({
    API_BASE,
    TOKEN_KEY,
    USER_KEY,
    token,
    user,
    setSession,
    clearIdentity,
    loginUrl,
    request,
    me
  });
})(window);
