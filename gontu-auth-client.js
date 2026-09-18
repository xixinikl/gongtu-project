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

  // ── VIP 专属功能提示 ──────────────────────────────────────────────
  // 后端对未开通 VIP（403）或积分用完（402）返回的都是一句人话，
  // 这里只是把它从一闪而过的 toast 换成一个更郑重、带品牌样式的弹层。
  let vipModalEl = null;
  function showVipGate(message) {
    if (vipModalEl) { vipModalEl.querySelector('[data-vip-msg]').textContent = message; return; }
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(21,29,40,0.55);backdrop-filter:blur(2px);font-family:"Source Han Serif SC","Noto Serif SC",serif;';
    overlay.innerHTML = `
      <div style="width:min(380px,88vw);background:#fffef9;border:1px solid rgba(201,169,110,0.4);border-radius:16px;padding:32px 28px 24px;box-shadow:0 24px 60px rgba(0,0,0,0.25);text-align:center;">
        <div style="width:52px;height:52px;margin:0 auto 16px;border-radius:50%;background:linear-gradient(135deg,#e8d5a3,#c9a96e);display:flex;align-items:center;justify-content:center;font-size:24px;">👑</div>
        <div style="font-size:1.05rem;font-weight:600;color:#151d28;margin-bottom:8px;">该功能仅限 VIP 使用</div>
        <div data-vip-msg style="font-size:0.9rem;color:#4b5563;line-height:1.6;margin-bottom:22px;">${message}</div>
        <button data-vip-dismiss style="min-width:120px;padding:10px 24px;border:none;border-radius:999px;background:#151d28;color:#e8d5a3;font-size:0.9rem;font-family:inherit;cursor:pointer;">我知道了</button>
      </div>`;
    overlay.querySelector('[data-vip-dismiss]').addEventListener('click', hideVipGate);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideVipGate(); });
    document.body.appendChild(overlay);
    vipModalEl = overlay;
  }
  function hideVipGate() {
    if (vipModalEl) { vipModalEl.remove(); vipModalEl = null; }
  }

  async function request(path, options) {
    const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
    const value = token();
    const headers = Object.assign({}, options?.headers || {});
    if (value) headers.Authorization = `Bearer ${value}`;
    const response = await fetch(url, Object.assign({}, options || {}, { headers }));
    if (response.status === 401) clearIdentity('unauthorized');
    if (response.status === 402 || response.status === 403) {
      response.clone().json().then((body) => {
        const detail = body && (typeof body.detail === 'string' ? body.detail : body.detail?.message);
        if (detail) showVipGate(detail);
      }).catch(() => {});
    }
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
    me,
    showVipGate,
    hideVipGate
  });
})(window);
