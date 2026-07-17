(function () {
  'use strict';
  if (window.__gontuUnifiedInlineV4) return;
  window.__gontuUnifiedInlineV4 = true;

  var API_BASE = window.__GONTU_API_BASE__ || (location.port === '8089' ? 'http://127.0.0.1:8888' : location.origin);
  var zone;
  var subnav;
  var right;
  var activeSurface = '';
  var navigationVersion = 0;
  var legacyRenderPermit = 0;
  var verbalNavHtml = '';
  var quantityNavHtml = '';
  var states = {
    logic: { questions: [], index: 0, started: 0, selected: '', result: null },
    reading: { sets: [], questions: [], session: null, index: 0, started: 0 },
    single: { session: null, started: 0, history: [], index: -1 },
    set: { sets: [], questions: [], session: null, index: 0, started: 0 },
    coach: new Map(),
  };

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function token() {
    return localStorage.getItem('gontu_token') || '';
  }

  async function api(path, options) {
    options = options || {};
    if (!token()) {
      throw new Error('请先登录后使用真实题库');
    }
    var headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token() });
    if (options.body) headers['Content-Type'] = 'application/json';
    var response = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
    var payload = await response.json().catch(function () { return {}; });
    if (response.status === 401) {
      localStorage.removeItem('gontu_token');
      throw new Error('登录状态已失效，请重新登录');
    }
    if (!response.ok) {
      var detail = typeof payload.detail === 'string' ? payload.detail : (payload.error || '请求暂未完成');
      var error = new Error(detail);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function style() {
    var node = document.createElement('style');
    node.textContent = [
      'body.gontu-inline-v4 .verbal-demo-note{display:none!important}',
      'body.gontu-inline-v4 .verbal-demo-subnav{margin-bottom:16px!important}',
      'body.gontu-inline-v4 .study-card-container{padding:20px!important}',
      'body.gontu-inline-v4 .study-card-container>.card-header{display:none!important}',
      'body.gontu-inline-v4{--inline-v4-workspace-h:clamp(520px,calc(100dvh - 305px),720px)}',
      '.inline-v4-card{height:var(--inline-v4-workspace-h)!important;min-height:0!important;padding:25px 28px!important;text-align:left!important;cursor:default!important;transform:none!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}',
      '.inline-v4-card:hover{transform:none!important;border-color:var(--border-light)!important;box-shadow:var(--shadow-sm),inset 0 0 80px 20px rgba(139,109,56,.04)!important}',
      '.inline-v4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:13px}',
      '.inline-v4-kicker{color:var(--gold-dark);font-size:.76rem;letter-spacing:.11em}',
      '.inline-v4-title{margin:4px 0 0;color:var(--ink-deep);font:600 1.42rem/1.35 "Noto Serif SC","STKaiti",serif;letter-spacing:.04em}',
      '.inline-v4-meta{flex:none;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:var(--gold-bg);color:var(--ink-light);font-size:.72rem}',
      '.inline-v4-body{flex:1;min-height:0;overflow:auto;padding:1px 5px 2px 0;scrollbar-width:thin;overscroll-behavior:contain}',
      '.inline-v4-stem{margin:0 0 14px;color:var(--ink-deep);font-family:"Noto Serif SC","STKaiti",serif;font-size:1.02rem;line-height:1.75}',
      '.inline-v4-prompt{margin:0 0 10px;color:var(--ink-body);font-size:.86rem;font-weight:700}',
      '.inline-v4-options{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
      '.inline-v4-option{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;gap:9px;min-height:50px;padding:10px 12px;border:1px solid var(--border-light);border-radius:9px;background:#fffef9;color:var(--ink-body);font:inherit;font-size:.85rem;text-align:left;cursor:pointer}',
      '.inline-v4-option:hover,.inline-v4-option.selected{border-color:var(--gold);background:var(--gold-bg)}',
      '.inline-v4-option.correct{border-color:#7da88d;background:#edf7f0}.inline-v4-option.wrong{border-color:#cc8d7d;background:#fff0ed}',
      '.inline-v4-option b{width:22px;height:22px;display:grid;place-items:center;border:1px solid var(--border);border-radius:50%;color:var(--gold-dark);font-size:.65rem}',
      '.inline-v4-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:auto;padding-top:15px;border-top:1px solid rgba(176,138,58,.14)}',
      '.inline-v4-note{margin:0;color:var(--ink-light);font-size:.75rem;line-height:1.5}',
      '.inline-v4-actions{display:flex;gap:7px}.inline-v4-btn{padding:7px 13px;border:1px solid var(--border);border-radius:999px;background:#fffef9;color:var(--ink-body);font:inherit;font-size:.7rem;cursor:pointer;text-decoration:none}',
      '.inline-v4-btn.primary{border-color:var(--gold-dark);background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:#fffef9}',
      '.inline-v4-btn:disabled{opacity:.46;cursor:not-allowed}',
      '.inline-v4-coach-note{display:flex;align-items:center;gap:8px;margin:12px 0;color:var(--ink-light);font-size:.75rem}.inline-v4-coach-note .inline-v4-coach-seal{flex:none}',
      '.inline-v4-coach-seal{width:27px;height:27px;display:grid;place-items:center;border-radius:7px;background:var(--gold-dark);color:#fffef9;font-family:"ZCOOL XiaoWei","STKaiti",serif;font-size:.72rem}',
      '.inline-v4-coach-card{height:var(--inline-v4-workspace-h);display:flex;flex-direction:column;min-height:0}',
      '.inline-v4-coach-card header{display:flex;align-items:center;gap:9px;padding-bottom:12px;border-bottom:1px solid rgba(176,138,58,.15)}',
      '.inline-v4-coach-card header h3{margin:0!important}.inline-v4-coach-card header small{display:block;color:var(--ink-light);font-size:.67rem;margin-top:2px}',
      '.inline-v4-coach-history{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:9px;padding:13px 2px;scrollbar-width:thin}',
      '.inline-v4-message{max-width:91%;padding:9px 11px;border-radius:10px;color:var(--ink-body);font-size:.76rem;line-height:1.58;white-space:pre-wrap}',
      '.inline-v4-message.user{align-self:flex-end;background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:#fffef9;border-bottom-right-radius:3px}',
      '.inline-v4-message.assistant{align-self:flex-start;background:#faf6ec;border:1px solid var(--border-light);border-bottom-left-radius:3px}',
      '.inline-v4-coach-empty{margin:auto;text-align:center;color:var(--ink-light);font-size:.74rem;line-height:1.6}',
      '.inline-v4-coach-compose{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding-top:11px;border-top:1px solid rgba(176,138,58,.15)}',
      '.inline-v4-coach-compose textarea{min-width:0;resize:none;min-height:60px;max-height:96px;padding:9px 10px;border:1px solid var(--border-light);border-radius:9px;background:#fffef9;color:var(--ink-body);font:inherit;font-size:.74rem;outline:0}',
      '.inline-v4-coach-compose button{align-self:end;padding:8px 12px;border:1px solid var(--gold-dark);border-radius:9px;background:var(--gold-dark);color:#fffef9;font:inherit;font-size:.72rem;cursor:pointer}',
      '.inline-v4-study-card{height:var(--inline-v4-workspace-h);display:flex;flex-direction:column;min-height:0;transition:height .18s ease,padding .18s ease}',
      '.inline-v4-study-card>header{display:flex;align-items:center;gap:9px;padding-bottom:10px;border-bottom:1px solid rgba(176,138,58,.15)}',
      '.inline-v4-study-card>header>div{min-width:0;flex:1}.inline-v4-study-card>header h3{margin:0!important}.inline-v4-study-card>header small{display:block;color:var(--ink-light);font-size:.65rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.inline-v4-study-toggle{flex:none;width:30px;height:30px;border:1px solid var(--border);border-radius:50%;background:#fffef9;color:var(--gold-dark);font:700 .72rem/1 serif;cursor:pointer}',
      '.inline-v4-study-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:11px 0 9px;padding:4px;border:1px solid var(--border-light);border-radius:11px;background:rgba(247,240,222,.78)}',
      '.inline-v4-study-tab{padding:7px 8px;border:0;border-radius:8px;background:transparent;color:var(--ink-light);font:inherit;font-size:.69rem;cursor:pointer}.inline-v4-study-tab.active{background:#fffef9;color:var(--gold-dark);box-shadow:0 2px 9px rgba(91,70,32,.10);font-weight:700}',
      '.inline-v4-study-pane{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}.inline-v4-study-pane[hidden]{display:none!important}',
      '.inline-v4-formula-band{margin:2px 0 9px;padding:12px 13px;border:1px solid rgba(176,138,58,.28);border-left:3px solid var(--gold);border-radius:9px;background:linear-gradient(145deg,#fffdf7,#f8f0dc);color:var(--ink-deep);font:600 .86rem/1.72 "Noto Serif SC","STKaiti",serif}',
      '.inline-v4-formula-band small{display:block;margin-bottom:3px;color:var(--gold-dark);font:600 .68rem/1.4 inherit;letter-spacing:.08em}',
      '.inline-v4-study-card.is-collapsed{height:58px!important;padding:9px!important;overflow:hidden}.inline-v4-study-card.is-collapsed>header{height:40px;padding:0;border:0}.inline-v4-study-card.is-collapsed .inline-v4-study-tabs,.inline-v4-study-card.is-collapsed .inline-v4-study-pane{display:none!important}.inline-v4-study-card.is-collapsed>header small{display:none}.inline-v4-study-card.is-collapsed .inline-v4-coach-seal{border-radius:50%}',
      '.inline-v4-topic-tools{display:flex;align-items:center;gap:6px;margin:0 0 10px;padding:5px;border:1px solid var(--border-light);border-radius:11px;background:rgba(247,240,222,.68)}.inline-v4-topic-tools button{padding:7px 12px;border:0;border-radius:8px;background:transparent;color:var(--ink-light);font:inherit;font-size:.69rem;cursor:pointer}.inline-v4-topic-tools button.active{background:#fffef9;color:var(--gold-dark);box-shadow:0 2px 8px rgba(91,70,32,.09);font-weight:700}.inline-v4-topic-tools span{margin-left:auto;padding-right:7px;color:var(--ink-light);font-size:.64rem}',
      '.inline-v4-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
      '.inline-v4-panel{padding:17px 18px;border:1px solid var(--border-light);border-radius:9px;background:#fffef9}',
      '.inline-v4-panel small{color:var(--gold-dark);font-size:.7rem}.inline-v4-panel h3{margin:6px 0;color:var(--ink-deep);font-size:1rem}.inline-v4-panel p{margin:0;color:var(--ink-light);font-size:.78rem;line-height:1.65}',
      '.inline-v4-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 0;border-top:1px solid rgba(176,138,58,.13)}',
      '.inline-v4-row:first-child{border-top:0}.inline-v4-row b{color:var(--gold-dark);font-size:.66rem}.inline-v4-row span{color:var(--ink-body);font-size:.74rem}.inline-v4-row small{color:var(--ink-light);font-size:.64rem}',
      '.inline-v4-topic-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.inline-v4-topic-card{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"rank title" "rank meta";gap:2px 10px;align-items:center;min-height:65px;padding:11px 13px;border:1px solid var(--border-light);border-radius:10px;background:#fffef9;text-align:left;cursor:pointer}.inline-v4-topic-card:hover{border-color:var(--gold);background:var(--gold-bg)}.inline-v4-topic-rank{grid-area:rank;width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:var(--gold-bg);color:var(--gold-dark);font-size:.68rem}.inline-v4-topic-card strong{grid-area:title;color:var(--ink-deep);font-size:.78rem}.inline-v4-topic-card small{grid-area:meta;color:var(--ink-light);font-size:.63rem}',
      '.inline-v4-topic-card.is-active{border-color:var(--gold-dark);background:linear-gradient(145deg,#fffdf7,#f7efd9);box-shadow:inset 3px 0 0 var(--gold)}',
      '.inline-v4-method-steps{counter-reset:method-step;display:grid;gap:0;margin-top:12px}.inline-v4-method-step{counter-increment:method-step;display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:12px 0;border-top:1px solid rgba(176,138,58,.14)}.inline-v4-method-step:before{content:counter(method-step,decimal-leading-zero);width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:var(--gold-bg);color:var(--gold-dark);font-size:.66rem}.inline-v4-method-step b{display:block;margin-bottom:3px;color:var(--ink-deep);font-size:.8rem}.inline-v4-method-step span{display:block;color:var(--ink-light);font-size:.75rem;line-height:1.65}.inline-v4-method-action{width:100%;margin-top:12px;padding:10px 12px;border:1px solid var(--gold-dark);border-radius:9px;background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:#fffef9;font:inherit;font-size:.74rem;cursor:pointer}',
      '.inline-v4-review-stack{display:flex;min-height:100%;flex-direction:column}.inline-v4-review-list{margin-top:10px;display:grid;gap:3px}.inline-v4-review-stack>.inline-v4-foot{margin-top:auto}',
      '.inline-v4-error{padding:22px;border:1px solid #d8a190;border-radius:10px;background:#fff3ef;color:#8c4938;font-size:.76rem}',
      '.inline-v4-loading{padding:38px;text-align:center;color:var(--ink-light);font-size:.76rem}',
      '.inline-v4-result{margin-top:10px;padding:10px 12px;border-left:3px solid var(--gold);background:#faf5e9;color:var(--ink-body);font-size:.72rem;line-height:1.55}',
      '.inline-v4-progress{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.inline-v4-progress button{min-height:30px;border:1px solid var(--border-light);border-radius:7px;background:#fffef9;color:var(--ink-light);font-size:.66rem}.inline-v4-progress button.current{border-color:var(--gold-dark);background:var(--gold-bg);color:var(--gold-dark)}',
      '.inline-v4-side{display:grid;gap:12px}.inline-v4-side-card{padding:17px;border:1px solid var(--border-light);border-radius:12px;background:#fffef9;box-shadow:var(--shadow-sm)}',
      '.inline-v4-side-card h3{margin:0 0 6px;color:var(--ink-deep);font:600 .92rem/1.4 "Noto Serif SC",serif}.inline-v4-side-card p{margin:0;color:var(--ink-light);font-size:.7rem;line-height:1.6}',
      '.inline-v4-side-list{display:grid;gap:8px;margin-top:12px}.inline-v4-side-list div{display:grid;grid-template-columns:auto 1fr;gap:8px;padding-top:8px;border-top:1px solid rgba(176,138,58,.12)}.inline-v4-side-list b{color:var(--gold-dark);font-size:.64rem}.inline-v4-side-list span{color:var(--ink-body);font-size:.69rem}',
      '.inline-v4-terms{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:12px 0 2px;color:var(--ink-light);font-size:.74rem}.inline-v4-terms .verbal-term-btn{margin:0!important;padding:5px 10px!important;background:#fffef9!important}',
      'body.gontu-inline-v4 #verbalTermTooltip{background:#fffdf8!important;opacity:1!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] .study-card-container{padding-top:16px!important;padding-bottom:16px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone{height:var(--inline-v4-workspace-h)!important;min-height:0!important;display:grid!important;grid-template-rows:minmax(0,1fr) auto!important;gap:14px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card{height:auto!important;min-height:0!important;overflow:auto!important;padding:30px 34px 26px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:stretch!important;transform:none!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card:hover{transform:none!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card .idiom-word{font-size:2.9rem!important;margin:10px 0!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card .meaning-text{min-height:56px!important;max-height:calc(var(--inline-v4-workspace-h) - 235px)!important;overflow:auto!important;line-height:1.65!important;padding:0 10px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card .flip-hint{margin-top:9px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card [style*="margin-top:20px"]{margin-top:10px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.big-card #favoriteBtn{margin-top:8px!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] .vocab-card-tools{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px 18px;margin-top:8px}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] .vocab-card-tools>*{margin-top:0!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] .vocab-card-tools #favoriteBtn{display:inline-grid!important;place-items:center!important}',
      'body.gontu-inline-v4[data-inline-surface="vocab"] #learningZone>.action-buttons{margin:0!important;gap:12px!important;flex:none!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container{display:grid!important;grid-template-columns:minmax(0,1fr) 108px!important;gap:14px!important;align-items:start!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="recite"] .study-card-container,body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="difficult"] .study-card-container{min-height:calc(100vh - 230px)!important;align-items:stretch!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="recite"] #learningZone,body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="difficult"] #learningZone{display:flex!important;min-height:0!important;flex-direction:column!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="recite"] #learningZone>.big-card,body.gontu-inline-v4[data-inline-surface="quantityLegacy"][data-quantity-legacy-mode="difficult"] #learningZone>.big-card{flex:1 1 auto!important;display:flex!important;min-height:0!important;flex-direction:column!important;justify-content:center!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container>.card-header{display:none!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container>.card-header #queueBadge{display:none!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .app-grid{grid-template-columns:minmax(0,1fr)!important}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .context-right-v2{display:none!important}',
      'body.gontu-inline-v4 .quantity-legacy-subtabs{display:none;gap:5px;padding:6px;border:1px solid rgba(176,138,58,.24);border-radius:12px;background:rgba(255,253,247,.82);box-shadow:0 4px 14px rgba(91,70,32,.07)}',
      'body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container>.quantity-legacy-subtabs{display:flex;flex-direction:column;position:sticky;top:14px;align-self:start;height:max-content}',
      'body.gontu-inline-v4 .quantity-legacy-subtab{min-height:40px;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--ink-light);font:600 .68rem/1.3 "Noto Sans SC",sans-serif;white-space:nowrap;cursor:pointer;text-align:center}',
      'body.gontu-inline-v4 .quantity-legacy-subtab:hover{color:var(--gold-dark);background:rgba(176,138,58,.08)}',
      'body.gontu-inline-v4 .quantity-legacy-subtab.active{background:#fffef9;color:var(--gold-dark);box-shadow:0 2px 8px rgba(91,70,32,.1)}',
      '.inline-v4-message-content{display:grid;gap:7px}.inline-v4-message-content>p{margin:0;line-height:1.75}.inline-v4-message-step{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px;align-items:start;line-height:1.7}.inline-v4-message-step b{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:rgba(176,138,58,.1);color:var(--gold-dark);font-size:.65rem}.inline-v4-message.is-thinking{display:flex;align-items:center;gap:7px;color:var(--ink-light)}.inline-v4-thinking-dot{width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:11px 0 0 rgba(176,138,58,.55),22px 0 0 rgba(176,138,58,.28);margin-right:22px;animation:inline-v4-think 1s ease-in-out infinite alternate}@keyframes inline-v4-think{to{opacity:.35;transform:translateY(-1px)}}',
      '@media(max-width:1100px){.inline-v4-topic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:760px){body.gontu-inline-v4{--inline-v4-workspace-h:auto}body.gontu-inline-v4 .study-card-container{padding:14px!important}.inline-v4-card{height:auto!important;min-height:520px!important}.inline-v4-options,.inline-v4-grid,.inline-v4-topic-grid{grid-template-columns:1fr}.inline-v4-foot{align-items:flex-start;flex-direction:column}.inline-v4-actions{align-self:flex-end}.inline-v4-meta{white-space:normal;text-align:right}.inline-v4-coach-card,.inline-v4-study-card{height:440px}.inline-v4-topic-tools{align-items:stretch;flex-wrap:wrap}.inline-v4-topic-tools span{width:100%;margin:0;padding:2px 7px}body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container{grid-template-columns:1fr!important}body.gontu-inline-v4[data-inline-surface="quantityLegacy"] .study-card-container>.quantity-legacy-subtabs{position:static;grid-row:2;flex-direction:row;flex-wrap:wrap;align-self:stretch;height:auto}body.gontu-inline-v4 .quantity-legacy-subtab{flex:1;min-width:84px}}'
    ].join('');
    document.head.appendChild(node);
    document.body.classList.add('gontu-inline-v4');
  }

  function shell(config) {
    return '<section class="big-card inline-v4-card">' +
      '<header class="inline-v4-head"><div><div class="inline-v4-kicker">' + esc(config.kicker) + '</div><h2 class="inline-v4-title">' + esc(config.title) + '</h2></div><span class="inline-v4-meta">' + esc(config.meta || '') + '</span></header>' +
      '<div class="inline-v4-body">' + (config.body || '') + '</div></section>';
  }

  function setRight(title, copy, rows) {
    if (!right) return;
    right.innerHTML = '<div class="inline-v4-side"><section class="inline-v4-side-card"><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p>' +
      '<div class="inline-v4-side-list">' + (rows || []).map(function (row) {
        return '<div><b>' + esc(row[0]) + '</b><span>' + esc(row[1]) + '</span></div>';
      }).join('') + '</div></section></div>';
  }

  function loading(label) {
    zone.innerHTML = shell({ kicker: '正在读取真实学习记录', title: label, meta: '请稍候', body: '<div class="inline-v4-loading">正在从当前账号加载…</div>' });
  }

  function fail(error, retry) {
    zone.innerHTML = shell({
      kicker: '当前操作没有完成',
      title: '这里没有使用假数据',
      meta: '可重试',
      body: '<div class="inline-v4-error">' + esc(error.message || error) + '</div><footer class="inline-v4-foot"><p class="inline-v4-note">题库或登录不可用时保持诚实，不生成占位答案。</p><div class="inline-v4-actions"><button class="inline-v4-btn primary" id="inlineV4Retry">重试</button></div></footer>'
    });
    var button = document.getElementById('inlineV4Retry');
    if (button && retry) button.onclick = retry;
  }

  function optionHtml(options, selected, result) {
    return '<div class="inline-v4-options">' + options.map(function (option, index) {
      var key = option.key || String.fromCharCode(65 + index);
      var cls = selected === key ? ' selected' : '';
      if (result && key === result.correct) cls += ' correct';
      else if (result && key === selected) cls += ' wrong';
      return '<button class="inline-v4-option' + cls + '" type="button" data-answer="' + esc(key) + '"><b>' + esc(key) + '</b><span>' + esc(option.text == null ? option : option.text) + '</span></button>';
    }).join('') + '</div>';
  }

  function progressHtml(count, current, answered) {
    var buttons = [];
    for (var i = 0; i < count; i += 1) {
      buttons.push('<button type="button" class="' + (i === current ? 'current' : '') + '" data-index="' + i + '">' + (i + 1) + (answered && answered(i) ? '✓' : '') + '</button>');
    }
    return '<div class="inline-v4-progress">' + buttons.join('') + '</div>';
  }

  function coachKey(moduleId, contextId) {
    return moduleId + ':' + (contextId || 'standalone');
  }

  function coachMessagesHtml(messages) {
    if (!messages || !messages.length) return '<div class="inline-v4-coach-empty">还没有对话。<br>这里会保留你围绕当前题目的提问和西西的回答。</div>';
    return messages.map(function (message) {
      if (message.thinking) return '<div class="inline-v4-message assistant is-thinking"><span class="inline-v4-thinking-dot"></span><span>思考中</span></div>';
      if (message.role === 'user') return '<div class="inline-v4-message user">' + esc(message.content || '') + '</div>';
      var content = esc(message.content || '')
        .replace(/([。；;!?！？])\s*(?=\d+(?:\.\s+|、))/g, '$1\n')
        .replace(/\s+(?=\d+(?:\.\s+|、))/g, '\n');
      var formatted = content.split(/\n+/).filter(Boolean).map(function (line) {
        var step = line.match(/^(\d+)(?:\.\s+|、\s*)(.+)$/);
        return step ? '<div class="inline-v4-message-step"><b>' + step[1] + '</b><span>' + step[2] + '</span></div>' : '<p>' + line + '</p>';
      }).join('');
      return '<div class="inline-v4-message assistant"><div class="inline-v4-message-content">' + formatted + '</div></div>';
    }).join('');
  }

  function quantityGuide(source) {
    source = source || {};
    var topic = source.primary_topic || source.topic || source.title || '数量关系';
    var guide = {
      topic: topic,
      formula: '未知量＝已知关系整理后的等量式',
      signal: '先圈出对象、数量、比例和限制条件，确认主副题型。',
      model: source.methods && source.methods.length ? source.methods.join('、') : '只设必要未知量，先找最稳定的等量关系。',
      relation: '把未知量、已知量和限制条件写成关键式，再开始计算。',
      verify: '回到题干核对单位、范围与选项，确认答案回答的是题目真正所问。'
    };
    if (/利润|经济/.test(topic)) Object.assign(guide, { formula: '利润＝售价－成本　｜　利润率＝利润÷成本　｜　总利润＝单件利润×销量', signal: '找准成本、售价、折扣、销量和利润率分别以谁为基准。', model: '优先把成本设为 1、100 或题目给定总量，减少百分数计算。', relation: '先写单件利润，再乘销量；有折扣时先求实际售价。' });
    else if (/浓度|溶液/.test(topic)) Object.assign(guide, { formula: '浓度＝溶质÷溶液　｜　混合前后溶质总量守恒', signal: '区分溶质、溶液与浓度，判断是混合、稀释还是蒸发。', model: '画出混合前后两栏；稀释不改溶质，蒸发不改溶质。', relation: '各部分溶质相加＝混合后溶质，溶液总量按题意增减。' });
    else if (/工程/.test(topic)) Object.assign(guide, { formula: '工作量＝效率×时间　｜　合作效率＝各效率之和', signal: '看到合作、轮流、完工时间或效率变化，先判工程关系。', model: '总量赋为时间的公倍数，再统一每个人或机器的效率。', relation: '分段工作就分段计算工作量，最后用总工作量守恒衔接。' });
    else if (/行程/.test(topic)) Object.assign(guide, { formula: '路程＝速度×时间　｜　相遇用速度和　｜　追及用速度差', signal: '圈出路程、速度、时间及相遇或追及方向，先统一单位。', model: '画线段或时间轴，多段行程分别标出速度与时间。', relation: '每一段都写 S＝vt，再用相遇点、追及差或总路程衔接。' });
    else if (/和差倍比/.test(topic)) Object.assign(guide, { formula: '总量＝每份量×总份数　｜　差量＝每份量×份数差', signal: '看到总数、差值、比例或平均分配，先判断能否直接赋份数。', model: '按比例赋份数，再用总量或差量求每一份。', relation: '同一对象的总量必须保持同口径，合并前后分别列人数或数量。' });
    else if (/容斥/.test(topic)) Object.assign(guide, { formula: 'A∪B＝A＋B－A∩B　｜　总数＝至少一项＋都不', signal: '圈出“至少、都不、只属于、重复”分别对应哪块集合区域。', model: '先画集合圈并标交集，再从总数边界向内填。', relation: '重复计算的交集要减去；多集合按题意补回被多减的区域。' });
    else if (/排列|组合|概率/.test(topic)) Object.assign(guide, { formula: '分类用加法　｜　分步用乘法　｜　概率＝符合情况÷全部情况', signal: '先看顺序是否重要，再圈相邻、至少、至多、不能等限制。', model: '先处理最强约束，再分类或分步计数。', relation: '分子与分母必须保持同一统计口径，最后检查是否重复或遗漏。' });
    else if (/几何/.test(topic)) Object.assign(guide, { formula: '周长＝边界长度之和　｜　面积/体积优先用割补、比例与守恒', signal: '先认标准图形、相似关系和可直接使用的长度、面积条件。', model: '把复杂图形拆成标准图形，优先割补、等积或相似比例。', relation: '只统计真实外边界；内部重复线段按题意计算，避免重复计数。' });
    else if (/最值/.test(topic)) Object.assign(guide, { formula: '先求理论边界，再验证边界是否可取', signal: '圈出目标量、上下界以及整数、互异、至少等限制。', model: '让最紧限制先取极端，构造候选边界。', relation: '不能只算边界；还要代回全部限制验证可行性。' });
    else if (/不定方程/.test(topic)) Object.assign(guide, { formula: '主方程＋整数/范围/奇偶/整除限制＝候选解', signal: '未知数多于方程时，立刻检查整数、正数、奇偶或倍数限制。', model: '先列主方程，再用整除、余数和范围筛选。', relation: '不必求出所有解，只保留满足全部题意的候选。' });
    else if (/统筹/.test(topic)) Object.assign(guide, { formula: '总时间＝关键路径耗时，不是所有步骤机械相加', signal: '列出任务、先后依赖与可并行步骤。', model: '画简短流程线，让最长耗时链尽量不断档。', relation: '并行任务取较长者，串行任务才相加，最后检查资源冲突。' });
    return guide;
  }

  async function renderCoachRight(moduleId, contextId, title, copy, guide, hasAnalysis) {
    if (!right) return;
    var key = coachKey(moduleId, contextId);
    right.dataset.coachKey = key;
    var methodHtml = guide ? '<div class="inline-v4-study-pane" data-study-pane="method"><div class="inline-v4-formula-band"><small>本题随手公式</small>' + esc(guide.formula) + '</div><div class="inline-v4-method-steps">' +
      '<div class="inline-v4-method-step"><div><b>第一步 · 识别信号</b><span>' + esc(guide.signal) + '</span></div></div>' +
      '<div class="inline-v4-method-step"><div><b>第二步 · 建立模型</b><span>' + esc(guide.model) + '</span></div></div>' +
      '<div class="inline-v4-method-step"><div><b>第三步 · 写关键式</b><span>' + esc(guide.relation) + '</span></div></div>' +
      '<div class="inline-v4-method-step"><div><b>第四步 · 核对答案</b><span>' + esc(guide.verify) + '</span></div></div></div></div>' : '';
    var aiHtml = '<div class="inline-v4-study-pane" data-study-pane="coach"' + (guide ? ' hidden' : '') + '><div class="inline-v4-coach-history"><div class="inline-v4-coach-empty">打开后会读取这道题的历史对话…</div></div><div class="inline-v4-coach-compose"><textarea aria-label="带当前题目问西西" placeholder="问解题步骤、公式为什么这样用，或刚才错在哪里…"></textarea><button type="button">发送</button></div></div>';
    right.innerHTML = '<section class="inline-v4-side-card ' + (guide ? 'inline-v4-study-card' : 'inline-v4-coach-card') + '"><header><span class="inline-v4-coach-seal">西</span><div><h3>' + esc(title || '问西西 · 当前题目') + '</h3><small>' + esc(guide ? (hasAnalysis ? '已携带题干、作答与官方解析' : '已携带题干与当前作答') : (copy || '真实上下文 · 对话记录会保留')) + '</small></div>' + (guide ? '<button type="button" class="inline-v4-study-toggle" aria-label="收起学习助手" title="收起为西西图标">－</button>' : '') + '</header>' + (guide ? '<div class="inline-v4-study-tabs" role="tablist"><button type="button" class="inline-v4-study-tab active" data-study-tab="method">公式方法</button><button type="button" class="inline-v4-study-tab" data-study-tab="coach">问西西</button></div>' + methodHtml : '') + aiHtml + '</section>';
    var history = right.querySelector('.inline-v4-coach-history');
    var input = right.querySelector('textarea');
    var button = right.querySelector('.inline-v4-coach-compose button');
    var item = states.coach.get(key) || { messages: [] };
    var loaded = false;
    function paint() {
      if (!right || right.dataset.coachKey !== key) return;
      history.innerHTML = coachMessagesHtml(item.messages || []);
      history.scrollTop = history.scrollHeight;
    }
    async function loadHistory() {
      if (loaded) return;
      loaded = true;
      history.innerHTML = '<div class="inline-v4-coach-empty">正在读取这道题的历史对话…</div>';
      try {
      if (!item.threadId) {
        var threads = await api('/api/ai-coach/threads?module_id=' + encodeURIComponent(moduleId));
        var match = (threads || []).find(function (thread) { return thread.activity_id === contextId; });
        if (match) item.threadId = match.id;
      }
      if (item.threadId) {
        var full = await api('/api/ai-coach/threads/' + encodeURIComponent(item.threadId));
        item.messages = full.messages || [];
      }
      states.coach.set(key, item);
      paint();
      } catch (error) {
        if (right.dataset.coachKey === key) history.innerHTML = '<div class="inline-v4-coach-empty">历史记录暂时没有读到：' + esc(error.message) + '</div>';
      }
    }
    if (!guide) loadHistory();
    if (guide) {
      right.querySelectorAll('[data-study-tab]').forEach(function (tab) {
        tab.onclick = function () {
          right.querySelectorAll('[data-study-tab]').forEach(function (node) { node.classList.toggle('active', node === tab); });
          right.querySelectorAll('[data-study-pane]').forEach(function (pane) { pane.hidden = pane.dataset.studyPane !== tab.dataset.studyTab; });
          if (tab.dataset.studyTab === 'coach') loadHistory();
        };
      });
      var card = right.querySelector('.inline-v4-study-card');
      var toggle = right.querySelector('.inline-v4-study-toggle');
      toggle.onclick = function () {
        var collapsed = card.classList.toggle('is-collapsed');
        toggle.textContent = collapsed ? '西' : '－';
        toggle.setAttribute('aria-label', collapsed ? '打开学习助手' : '收起学习助手');
        toggle.title = collapsed ? '打开公式方法或问西西' : '收起为西西图标';
      };
    }
    button.onclick = async function () {
      var content = input.value.trim();
      if (!content || button.disabled) return;
      await loadHistory();
      button.disabled = true;
      item.messages = (item.messages || []).concat([{ role: 'user', content: content }, { role: 'assistant', thinking: true }]);
      paint();
      input.value = '';
      try {
        if (!item.threadId) {
          var body = {
            module_id: moduleId,
            title: '当前题目提问',
            return_url: '/app',
            client: { surface: 'app-inline', version: 'v4' }
          };
          if (contextId) body.context_ref = { kind: 'activity', id: contextId };
          var thread = await api('/api/ai-coach/threads', { method: 'POST', body: JSON.stringify(body) });
          item.threadId = thread.id;
        }
        var payload = await api('/api/ai-coach/threads/' + encodeURIComponent(item.threadId) + '/messages', {
          method: 'POST',
          body: JSON.stringify({ content: content, client_message_id: crypto.randomUUID() })
        });
        item.messages = payload.messages || item.messages.filter(function (message) { return !message.thinking; });
        states.coach.set(key, item);
        paint();
      } catch (error) {
        item.messages = item.messages.filter(function (message) { return !message.thinking; });
        item.messages.push({ role: 'assistant', content: error.message + '。问题已保留，当前题目事实没有被客户端改写。' });
        paint();
      } finally {
        button.disabled = false;
      }
    };
    input.onkeydown = function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        button.click();
      }
    };
  }

  function coachNoteHtml() {
    return '<div class="inline-v4-coach-note"><span class="inline-v4-coach-seal">西</span><span>右侧可以带当前题目问西西，并向上翻看这道题的历史对话。</span></div>';
  }

  async function renderLogic() {
    activeSurface = 'logic';
    loading('逻辑填空');
    try {
      if (!states.logic.questions.length) {
        var payload = await api('/api/verbal-catalog/logic-fill/questions?limit=231');
        states.logic.questions = payload.items || [];
      }
      var state = states.logic;
      var question = state.questions[state.index];
      if (!question) throw new Error('逻辑填空题库当前没有可用题目');
      state.started = state.started || Date.now();
      var options = ['A', 'B', 'C', 'D'].map(function (key) { return { key: key, text: question.options[key] }; });
      var result = state.result ? { correct: state.result.correct_answer } : null;
      var terms = (question.related_terms || []).slice(0, 12);
      var termsHtml = terms.length ? '<div class="inline-v4-terms"><span>题中词语可查看释义或加入成语学习：</span>' + terms.map(function (term) { return '<button type="button" class="btn-sm verbal-term-btn" data-term="' + esc(term) + '">' + esc(term) + '</button>'; }).join('') + '</div>' : '';
      var body = '<p class="inline-v4-stem">' + esc(question.stem) + '</p><p class="inline-v4-prompt">请选择最恰当的一项：</p>' +
        optionHtml(options, state.selected, result) +
        (state.result ? '<div class="inline-v4-result"><strong>' + (state.result.is_correct ? '回答正确' : '这题需要复盘') + '</strong> · 正确答案 ' + esc(state.result.correct_answer) + '。本题暂无原书解析，可带服务端记录问西西。</div>' : '') +
        termsHtml + coachNoteHtml() +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">第 ' + (state.index + 1) + ' / ' + state.questions.length + ' 题 · 选择后立即保存真实作答。</p><div class="inline-v4-actions"><button class="inline-v4-btn" id="logicPrev">上一题</button><button class="inline-v4-btn primary" id="logicNext">下一题</button></div></footer>';
      zone.innerHTML = shell({ kicker: '言语 · 花生海海刷', title: '逻辑填空', meta: '第 ' + (state.index + 1) + ' / 231 题', body: body });
      renderCoachRight('verbal.logic_fill', 'logic-question:' + question.id, '问西西 · 当前逻辑题', '题干与选择由服务端核验 · 历史可回看');
      zone.querySelectorAll('.inline-v4-option').forEach(function (button) {
        button.onclick = async function () {
          if (state.result) return;
          state.selected = button.dataset.answer;
          try {
            state.result = await api('/api/verbal-catalog/logic-fill/attempts', {
              method: 'POST',
              body: JSON.stringify({ question_id: question.id, selected_answer: state.selected, elapsed_ms: Math.min(Date.now() - state.started, 1800000) })
            });
            renderLogic();
          } catch (error) { fail(error, renderLogic); }
        };
      });
      document.getElementById('logicPrev').onclick = function () { state.index = Math.max(0, state.index - 1); state.started = 0; state.selected = ''; state.result = null; renderLogic(); };
      document.getElementById('logicNext').onclick = function () { state.index = (state.index + 1) % state.questions.length; state.started = 0; state.selected = ''; state.result = null; renderLogic(); };
      zone.querySelectorAll('.verbal-term-btn').forEach(function (button) {
        button.onclick = function () { if (typeof window.showVerbalTermTooltip === 'function') window.showVerbalTermTooltip(this.dataset.term, this); };
        button.onmouseenter = function () { if (typeof window.showVerbalTermTooltip === 'function') window.showVerbalTermTooltip(this.dataset.term, this); };
        button.onfocus = button.onmouseenter;
      });
    } catch (error) { fail(error, renderLogic); }
  }

  async function ensureReading() {
    var state = states.reading;
    if (!state.sets.length) state.sets = await api('/api/verbal-reading/sets');
    var currentSet = state.sets[0];
    if (!currentSet) throw new Error('片段阅读题库当前没有套题');
    if (!state.questions.length) state.questions = await api('/api/verbal-reading/sets/' + encodeURIComponent(currentSet.set_id) + '/questions');
    if (!state.session) {
      var sessions = await api('/api/verbal-reading/sessions');
      state.session = sessions.find(function (item) { return item.set_id === currentSet.set_id && item.status === 'in_progress'; }) || null;
      if (!state.session) state.session = await api('/api/verbal-reading/sessions', { method: 'POST', body: JSON.stringify({ set_id: currentSet.set_id }) });
      if (state.session.status === 'submitted' && !state.session.review_questions) {
        state.session = await api('/api/verbal-reading/sessions/' + encodeURIComponent(state.session.id));
      }
      var answered = new Set((state.session.attempts || []).map(function (item) { return item.question_id; }));
      var first = state.questions.findIndex(function (item) { return !answered.has(item.id); });
      state.index = first < 0 ? 0 : first;
    }
  }

  async function renderReading() {
    activeSurface = 'exam';
    loading('限时套题');
    try {
      await ensureReading();
      var state = states.reading;
      var question = state.questions[state.index];
      var attempts = new Map((state.session.attempts || []).map(function (item) { return [item.question_id, item]; }));
      var attempt = attempts.get(question.id);
      var selected = attempt ? attempt.final_answer : '';
      var content = question.content || {};
      var options = (content.options || []).map(function (item) { return { key: item.key, text: item.text }; });
      state.started = Date.now() - Number(attempt && attempt.elapsed_ms || 0);
      var submitted = state.session.status === 'submitted';
      var reviewQuestion = submitted ? ((state.session.review_questions || []).find(function (item) { return item.id === question.id; }) || question) : question;
      var result = submitted ? { correct: reviewQuestion.answer } : null;
      var analysisHtml = submitted && reviewQuestion.official_analysis ? '<div class="inline-v4-result"><strong>官方解析</strong><br>' + esc(reviewQuestion.official_analysis) + '</div>' : '';
      var body = '<p class="inline-v4-stem">' + esc(content.stem || question.stem) + '</p><p class="inline-v4-prompt">' + esc(content.prompt || '这段文字旨在说明：') + '</p>' +
        optionHtml(options, selected, result) + analysisHtml + coachNoteHtml() +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">' + (attempt ? '本题已自动保存' : '交卷前服务端不返回答案') + ' · 第 ' + (state.index + 1) + ' / ' + state.questions.length + ' 题</p><div class="inline-v4-actions"><button class="inline-v4-btn" id="readingPrev">上一题</button><button class="inline-v4-btn primary" id="readingNext">下一题</button></div></footer>';
      zone.innerHTML = shell({ kicker: '言语 · ' + (state.sets[0].label || '练习题 01 套'), title: '限时套题', meta: '建议 ' + (question.estimated_seconds || 55) + ' 秒', body: body });
      renderCoachRight('verbal.reading', 'reading-question:' + state.session.id + ':' + question.id, '问西西 · 当前片段题', '只读取第 ' + (state.index + 1) + ' 题上下文 · 历史按题保留');
      zone.querySelectorAll('.inline-v4-option').forEach(function (button) {
        button.disabled = submitted;
        button.onclick = async function () {
          try {
            state.session = await api('/api/verbal-reading/sessions/' + encodeURIComponent(state.session.id) + '/answers', {
              method: 'PUT',
              body: JSON.stringify({ question_id: question.id, answer: button.dataset.answer, elapsed_ms: Math.min(Date.now() - state.started, 1800000) })
            });
            renderReading();
          } catch (error) { fail(error, renderReading); }
        };
      });
      document.getElementById('readingPrev').onclick = function () { state.index = Math.max(0, state.index - 1); renderReading(); };
      document.getElementById('readingNext').onclick = function () { state.index = Math.min(state.questions.length - 1, state.index + 1); renderReading(); };
    } catch (error) { fail(error, renderReading); }
  }

  async function renderVerbalReview() {
    activeSurface = 'verbalReview';
    loading('我的言语复盘');
    try {
      var results = await Promise.all([api('/api/verbal-catalog/logic-fill/attempts?limit=50'), api('/api/verbal-reading/sessions')]);
      var attempts = results[0] || [];
      var reading = results[1] || [];
      var wrong = attempts.filter(function (item) { return !item.is_correct; });
      var latest = attempts[0] ? new Date(attempts[0].created_at).toLocaleString('zh-CN') : '暂无作答';
      var completed = reading.filter(function (item) { return item.status === 'submitted'; });
      var accuracy = attempts.length ? Math.round((attempts.length - wrong.length) / attempts.length * 100) : 0;
      var body = '<div class="inline-v4-review-stack"><div class="inline-v4-grid">' +
        '<article class="inline-v4-panel"><small>逻辑填空 · 最近更新 ' + esc(latest) + '</small><h3>' + (attempts.length ? '近期正确率 ' + accuracy + '%' : '还缺少作答证据') + '</h3><p>' + (attempts.length ? '最近 ' + attempts.length + ' 题中错 ' + wrong.length + ' 题。下一步：优先回到错题出现的语境关系。' : '先做 5 道逻辑填空，复盘才会判断问题是否反复出现。') + '</p></article>' +
        '<article class="inline-v4-panel"><small>限时套题 · 已交卷 ' + completed.length + ' 套</small><h3>' + (completed.length ? '已有整套证据' : '尚无整套复盘') + '</h3><p>' + (completed.length ? '最近完成套题会保留得分、耗时与逐题记录；下一步继续未完成套题或查看错题。' : '完成一套后才显示稳定问题，不用假数据填充弱项。') + '</p></article></div>' +
        '<div class="inline-v4-review-list"><div class="inline-v4-row"><b>最近</b><span>' + esc(latest) + ' 更新</span><small>真实作答时间</small></div><div class="inline-v4-row"><b>下一步</b><span>' + (wrong.length ? '回练最近错题的语境关系' : '先积累 5 道逻辑作答') + '</span><small>做完再复盘</small></div></div>' +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">本页只读取当前账号真实记录，更新时间来自最新作答。</p><div class="inline-v4-actions"><button class="inline-v4-btn primary" id="reviewGo">去做下一题</button></div></footer></div>';
      zone.innerHTML = shell({ kicker: '言语 · 真实学习证据', title: '我的复盘', meta: '最近更新 ' + latest, body: body });
      setRight('下一步做什么', wrong.length ? '先补最近错题对应的语境关系，再进入一套限时题。' : '先积累至少 5 道作答证据。', [['逻辑', wrong.length + ' 道近期错题'], ['套题', completed.length + ' 套已交卷'], ['原则', '数据不足时不下强结论']]);
      document.getElementById('reviewGo').onclick = renderLogic;
    } catch (error) { fail(error, renderVerbalReview); }
  }

  async function startSingle(topic, forceNew) {
    var state = states.single;
    if (!state.session || forceNew || (topic && state.session.topic !== topic)) {
      state.session = await api('/api/quantity/single-sessions', { method: 'POST', body: JSON.stringify({ topic: topic || null }) });
      state.started = Date.now();
      if (state.index < state.history.length - 1) state.history = state.history.slice(0, state.index + 1);
      if (!state.history.some(function (item) { return item.id === state.session.id; })) state.history.push(state.session);
      state.index = state.history.findIndex(function (item) { return item.id === state.session.id; });
    } else {
      var existing = state.history.findIndex(function (item) { return item.id === state.session.id; });
      if (existing < 0) {
        state.history.push(state.session);
        state.index = state.history.length - 1;
      } else {
        state.index = existing;
      }
    }
    return state.session;
  }

  async function renderSingle(kind, topic, forceNew, requestedVersion) {
    var renderVersion = requestedVersion || navigationVersion;
    activeSurface = kind;
    loading(kind === 'quantityToday' ? '今日训练' : '单题诊断');
    try {
      var session = await startSingle(topic, forceNew);
      if (renderVersion !== navigationVersion) return;
      var q = session.question;
      var options = (q.options || []).map(function (item) { return { key: item.key, text: item.text }; });
      var result = session.status === 'submitted' ? { correct: q.answer } : null;
      var body = '<p class="inline-v4-stem">' + esc(q.stem) + '</p><p class="inline-v4-prompt">先识别题型与取舍，再选择答案：</p>' +
        optionHtml(options, session.final_answer || '', result) +
        (session.status === 'submitted' ? '<div class="inline-v4-result"><strong>' + (session.is_correct ? '回答正确' : '这题需要复盘') + '</strong> · 正确答案 ' + esc(q.answer) + '<br>' + esc(q.analysis || '本题暂无文字解析。') + '</div>' : '') +
        coachNoteHtml() +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">' + esc(q.primary_topic) + ' · ' + esc(q.exam_decision_label) + ' · 建议 ' + (q.estimated_seconds || 80) + ' 秒</p><div class="inline-v4-actions"><button class="inline-v4-btn" id="singlePrev"' + (states.single.index <= 0 ? ' disabled' : '') + '>上一题</button><button class="inline-v4-btn primary" id="singleNext"' + (session.status !== 'submitted' && states.single.index >= states.single.history.length - 1 ? ' disabled' : '') + '>下一题</button></div></footer>';
      zone.innerHTML = shell({ kicker: '数量关系 · ' + (kind === 'quantityToday' ? '今日第 1 题' : '完整走一题'), title: kind === 'quantityToday' ? '今日训练' : '单题诊断', meta: q.primary_topic + ' · ' + q.exam_decision_label, body: body });
      renderCoachRight(
        'quantity.practice',
        'quantity-single:' + session.id,
        '当前题学习助手',
        '识别、取舍、写步骤、核对 · 历史可回看',
        quantityGuide(q),
        session.status === 'submitted' && !!q.analysis
      );
      zone.querySelectorAll('.inline-v4-option').forEach(function (button) {
        button.disabled = session.status === 'submitted';
        button.onclick = async function () {
          try {
            states.single.session = await api('/api/quantity/single-sessions/' + encodeURIComponent(session.id) + '/submit', {
              method: 'POST',
              body: JSON.stringify({ answer: button.dataset.answer, elapsed_ms: Math.min(Date.now() - states.single.started, 1800000), stuck_step: null, work_note: '' })
            });
            if (states.single.index >= 0) states.single.history[states.single.index] = states.single.session;
            renderSingle(kind, topic, false);
          } catch (error) { fail(error, function () { renderSingle(kind, topic, false); }); }
        };
      });
      document.getElementById('singlePrev').onclick = function () {
        if (states.single.index <= 0) return;
        states.single.index -= 1;
        states.single.session = states.single.history[states.single.index];
        renderSingle(kind, states.single.session.topic || null, false);
      };
      document.getElementById('singleNext').onclick = function () {
        if (states.single.index < states.single.history.length - 1) {
          states.single.index += 1;
          states.single.session = states.single.history[states.single.index];
          renderSingle(kind, states.single.session.topic || null, false);
          return;
        }
        if (session.status === 'submitted') renderSingle(kind, session.topic, true);
      };
    } catch (error) {
      if (renderVersion !== navigationVersion) return;
      fail(error, function () { renderSingle(kind, topic, forceNew); });
    }
  }

  async function ensureSet() {
    var state = states.set;
    if (!state.sets.length) state.sets = await api('/api/quantity/sets');
    if (!state.session) {
      var sessions = await api('/api/quantity/sessions');
      state.session = sessions.find(function (item) { return item.status === 'in_progress'; }) || await api('/api/quantity/sessions', { method: 'POST', body: JSON.stringify({ set_no: state.sets[0].set_no }) });
      state.questions = await api('/api/quantity/sets/' + state.session.set_no + '/questions');
      var answered = new Set((state.session.attempts || []).map(function (item) { return item.question_id; }));
      var first = state.questions.findIndex(function (item) { return !answered.has(item.id); });
      state.index = first < 0 ? 0 : first;
    }
  }

  async function renderSet(requestedVersion) {
    var renderVersion = requestedVersion || navigationVersion;
    activeSurface = 'quantitySet';
    loading('套题策略');
    try {
      await ensureSet();
      if (renderVersion !== navigationVersion) return;
      var state = states.set;
      var q = state.questions[state.index];
      var attempts = new Map((state.session.attempts || []).map(function (item) { return [item.question_id, item]; }));
      var attempt = attempts.get(q.id);
      var options = (q.options || []).map(function (item) { return { key: item.key, text: item.text }; });
      state.started = Date.now() - Number(attempt && attempt.elapsed_ms || 0);
      var body = '<p class="inline-v4-stem">' + esc(q.stem) + '</p><p class="inline-v4-prompt">第 ' + q.question_no + ' 题 · ' + esc(q.primary_topic) + '：</p>' +
        optionHtml(options, attempt && attempt.final_answer || '', null) + coachNoteHtml() +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">' + attempts.size + ' / ' + state.questions.length + ' 已记录 · 选择后自动保存</p><div class="inline-v4-actions"><button class="inline-v4-btn" id="setPrev">上一题</button><button class="inline-v4-btn primary" id="setNext">下一题</button></div></footer>';
      zone.innerHTML = shell({ kicker: '数量关系 · 第 ' + String(state.session.set_no).padStart(2, '0') + ' 套', title: '套题策略', meta: q.exam_decision_label + ' · 建议 ' + (q.estimated_seconds || 80) + ' 秒', body: body });
      renderCoachRight(
        'quantity.exam',
        'quantity-question:' + state.session.id + ':' + q.id,
        '当前套题学习助手',
        '只读取第 ' + q.question_no + ' 题上下文 · 历史按题保留',
        quantityGuide(q),
        !!(attempt && (attempt.analysis || attempt.is_correct != null))
      );
      zone.querySelectorAll('.inline-v4-option').forEach(function (button) {
        button.onclick = async function () {
          try {
            state.session = await api('/api/quantity/sessions/' + encodeURIComponent(state.session.id) + '/attempts', {
              method: 'PUT',
              body: JSON.stringify({ question_id: q.id, answer: button.dataset.answer, skipped: false, elapsed_ms: Math.min(Date.now() - state.started, 1800000), stuck_step: null })
            });
            renderSet();
          } catch (error) { fail(error, renderSet); }
        };
      });
      document.getElementById('setPrev').onclick = function () { state.index = Math.max(0, state.index - 1); renderSet(); };
      document.getElementById('setNext').onclick = function () { state.index = Math.min(state.questions.length - 1, state.index + 1); renderSet(); };
    } catch (error) {
      if (renderVersion !== navigationVersion) return;
      fail(error, renderSet);
    }
  }

  async function renderTopics(requestedVersion) {
    var renderVersion = requestedVersion || navigationVersion;
    activeSurface = 'quantityType';
    loading('系统学题型');
    try {
      var items = await api('/api/quantity/topics');
      if (renderVersion !== navigationVersion) return;
      var body = '<div class="inline-v4-topic-grid">' + items.map(function (item, index) {
        return '<button type="button" class="inline-v4-topic-card" data-topic="' + esc(item.topic) + '"><span class="inline-v4-topic-rank">' + String(index + 1).padStart(2, '0') + '</span><strong>' + esc(item.decision_label) + ' · ' + esc(item.topic) + '</strong><small>' + item.question_count + ' 题 · 建议 ' + (item.recommended_seconds || '按题况') + ' 秒</small></button>';
      }).join('') + '</div>';
      zone.innerHTML = shell({ kicker: '数量关系 · 按值得做的顺序', title: '系统学题型', meta: items.length + ' 类真实题型', body: body });
      function selectTopic(item, button) {
        zone.querySelectorAll('[data-topic]').forEach(function (node) { node.classList.toggle('is-active', node === button); });
        var guide = quantityGuide(item);
        var steps = [
          ['第一步 · 识别信号', guide.signal],
          ['第二步 · 建立模型', guide.model],
          ['第三步 · 写关键式', guide.relation],
          ['第四步 · 核对与取舍', guide.verify]
        ];
        right.innerHTML = '<section class="inline-v4-side-card"><h3>' + esc(item.topic) + ' · ' + esc(item.decision_label) + '</h3><p>先把常用公式和完整步骤放在手边，再进入专项题。</p><div class="inline-v4-formula-band"><small>随手公式</small>' + esc(guide.formula) + '</div><div class="inline-v4-method-steps">' + steps.map(function (step) {
          return '<div class="inline-v4-method-step"><div><b>' + esc(step[0]) + '</b><span>' + esc(step[1]) + '</span></div></div>';
        }).join('') + '</div><button type="button" class="inline-v4-method-action">练这类真实题</button></section>';
        right.querySelector('.inline-v4-method-action').onclick = function () { renderSingle('quantitySingle', item.topic, true); };
      }
      zone.querySelectorAll('[data-topic]').forEach(function (button) {
        button.onclick = function () {
          var item = items.find(function (candidate) { return candidate.topic === button.dataset.topic; });
          if (item) selectTopic(item, button);
        };
      });
      var first = zone.querySelector('[data-topic]');
      if (first && items[0]) selectTopic(items[0], first);
    } catch (error) {
      if (renderVersion !== navigationVersion) return;
      fail(error, renderTopics);
    }
  }

  async function renderQuantityReview(requestedVersion) {
    var renderVersion = requestedVersion || navigationVersion;
    activeSurface = 'quantityReview';
    loading('我的数量复盘');
    try {
      var data = await api('/api/quantity/review-summary');
      if (renderVersion !== navigationVersion) return;
      var rec = data.recommendation || { topic: '数量关系', reason: '先完成一道真实单题' };
      var latest = data.timeline && data.timeline[0] ? new Date(data.timeline[0].updated_at).toLocaleString('zh-CN') : '暂无训练';
      var topics = (data.topic_reviews || []).slice(0, 4);
      var body = '<div class="inline-v4-review-stack"><div class="inline-v4-grid"><article class="inline-v4-panel"><small>下一步 · 最近更新 ' + esc(latest) + '</small><h3>' + esc(rec.topic) + '专项</h3><p>' + esc(rec.reason) + '</p></article><article class="inline-v4-panel"><small>真实证据</small><h3>' + data.evidence_count + ' 条记录</h3><p>' + data.single_count + ' 道单题诊断，' + data.set_count + ' 套已交卷训练。</p></article></div>' +
        '<div class="inline-v4-review-list">' + (topics.length ? topics.map(function (item) {
          var need = item.needed_for_stable ? '还需 ' + item.needed_for_stable + ' 题再判断' : '已达到基础证据';
          return '<div class="inline-v4-row"><b>' + Math.round(item.accuracy * 100) + '%</b><span>' + esc(item.topic) + (item.top_stuck_step ? ' · 常卡在' + esc(item.top_stuck_step) : '') + '</span><small>' + need + '</small></div>';
        }).join('') : '<div class="inline-v4-panel"><p>还没有足够的单题记录，先做一道题后再回来。</p></div>') + '</div>' +
        '<footer class="inline-v4-foot"><p class="inline-v4-note">复盘只显示当前账号真实记录；证据不足时明确告诉你还要做什么。</p><div class="inline-v4-actions"><button class="inline-v4-btn primary" id="quantityReviewGo">开始下一题</button></div></footer></div>';
      zone.innerHTML = shell({ kicker: '数量关系 · 真实学习证据', title: '我的复盘', meta: '最近更新 ' + latest, body: body });
      setRight('今天先做什么', rec.reason, [['推荐题型', rec.topic], ['单题记录', String(data.single_count)], ['套题记录', String(data.set_count)]]);
      document.getElementById('quantityReviewGo').onclick = function () { renderSingle('quantitySingle', rec.topic, true); };
    } catch (error) {
      if (renderVersion !== navigationVersion) return;
      fail(error, renderQuantityReview);
    }
  }

  function renderQuantityLegacy(preferredMode) {
    activeSurface = 'quantityLegacy';
    document.body.dataset.inlineSurface = 'quantityLegacy';
    if (typeof window.setCurrentDeckType === 'function') window.setCurrentDeckType('math');
    if (typeof window.importBuiltinMathDeck === 'function') window.importBuiltinMathDeck();
    var mode = document.getElementById('modeSwitchGroup');
    var verbalEntry = document.getElementById('verbalEntryCard');
    if (verbalEntry) verbalEntry.style.display = 'none';
    if (!mode) {
      fail(new Error('没有找到原数量训练入口，请刷新后重试。'), function () { renderQuantityLegacy(preferredMode); });
      return;
    }
    mode.classList.add('inline-v4-legacy-modes');
    mode.style.display = 'none';
    mode.querySelectorAll('.mode-btn').forEach(function (button) {
      button.style.display = 'none';
    });
    var allowedModes = ['recite', 'difficult', 'steps', 'quiz'];
    var requestedMode = allowedModes.indexOf(preferredMode) >= 0 ? preferredMode : 'steps';
    var target = mode.querySelector('.mode-btn[data-mode="' + requestedMode + '"]');
    if (!target) {
      fail(new Error('数量识别与填空的切换按钮未加载。'), function () { renderQuantityLegacy(preferredMode); });
      return;
    }
    var renderedMode = requestedMode;
    legacyRenderPermit += 1;
    try {
      if (typeof window.setLegacyLearningMode === 'function') {
        renderedMode = window.setLegacyLearningMode(requestedMode, true) || requestedMode;
      } else {
        target.click();
        renderedMode = target.dataset.mode || requestedMode;
      }
    } finally {
      legacyRenderPermit -= 1;
    }
    document.body.dataset.quantityLegacyMode = renderedMode;
    var legacyTabs = document.querySelector('.quantity-legacy-subtabs');
    var studyContainer = document.querySelector('.study-card-container');
    if (legacyTabs && studyContainer && legacyTabs.parentElement !== studyContainer) studyContainer.appendChild(legacyTabs);
    (legacyTabs || subnav).querySelectorAll('[data-quantity-legacy-mode]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.quantityLegacyMode === renderedMode);
    });
    if (right) right.innerHTML = '';
  }

  function renderVocab() {
    activeSurface = 'vocab';
    document.body.dataset.inlineSurface = 'vocab';
    if (typeof window.switchDeck === 'function') window.switchDeck('idiom');
    if (typeof window.renderAll === 'function') window.renderAll();
    setRight('词语学习状态', '继续使用原有成语词库、记忆队列和真实复习记录。', [['复习', '到期词与近期易忘词'], ['学习', '保留原例句和收藏功能'], ['切换', '点击上方标签即可回到题目']]);
  }

  var handlers = {
    vocab: renderVocab,
    logic: renderLogic,
    exam: renderReading,
    review: renderVerbalReview,
    quantityToday: function (version) { return renderSingle('quantityToday', null, false, version); },
    quantitySingle: function (version) { return renderSingle('quantitySingle', null, true, version); },
    quantitySet: renderSet,
    quantityType: renderTopics,
    quantityLegacy: function () { return renderQuantityLegacy('steps'); },
    quantityReview: renderQuantityReview
  };

  function normalizeVerbalNav() {
    zone = document.getElementById('learningZone') || zone;
    subnav = document.querySelector('.verbal-demo-subnav') || subnav;
    right = document.querySelector('.context-right-v2') || right;
    var reading = subnav.querySelector('[data-verbal-demo="reading"]');
    if (reading) reading.remove();
    var exam = subnav.querySelector('[data-verbal-demo="exam"]');
    if (exam) {
      var text = Array.from(exam.childNodes).find(function (item) { return item.nodeType === Node.TEXT_NODE; });
      if (text) text.textContent = ' 限时套题';
      else exam.append(' 限时套题');
    }
  }

  function icon(kind) {
    var paths = {
      book: '<rect x="3" y="2" width="12" height="14" rx="1.5"/><path d="M6 6h6M6 9h4M6 12h5"/>',
      clock: '<circle cx="9" cy="9" r="7"/><path d="M9 5v4l2.5 1.5"/>',
      paper: '<path d="M3 4h12v11H3zM5 2h8v3H5z"/><path d="M6 8h6M6 11h6"/>',
      nodes: '<circle cx="5" cy="5" r="2"/><circle cx="13" cy="5" r="2"/><circle cx="9" cy="13" r="2"/><path d="M6.5 6.5l1.6 4.5M11.5 6.5L9.9 11"/>',
      review: '<circle cx="9" cy="9" r="7" stroke-dasharray="2.5 1.5"/><path d="M5 11.5c1.2-3 2.7-4.5 4-4.5s2.8 1.5 4 4.5"/><circle cx="9" cy="5" r="1.5"/>'
    };
    return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px" stroke="rgba(176,138,58,.65)" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round">' + paths[kind] + '</svg>';
  }

  function buildNavMarkup(deck) {
    if (deck === 'math') {
      return '<div class="deck-tabs" id="quantityDemoTabs">' +
        '<button class="deck-tab active" data-quantity-demo="quantityToday">' + icon('clock') + ' 今日训练</button>' +
        '<button class="deck-tab" data-quantity-demo="quantitySingle">' + icon('book') + ' 单题诊断</button>' +
        '<button class="deck-tab" data-quantity-demo="quantitySet">' + icon('paper') + ' 套题策略</button>' +
        '<button class="deck-tab" data-quantity-demo="quantityType">' + icon('nodes') + ' 系统学题型</button>' +
        '<button class="deck-tab" data-quantity-demo="quantityLegacy">' + icon('paper') + ' 识别与填空</button>' +
        '<span class="quantity-legacy-subtabs" aria-label="识别与填空模式">' +
          '<button class="quantity-legacy-subtab" type="button" data-quantity-legacy-mode="recite">全部题型</button>' +
          '<button class="quantity-legacy-subtab" type="button" data-quantity-legacy-mode="difficult">易忘攻克</button>' +
          '<button class="quantity-legacy-subtab active" type="button" data-quantity-legacy-mode="steps">步骤填空</button>' +
          '<button class="quantity-legacy-subtab" type="button" data-quantity-legacy-mode="quiz">题型识别</button>' +
        '</span>' +
        '<button class="deck-tab" data-quantity-demo="quantityReview">' + icon('review') + ' 我的复盘</button>' +
        '</div><span class="verbal-demo-note">数量关系</span>';
    }
    return '<div class="deck-tabs" id="verbalDemoTabs">' +
      '<button class="deck-tab active" data-verbal-demo="vocab">' + icon('book') + ' 词语积累</button>' +
      '<button class="deck-tab" data-verbal-demo="logic">' + icon('paper') + ' 逻辑填空</button>' +
      '<button class="deck-tab" data-verbal-demo="exam">' + icon('clock') + ' 限时套题</button>' +
      '<button class="deck-tab" data-verbal-demo="review">' + icon('review') + ' 我的复盘</button>' +
      '</div><span class="verbal-demo-note">言语理解</span>';
  }

  function installDeckNav(deck) {
    var existingLegacyTabs = document.querySelector('.study-card-container>.quantity-legacy-subtabs');
    var existingQuantityNav = document.getElementById('quantityDemoTabs');
    if (existingLegacyTabs && existingQuantityNav) existingQuantityNav.appendChild(existingLegacyTabs);
    subnav.innerHTML = deck === 'math' ? quantityNavHtml : verbalNavHtml;
    if (deck !== 'math') normalizeVerbalNav();
  }

  function activate(button, key) {
    normalizeVerbalNav();
    navigationVersion += 1;
    document.body.dataset.inlineNavigationVersion = String(navigationVersion);
    document.body.dataset.inlineLastNavigation = key;
    var requestedVersion = navigationVersion;
    if (key !== 'quantityLegacy') {
      delete document.body.dataset.quantityLegacyMode;
      var dockedLegacyTabs = document.querySelector('.study-card-container>.quantity-legacy-subtabs');
      var quantityNav = document.getElementById('quantityDemoTabs');
      var reviewButton = quantityNav && quantityNav.querySelector('[data-quantity-demo="quantityReview"]');
      if (dockedLegacyTabs && quantityNav) quantityNav.insertBefore(dockedLegacyTabs, reviewButton || null);
    }
    button = subnav.querySelector('[data-verbal-demo="' + key + '"]') || subnav.querySelector('[data-quantity-demo="' + key + '"]') || button;
    subnav.querySelectorAll('.deck-tab').forEach(function (item) { item.classList.toggle('active', item === button); });
    var mode = document.getElementById('modeSwitchGroup');
    var queue = document.getElementById('queueBadge');
    var verbalEntry = document.getElementById('verbalEntryCard');
    if (mode) {
      mode.classList.remove('inline-v4-legacy-modes');
      mode.style.display = 'none';
    }
    if (queue) queue.style.display = 'none';
    if (verbalEntry) verbalEntry.style.display = key === 'vocab' ? '' : 'none';
    var handler = handlers[key];
    document.body.dataset.inlineSurface = key;
    if (handler) Promise.resolve(handler(requestedVersion)).catch(function (error) { fail(error, handler); });
  }

  function boot() {
    zone = document.getElementById('learningZone');
    subnav = document.querySelector('.verbal-demo-subnav');
    right = document.querySelector('.context-right-v2');
    var deckTabs = document.getElementById('deckTabs');
    if (!zone || !subnav || !right || !deckTabs) {
      setTimeout(boot, 40);
      return;
    }
    style();
    document.body.dataset.inlineBuild = '20260716d';
    verbalNavHtml = buildNavMarkup('idiom');
    quantityNavHtml = buildNavMarkup('math');
    normalizeVerbalNav();
    /*
     * The legacy deck still owns several async callbacks.  Once an inline
     * learning surface is active those callbacks must not repaint the same
     * #learningZone with the retired “识别题型” card.  Keep the original
     * renderer for vocabulary. The restored legacy quantity cards may render
     * only while the user is explicitly switching one of their four modes;
     * late deck-sync callbacks must not repaint the current workspace.
     */
    var legacyRenderAll = window.renderAll;
    if (typeof legacyRenderAll === 'function' && !legacyRenderAll.__inlineV4Guarded) {
      var guardedRenderAll = function () {
        if (activeSurface === 'quantityLegacy' && legacyRenderPermit <= 0) return;
        if (activeSurface && activeSurface !== 'vocab' && activeSurface !== 'quantityLegacy') return;
        return legacyRenderAll.apply(this, arguments);
      };
      guardedRenderAll.__inlineV4Guarded = true;
      window.renderAll = guardedRenderAll;
    }
    document.addEventListener('click', function (event) {
      var deckButton = event.target.closest('#deckTabs [data-deck]');
      var requestedDeck = deckButton && deckButton.dataset.deck;
      if (requestedDeck === 'idiom' || requestedDeck === 'math') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof window.setCurrentDeckType === 'function') window.setCurrentDeckType(requestedDeck);
        deckTabs.querySelectorAll('[data-deck]').forEach(function (item) { item.classList.toggle('active', item === deckButton); });
        installDeckNav(requestedDeck);
        var requestedKey = requestedDeck === 'math' ? 'quantityToday' : 'vocab';
        var requestedTarget = requestedDeck === 'math' ? subnav.querySelector('[data-quantity-demo="quantityToday"]') : subnav.querySelector('[data-verbal-demo="vocab"]');
        if (requestedTarget) activate(requestedTarget, requestedKey);
        return;
      }
      var verbal = event.target.closest('[data-verbal-demo]');
      var legacyModeButton = event.target.closest('.quantity-legacy-subtab[data-quantity-legacy-mode]');
      if (legacyModeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        renderQuantityLegacy(legacyModeButton.dataset.quantityLegacyMode || 'steps');
        return;
      }
      var quantity = event.target.closest('[data-quantity-demo]');
      var button = verbal || quantity;
      if (!button) return;
      var key = verbal ? verbal.dataset.verbalDemo : quantity.dataset.quantityDemo;
      if (!handlers[key]) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      activate(button, key);
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var tooltip = document.getElementById('verbalTermTooltip');
        if (tooltip) tooltip.style.display = 'none';
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      var target = event.target;
      if (target && (target.matches('input,textarea,select,[contenteditable="true"]') || target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      var selector = event.key === 'ArrowLeft' ? '#logicPrev,#readingPrev,#singlePrev,#setPrev' : '#logicNext,#readingNext,#singleNext,#setNext';
      var control = zone && zone.querySelector(selector);
      if (!control || control.disabled) return;
      event.preventDefault();
      control.click();
    });
    document.addEventListener('pointerdown', function (event) {
      var tooltip = document.getElementById('verbalTermTooltip');
      if (tooltip && tooltip.style.display !== 'none' && !tooltip.contains(event.target) && !event.target.closest('.verbal-term-btn')) tooltip.style.display = 'none';
    });

    var savedDeck = typeof window.getCurrentDeckType === 'function' ? window.getCurrentDeckType() : 'idiom';
    installDeckNav(savedDeck);
    var initialKey = savedDeck === 'math' ? 'quantityToday' : 'vocab';
    var initial = savedDeck === 'math' ? subnav.querySelector('[data-quantity-demo="quantityToday"]') : subnav.querySelector('[data-verbal-demo="vocab"]');
    deckTabs.querySelectorAll('[data-deck]').forEach(function (item) { item.classList.toggle('active', item.dataset.deck === savedDeck); });
    if (initial) activate(initial, initialKey);
  }

  boot();
})();
