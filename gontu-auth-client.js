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
  // 这里只是把它从一闪而过的 toast 换成一个更郑重的弹层。
  // 样式照搬 gontu-dialog-card（app 里替换 alert/confirm 用的那套自定义弹窗）：
  // 米白卡片、20px 圆角、细金边、slideUp 进场；图标用和其他功能图标一样的
  // 细线条 SVG（无填充、rgba(176,138,58,.7) 描边），不用 emoji、不用大色块圆徽章。
  const VIP_GATE_STYLE_ID = 'gontu-vip-gate-style';
  function ensureVipGateStyle() {
    if (document.getElementById(VIP_GATE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = VIP_GATE_STYLE_ID;
    style.textContent = `
      @keyframes gontuVipFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes gontuVipSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      .gontu-vip-gate-overlay {
        position: fixed; inset: 0; z-index: 100000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(26,21,16,0.4); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
        animation: gontuVipFadeIn 0.25s ease;
      }
      .gontu-vip-gate-card {
        width: min(400px, 88vw); background: #fefdf9; border: 1px solid rgba(201,169,110,0.3);
        border-radius: 20px; padding: 30px 32px 26px; text-align: center;
        box-shadow: 0 16px 48px rgba(0,0,0,0.15);
        animation: gontuVipSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);
        font-family: "Noto Serif SC", "Source Han Serif SC", serif;
      }
      .gontu-vip-gate-title { font-size: 1.05rem; font-weight: 700; color: #1e293b; letter-spacing: 1px; margin: 14px 0 8px; }
      .gontu-vip-gate-msg { font-size: 0.9rem; color: #334155; line-height: 1.8; margin-bottom: 22px; }
      .gontu-vip-gate-btn {
        min-width: 120px; padding: 10px 24px; border: none; border-radius: 50px; cursor: pointer;
        background: linear-gradient(135deg,#c9a96e,#e8d5a3); color: #1a1510; font-weight: 600;
        font-size: 0.9rem; font-family: inherit; transition: transform 0.2s;
      }
      .gontu-vip-gate-btn:hover { transform: translateY(-1px); }
    `;
    document.head.appendChild(style);
  }
  const VIP_GATE_ICON = `
    <svg width="30" height="30" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 13.5l-1-7 3.6 2.6L9 4l3.9 5.1 3.6-2.6-1 7z" stroke="rgba(176,138,58,0.75)" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="2.5" y1="15.5" x2="15.5" y2="15.5" stroke="rgba(176,138,58,0.5)" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`;

  // ── 会员身份徽章 ────────────────────────────────────────────────
  // 挂在导航栏用户名旁边：VIP 显示皇冠 + 积分 + 到期日，普通用户显示一个
  // 中性的"普通用户"徽章。用同一套金/墨配色和细线条图标，不用色块emoji。
  const STATUS_BADGE_STYLE_ID = 'gontu-status-badge-style';
  function ensureStatusBadgeStyle() {
    if (document.getElementById(STATUS_BADGE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STATUS_BADGE_STYLE_ID;
    style.textContent = `
      .gontu-status-badge {
        position: relative;
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 9px 2px 7px; border-radius: 999px;
        font-family: "Noto Serif SC", "Source Han Serif SC", serif;
        font-size: 0.7rem; font-weight: 700; letter-spacing: 0.4px;
        white-space: nowrap; vertical-align: middle; cursor: default;
      }
      .gontu-status-badge.is-vip {
        color: #4a3414; background: linear-gradient(135deg,#e8d5a3,#c9a96e);
        box-shadow: 0 2px 8px rgba(176,138,58,0.3);
      }
      .gontu-status-badge.is-user {
        color: rgba(232,213,163,0.75); background: rgba(232,213,163,0.12);
        border: 1px solid rgba(232,213,163,0.3);
      }
      .gontu-status-badge svg { display: block; flex: none; }
      .gontu-status-tip {
        position: absolute; top: calc(100% + 9px); left: 50%;
        background: #2a2015; color: #f3e6c8;
        padding: 7px 12px; border-radius: 9px;
        font-family: "Noto Serif SC", "Source Han Serif SC", serif;
        font-size: 0.68rem; font-weight: 500; letter-spacing: 0.2px;
        white-space: nowrap; box-shadow: 0 10px 24px rgba(0,0,0,0.28);
        opacity: 0; visibility: hidden; pointer-events: none;
        transform: translate(-50%, -4px); transition: opacity .15s ease, transform .15s ease;
        z-index: 10;
      }
      .gontu-status-tip::before {
        content: ''; position: absolute; bottom: 100%; left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent; border-bottom-color: #2a2015;
      }
      .gontu-status-badge:hover .gontu-status-tip,
      .gontu-status-badge:focus-visible .gontu-status-tip {
        opacity: 1; visibility: visible; transform: translate(-50%, 0);
      }
    `;
    document.head.appendChild(style);
  }
  const STATUS_BADGE_CROWN_ICON =
    '<svg width="12" height="12" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2.5 13.5l-1-7 3.6 2.6L9 4l3.9 5.1 3.6-2.6-1 7z" stroke="#4a3414" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<line x1="2.5" y1="15.5" x2="15.5" y2="15.5" stroke="#4a3414" stroke-width="1.3" stroke-linecap="round"/></svg>';
  function statusBadgeHTML(data) {
    if (!data) return '';
    if (data.is_vip) {
      const credits = data.ai_credits ?? 0;
      const expiry = data.vip_expires_at ? `${data.vip_expires_at} 到期` : '长期有效';
      return `<span class="gontu-status-badge is-vip" tabindex="0">${STATUS_BADGE_CROWN_ICON}VIP<span class="gontu-status-tip">${credits} 积分 · ${expiry}</span></span>`;
    }
    return '<span class="gontu-status-badge is-user">普通用户</span>';
  }
  async function mountStatusBadge(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    ensureStatusBadgeStyle();
    const data = await me();
    if (!data) { el.innerHTML = ''; return; }
    el.innerHTML = statusBadgeHTML(data);
  }

  let vipModalEl = null;
  function showVipGate(message) {
    if (vipModalEl) { vipModalEl.querySelector('[data-vip-msg]').textContent = message; return; }
    ensureVipGateStyle();
    const overlay = document.createElement('div');
    overlay.className = 'gontu-vip-gate-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="gontu-vip-gate-card">
        ${VIP_GATE_ICON}
        <div class="gontu-vip-gate-title">该功能仅限 VIP 使用</div>
        <div class="gontu-vip-gate-msg" data-vip-msg></div>
        <button type="button" class="gontu-vip-gate-btn" data-vip-dismiss>我知道了</button>
      </div>`;
    overlay.querySelector('[data-vip-msg]').textContent = message;
    overlay.querySelector('[data-vip-dismiss]').addEventListener('click', hideVipGate);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideVipGate(); });
    document.body.appendChild(overlay);
    vipModalEl = overlay;
  }
  function hideVipGate() {
    if (vipModalEl) { vipModalEl.remove(); vipModalEl = null; }
  }

  // ── 整页 VIP 门禁 ─────────────────────────────────────────────────
  // 用于本身不调用任何后端接口的纯前端页面（比如三维空间几何的几个
  // Three.js 训练页）——它们没有数据请求可以拦截，所以之前完全没有
  // 任何VIP校验，谁都能直接打开用。做法：先盖一层不透明遮罩挡住整页
  // （不管下面的 Three.js 场景有没有已经开始跑），再异步查一次权限；
  // 通过就掀开遮罩，不通过就把遮罩换成"仅限VIP"的说明，永远不掀开。
  function guardVipPage(checkPath, redirectTo) {
    // 拦截失败后"返回"按钮的去处：默认回立体图推学习中心；但如果这个
    // 门禁就架在学习中心页面自己身上（该模块整体仅 VIP），再指回自己
    // 等于原地不动，这里退回主学习页 /app。
    const target = redirectTo || (location.pathname === '/spatial-learning.html' ? '/app' : '/spatial-learning.html');
    ensureVipGateStyle();
    const style = document.createElement('style');
    style.textContent = `
      .gontu-vip-block-overlay {
        position: fixed; inset: 0; z-index: 100001; background: #fdfbf5;
        display: flex; align-items: center; justify-content: center;
      }
    `;
    document.head.appendChild(style);
    const blocker = document.createElement('div');
    blocker.className = 'gontu-vip-block-overlay';
    document.documentElement.appendChild(blocker);

    request(checkPath || '/api/spatial-learning/overview', { silent: true }).then((response) => {
      if (response.ok) { blocker.remove(); return; }
      return (response.status === 402 || response.status === 403
        ? response.json().catch(() => ({}))
        : Promise.resolve({})
      ).then((body) => {
        const detail = (body && (typeof body.detail === 'string' ? body.detail : body.detail?.message))
          || '该功能仅限 VIP 用户使用，请联系管理员开通';
        ensureVipGateStyle();
        blocker.innerHTML = `
          <div class="gontu-vip-gate-card">
            ${VIP_GATE_ICON}
            <div class="gontu-vip-gate-title">该功能仅限 VIP 使用</div>
            <div class="gontu-vip-gate-msg"></div>
            <button type="button" class="gontu-vip-gate-btn">返回学习页</button>
          </div>`;
        blocker.querySelector('.gontu-vip-gate-msg').textContent = detail;
        blocker.querySelector('.gontu-vip-gate-btn').addEventListener('click', () => {
          location.href = target;
        });
      });
    }).catch(() => { blocker.remove(); });
  }

  async function request(path, options) {
    const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
    const value = token();
    const headers = Object.assign({}, options?.headers || {});
    if (value) headers.Authorization = `Bearer ${value}`;
    const response = await fetch(url, Object.assign({}, options || {}, { headers }));
    if (response.status === 401) clearIdentity('unauthorized');
    if (!options?.silent && (response.status === 402 || response.status === 403)) {
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
    hideVipGate,
    guardVipPage,
    statusBadgeHTML,
    mountStatusBadge
  });
})(window);
