(() => {
  "use strict";

  if (window.__gontuV3ProductShellMounted) return;
  window.__gontuV3ProductShellMounted = true;

  const path = location.pathname.replace(/\/$/, "") || "/";
  const quantityView = new URLSearchParams(location.search).get("view");
  const quantityViews = new Set(["today", "single", "set", "type", "review"]);
  const route = (() => {
    if (path.endsWith("/verbal-reading-pilot.html")) return { area: "verbal", view: "reading" };
    if (path.endsWith("/quantity-single.html")) return { area: "quantity", view: "single" };
    if (path.endsWith("/quantity-topics.html")) return { area: "quantity", view: "type" };
    if (path.endsWith("/quantity-review.html")) return { area: "quantity", view: "review" };
    if (path.endsWith("/quantity-practice.html")) return {
      area: "quantity",
      view: quantityViews.has(quantityView) ? quantityView : "today"
    };
    if (path === "/mindmap" || path.endsWith("/mindmap.html")) return { area: "reasoning", view: "planar" };
    if (path.endsWith("/spatial-learning.html")) return { area: "reasoning", view: "spatial-home" };
    if (path.endsWith("/section-foundation.html")) return { area: "reasoning", view: "foundation" };
    if (path.endsWith("/three-view-training.html")) return { area: "reasoning", view: "three-view" };
    if (path.endsWith("/geometry.html")) return { area: "reasoning", view: "free-cut" };
    if (path.endsWith("/csg-section.html")) return { area: "reasoning", view: "csg" };
    if (path === "/shenlun" || path.endsWith("/shenlun.html")) return { area: "shenlun", view: "shenlun" };
    if (path === "/ai-coach" || path.endsWith("/ai-coach-demo.html")) return { area: "coach", view: "ai-coach" };
    return null;
  })();

  if (!route) return;

  const primary = [
    { id: "verbal", label: "言语", glyph: "言", href: "/verbal-reading-pilot.html" },
    { id: "quantity", label: "数量关系", glyph: "数", href: "/quantity-practice.html" },
    { id: "reasoning", label: "图形推理", glyph: "图", href: "/mindmap" },
    { id: "shenlun", label: "申论批改", glyph: "申", href: "/shenlun" },
    { id: "coach", label: "AI 教练", glyph: "西", href: "/ai-coach" }
  ];

  const coachModules = Object.freeze({
    verbal: "verbal.reading",
    quantity: "quantity.practice",
    reasoning: route.view === "planar" ? "reasoning.planar" : "reasoning.spatial",
    shenlun: "shenlun.review"
  });
  let shellNode = null;
  let pendingCoachContext = window.__gontuCoachContext || null;

  const subnav = {
    verbal: [
      { id: "overview", label: "言语总览", href: "/app" },
      { id: "reading", label: "片段套题", href: "/verbal-reading-pilot.html" }
    ],
    quantity: [
      { id: "today", label: "今日训练", href: "/quantity-practice.html?view=today" },
      { id: "single", label: "单题诊断", href: "/quantity-single.html" },
      { id: "set", label: "套题策略", href: "/quantity-practice.html?view=set" },
      { id: "type", label: "系统学题型", href: "/quantity-topics.html" },
      { id: "review", label: "我的复盘", href: "/quantity-review.html" }
    ],
    reasoning: [
      { id: "overview", label: "图推总览", href: "/app" },
      { id: "planar", label: "平面规律", href: "/mindmap" },
      { id: "spatial-home", label: "立体空间", href: "/spatial-learning.html" },
      { divider: true },
      { id: "foundation", label: "基础截面", href: "/section-foundation.html" },
      { id: "three-view", label: "三视图训练", href: "/three-view-training.html" },
      { id: "free-cut", label: "自由切面", href: "/geometry.html" },
      { id: "csg", label: "组合体切割", href: "/csg-section.html" }
    ],
    shenlun: [
      { id: "overview", label: "学习中心", href: "/app" },
      { id: "shenlun", label: "申论批改", href: "/shenlun" }
    ],
    coach: [
      { id: "overview", label: "学习中心", href: "/app" },
      { id: "ai-coach", label: "AI 教练", href: "/ai-coach" }
    ]
  };

  const contextLabels = Object.freeze({
    verbal: "言语训练",
    quantity: "数量训练",
    reasoning: route.view === "planar" ? "平面图推功能" : "空间训练功能",
    shenlun: "申论功能",
    coach: "教练模块"
  });

  const escapeHtml = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function renderPrimary() {
    return primary.map(item => `
      <a href="${item.href}" data-primary-id="${item.id}"${item.id === route.area ? ' aria-current="page"' : ""}>
        <span class="gontu-v3-nav-glyph" aria-hidden="true">${item.glyph}</span>
        <span>${item.label}</span>
      </a>`).join("");
  }

  function renderSubnav() {
    const items = route.area !== "reasoning"
      ? subnav[route.area]
      : route.view === "planar"
        ? subnav.reasoning.filter(item => ["overview", "planar", "spatial-home"].includes(item.id))
        : subnav.reasoning.filter(item => item.id !== "overview");
    return items.map(item => {
      if (item.divider) return '<span class="gontu-v3-context-divider" aria-hidden="true"></span>';
      return `<a href="${item.href}" data-function-id="${item.id}" aria-label="切换到${item.label}${item.id === route.view ? '，当前功能' : '，页面内容将更新'}"${item.id === route.view ? ' aria-current="page"' : ""}>${item.label}</a>`;
    }).join("");
  }

  function safeReturnUrl(value) {
    try {
      const parsed = new URL(value || location.href, location.origin);
      return parsed.origin === location.origin && parsed.pathname.startsWith("/")
        ? parsed.pathname + parsed.search + parsed.hash
        : "/app";
    } catch (_) {
      return "/app";
    }
  }

  function normalizedCoachContext(context = {}) {
    const moduleId = String(context.moduleId || coachModules[route.area] || "");
    const contextKind = String(context.contextKind || "");
    const contextId = String(context.contextId || "");
    const hasTrustedReference = ["activity", "session"].includes(contextKind)
      && /^[A-Za-z0-9:_-]{1,200}$/.test(contextId);
    return {
      moduleId,
      contextKind: hasTrustedReference ? contextKind : "",
      contextId: hasTrustedReference ? contextId : "",
      returnUrl: safeReturnUrl(context.returnUrl),
      label: hasTrustedReference ? String(context.label || "带本次训练问西西") : "问西西 · 自由提问"
    };
  }

  function coachHref(context) {
    const params = new URLSearchParams();
    if (context.moduleId) params.set("module", context.moduleId);
    params.set("return_url", context.returnUrl);
    if (context.contextKind && context.contextId) {
      params.set("context_kind", context.contextKind);
      params.set("context_id", context.contextId);
    }
    return `/ai-coach?${params}`;
  }

  function applyCoachContext(rawContext) {
    pendingCoachContext = rawContext || {};
    window.__gontuCoachContext = pendingCoachContext;
    if (!shellNode || route.area === "coach") return;
    const context = normalizedCoachContext(pendingCoachContext);
    const href = coachHref(context);
    const action = shellNode.querySelector(".gontu-v3-coach-action");
    const primaryCoach = shellNode.querySelector('[data-primary-id="coach"]');
    [action, primaryCoach].filter(Boolean).forEach(link => { link.href = href; });
    if (action) {
      action.textContent = context.label;
      action.dataset.contextState = context.contextId ? "training" : "free";
      action.setAttribute("aria-label", context.contextId
        ? `${context.label}，训练事实将在 AI 教练中由服务端核验`
        : "打开 AI 教练进行自由提问");
    }
  }

  window.GontuV3Shell = Object.freeze({ setCoachContext: applyCoachContext });
  window.addEventListener("gontu:v3-coach-context", event => applyCoachContext(event.detail));

  function mount() {
    const body = document.body;
    if (!body || document.querySelector(".gontu-v3-product-shell")) return;

    body.classList.add("gontu-v3-shell-active");
    body.dataset.gontuArea = route.area;
    body.dataset.gontuView = route.view;
    body.dataset.productShell = "gongtu-unified-v3";

    const shell = document.createElement("header");
    shellNode = shell;
    shell.className = "gontu-v3-product-shell";
    shell.dataset.menuOpen = "false";
    shell.innerHTML = `
      <div class="gontu-v3-mainbar">
        <a class="gontu-v3-brand" href="/app" aria-label="返回公途统一学习中心">
          <span class="gontu-v3-seal" aria-hidden="true">公</span>
          <span class="gontu-v3-brand-copy"><strong>公途</strong><small>统一学习页</small></span>
        </a>
        <nav class="gontu-v3-primary-nav" aria-label="公途主导航">${renderPrimary()}</nav>
        <a class="gontu-v3-home-link" href="/app"><span aria-hidden="true">←</span> 学习中心</a>
        <button class="gontu-v3-menu-toggle" type="button" aria-expanded="false" aria-label="打开学习导航">导航</button>
      </div>
      <nav class="gontu-v3-contextbar" aria-label="${escapeHtml(primary.find(item => item.id === route.area)?.label || "当前模块")}导航">
        <span class="gontu-v3-context-label">${contextLabels[route.area] || "当前功能"}</span>${renderSubnav()}
        ${route.area === "coach" ? "" : '<a class="gontu-v3-coach-action" href="/ai-coach" data-context-state="free">问西西 · 自由提问</a>'}
      </nav>`;

    body.prepend(shell);
    applyCoachContext(pendingCoachContext);

    const syncShellHeight = () => {
      const height = Math.ceil(shell.getBoundingClientRect().height);
      if (height > 0) body.style.setProperty("--gontu-v3-shell-height", `${height}px`);
    };
    syncShellHeight();
    if ("ResizeObserver" in window) {
      const shellObserver = new ResizeObserver(syncShellHeight);
      shellObserver.observe(shell);
    } else {
      window.addEventListener("resize", syncShellHeight, { passive: true });
    }

    const toggle = shell.querySelector(".gontu-v3-menu-toggle");
    toggle.addEventListener("click", () => {
      const open = shell.dataset.menuOpen !== "true";
      shell.dataset.menuOpen = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "关闭学习导航" : "打开学习导航");
      syncShellHeight();
    });

    shell.querySelectorAll(".gontu-v3-primary-nav a").forEach(link => {
      link.addEventListener("click", () => {
        shell.dataset.menuOpen = "false";
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
