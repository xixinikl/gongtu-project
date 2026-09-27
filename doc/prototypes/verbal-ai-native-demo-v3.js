(function () {
    if (window.__verbalAiNativeDemoV3Loaded) return;
    window.__verbalAiNativeDemoV3Loaded = true;

    const gold = 'rgba(176,138,58,.7)';
    const icon = {
        graph: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="2.2" stroke="${gold}" stroke-width="1.1"/><circle cx="13" cy="5" r="2" stroke="${gold}" stroke-width="1.1"/><circle cx="9" cy="13" r="2.2" stroke="${gold}" stroke-width="1.1"/><path d="M7 6.2l1.2 4.6M11.3 6.5l-1.4 4.3" stroke="rgba(176,138,58,.36)" stroke-width=".8"/></svg>`,
        map: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2.5 4l4-2 5 2 4-2v12l-4 2-5-2-4 2V4zM6.5 2v12M11.5 4v12" stroke="${gold}" stroke-width="1" stroke-linejoin="round"/></svg>`,
        cube: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 1.8l6 3.3v7L9 16l-6-3.9v-7l6-3.3zM3 5.1l6 3.5 6-3.5M9 8.6V16" stroke="${gold}" stroke-width="1" stroke-linejoin="round"/></svg>`,
        review: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7" stroke="${gold}" stroke-width="1" stroke-dasharray="2.4 1.5"/><path d="M5.5 11.5c1.1-2.8 2.4-4.2 3.5-4.2s2.4 1.4 3.5 4.2" stroke="${gold}" stroke-width="1"/><circle cx="9" cy="5.3" r="1.3" stroke="${gold}" stroke-width=".9"/></svg>`
    };

    function boot() {
        const deckTabs = document.getElementById('deckTabs');
        const learningZone = document.getElementById('learningZone');
        const verbalNav = document.querySelector('.verbal-demo-subnav');
        const rightPanel = document.querySelector('.context-right-v2');
        if (!deckTabs || !learningZone || !verbalNav || !rightPanel) return setTimeout(boot, 40);

        document.body.classList.add('verbal-ai-v3');
        document.body.dataset.productShell = 'gongtu-unified-v3';
        const shellNote = verbalNav.querySelector('.verbal-demo-note');
        if (shellNote) shellNote.textContent = '公途统一学习页';
        const existingGraph = Array.from(deckTabs.children).find(btn => btn.textContent.includes('图推'));
        if (existingGraph) {
            existingGraph.removeAttribute('onclick');
            existingGraph.removeAttribute('title');
            existingGraph.id = 'reasoningDeckEntryV3';
            existingGraph.innerHTML = `${icon.graph} 图形推理`;
        }

        const style = document.createElement('style');
        style.textContent = `
          .reasoning-subnav-v3{display:none;margin-bottom:24px}.reasoning-subnav-v3 .deck-tabs{width:100%;justify-content:center}
          .reasoning-subnav-v3 .deck-tab{display:inline-flex;align-items:center;gap:6px}
          .reasoning-home-v3{padding:34px 38px!important;min-height:510px}
          .reasoning-kicker-v3{display:flex;align-items:center;gap:8px;color:#9a742d;font-size:.76rem;letter-spacing:.14em}
          .reasoning-head-v3{display:flex;justify-content:space-between;align-items:end;gap:24px;margin:14px 0 27px}
          .reasoning-head-v3 h2{flex:1;min-width:0;margin:0;color:#2c2618;font-family:'Noto Serif SC',serif;font-size:1.55rem;letter-spacing:.05em;white-space:nowrap}
          .reasoning-head-v3 p{max-width:430px;margin:0;color:#7a6e58;font-size:.78rem;line-height:1.75;text-align:right}
          .reasoning-branches-v3{display:grid;grid-template-columns:1fr 1fr;gap:16px}
          .reasoning-branch-v3{position:relative;min-height:250px;padding:24px;border:1px solid #e5d9c3;border-radius:12px;background:linear-gradient(145deg,#fffefa,#faf6ec);overflow:hidden}
          .reasoning-branch-v3::after{content:attr(data-mark);position:absolute;right:18px;top:9px;color:rgba(176,138,58,.11);font:700 5rem/1 'ZCOOL XiaoWei','KaiTi',serif}
          .reasoning-branch-v3 h3{position:relative;margin:0 0 8px;color:#2c2618;font:700 1.12rem/1.4 'Noto Serif SC',serif;z-index:1}
          .reasoning-branch-v3>p{position:relative;margin:0;color:#82745f;font-size:.76rem;line-height:1.7;z-index:1}
          .reasoning-path-v3{position:relative;display:grid;gap:7px;margin-top:20px;z-index:1}
          .reasoning-step-v3{display:grid;width:100%;grid-template-columns:24px 1fr auto;align-items:center;gap:9px;padding:9px 10px;border:0;border-top:1px solid rgba(176,138,58,.13);background:transparent;color:#443b2e;font:inherit;font-size:.76rem;text-align:left;text-decoration:none;cursor:pointer}
          .reasoning-step-v3:first-child{border-top:0}.reasoning-step-v3 i{width:20px;height:20px;border:1px solid rgba(176,138,58,.3);border-radius:50%;display:grid;place-items:center;color:#9a742d;font:normal .62rem serif}
          .reasoning-step-v3 small{color:#a08248}.reasoning-branch-action-v3{position:relative;display:inline-flex;margin-top:18px;padding:8px 15px;border:1px solid rgba(176,138,58,.35);border-radius:999px;background:#fffdf8;color:#805f25;font:inherit;text-decoration:none;font-size:.74rem;cursor:pointer;z-index:1}
          .reasoning-evidence-v3{display:grid;gap:8px;margin-top:13px}.reasoning-evidence-v3 div{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid rgba(176,138,58,.12)}
          .reasoning-evidence-v3 b{padding:3px 6px;border:1px solid rgba(176,138,58,.26);border-radius:5px;color:#8d6729;font-size:.66rem}.reasoning-evidence-v3 span{font-size:.75rem;color:#443b2e}.reasoning-evidence-v3 small{color:#a17c35;font-size:.66rem}
          .review-v3{min-height:660px;padding:34px 38px!important;text-align:left!important;cursor:default!important}
          .review-hero-v3{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:end;padding-bottom:24px;border-bottom:1px solid rgba(176,138,58,.18)}
          .review-eyebrow-v3{display:flex;align-items:center;gap:7px;color:#9a742d;font-size:.74rem;letter-spacing:.12em}.review-hero-v3 h2{margin:10px 0 7px;color:#2c2618;font:700 1.55rem/1.4 'Noto Serif SC',serif;letter-spacing:.05em}.review-hero-v3 p{margin:0;color:#796d5b;font-size:.78rem;line-height:1.75}
          .review-score-v3{display:grid;grid-template-columns:repeat(3,82px);gap:8px}.review-score-v3 div{padding:13px 7px;border:1px solid #e8deca;border-radius:8px;background:#fffdf8;text-align:center}.review-score-v3 strong{display:block;color:#a77d2e;font:700 1.25rem/1.2 'Noto Serif SC',serif}.review-score-v3 small{color:#8b806d;font-size:.64rem}
          .review-section-v3{margin-top:25px}.review-section-head-v3{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.review-section-head-v3 h3{margin:0;color:#322b20;font:700 .98rem/1.4 'Noto Serif SC',serif}.review-section-head-v3 span{color:#9b8b70;font-size:.69rem}
          .review-issues-v3{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-issue-v3{padding:18px;border:1px solid #e7dcc7;border-radius:9px;background:linear-gradient(145deg,#fffefa,#fbf7ee)}.review-issue-top-v3{display:flex;justify-content:space-between;align-items:center;gap:10px}.review-issue-top-v3 b{color:#30291f;font-size:.9rem}.review-issue-top-v3 em{font-style:normal;color:#966d29;font-size:.68rem}.review-issue-v3 p{margin:9px 0 13px;color:#776b59;font-size:.74rem;line-height:1.7}.review-action-v3{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center;padding-top:11px;border-top:1px solid rgba(176,138,58,.14)}.review-action-v3 span{color:#4d4335;font-size:.74rem}.review-action-v3 button{border:1px solid rgba(176,138,58,.3);border-radius:999px;background:#fffdf8;color:#805f25;padding:6px 12px;font-size:.68rem}
          .review-bottom-v3{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-top:12px}.review-panel-v3{padding:18px;border:1px solid #e7dcc7;border-radius:9px;background:#fffdf9}.review-timeline-v3{display:grid;gap:0}.review-timeline-v3 div{display:grid;grid-template-columns:58px 10px 1fr;gap:9px;align-items:start;min-height:46px;color:#766a58;font-size:.72rem}.review-timeline-v3 i{width:7px;height:7px;margin-top:5px;border:1px solid #b08a3a;border-radius:50%;background:#fff}.review-timeline-v3 b{display:block;color:#41382c;font-size:.75rem;margin-bottom:2px}.review-empty-v3{display:grid;place-items:center;min-height:145px;padding:20px;text-align:center;color:#7b6e5a;font-size:.74rem;line-height:1.75}.review-empty-v3 strong{display:block;color:#3e3529;font-size:.86rem;margin-bottom:6px}
          .review-right-v3{display:flex;flex-direction:column;gap:14px}.review-next-v3{display:grid;gap:8px;margin-top:13px}.review-next-v3 a{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:10px 0;border-top:1px solid rgba(176,138,58,.13);color:inherit;text-decoration:none}.review-next-v3 a:first-child{border-top:0}.review-next-v3 b{padding:4px 7px;border:1px solid rgba(176,138,58,.26);border-radius:5px;color:#8d6729;font-size:.65rem}.review-next-v3 span{color:#40372b;font-size:.74rem}.review-next-v3 small{color:#9a742d;font-size:.66rem}
          .exam-v3,.quantity-home-v3{min-height:640px;padding:34px 38px!important;text-align:left!important;cursor:default!important}.exam-head-v3{display:flex;justify-content:space-between;gap:22px;align-items:start;margin-bottom:24px}.exam-head-v3 h2,.quantity-home-v3 h2{margin:8px 0 6px;color:#2c2618;font:700 1.5rem/1.4 'Noto Serif SC',serif;letter-spacing:.05em}.exam-head-v3 p,.quantity-home-v3>p{margin:0;color:#786c59;font-size:.76rem;line-height:1.75}.exam-state-v3{padding:6px 10px;border:1px solid rgba(176,138,58,.28);border-radius:999px;color:#8a6729;background:#fffdf8;font-size:.67rem;white-space:nowrap}
          .exam-config-v3{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.exam-card-v3{padding:19px;border:1px solid #e7dcc7;border-radius:9px;background:#fffdf9}.exam-card-v3 h3{margin:0 0 13px;color:#3a3125;font:700 .9rem/1.4 'Noto Serif SC',serif}.exam-mode-v3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.exam-mode-v3 button,.exam-timer-v3 button{padding:12px 8px;border:1px solid #e5d9c4;border-radius:7px;background:#fbf8f1;color:#5e5241;font-size:.72rem}.exam-mode-v3 button.active,.exam-timer-v3 button.active{border-color:#b08a3a;background:#f5ecd7;color:#75551d;box-shadow:inset 0 0 0 1px rgba(176,138,58,.12)}.exam-mode-v3 strong{display:block;margin-bottom:3px;font-size:.78rem}.exam-mode-v3 small{font-size:.63rem;color:#91836d}.exam-composition-v3{display:grid;gap:9px}.exam-composition-v3 div{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid rgba(176,138,58,.12)}.exam-composition-v3 div:first-child{border-top:0}.exam-composition-v3 span{color:#4b4134;font-size:.75rem}.exam-composition-v3 b{color:#946d2a;font-size:.7rem}.exam-timer-v3{display:grid;grid-template-columns:1fr 1fr;gap:8px}.exam-rules-v3{display:grid;gap:8px;color:#6f6250;font-size:.72rem;line-height:1.65}.exam-rules-v3 div{display:grid;grid-template-columns:20px 1fr;gap:8px}.exam-rules-v3 i{width:18px;height:18px;display:grid;place-items:center;border:1px solid rgba(176,138,58,.3);border-radius:50%;font:normal .62rem serif;color:#8b6628}.exam-start-v3{display:flex;justify-content:flex-end;align-items:center;gap:13px;margin-top:16px}.exam-start-v3 small{color:#8f816a;font-size:.67rem}.exam-start-v3 button,.exam-action-primary-v3{border:0;border-radius:999px;background:linear-gradient(135deg,#b68c31,#8d6729);color:#fffdf7;padding:10px 20px;font-size:.75rem;box-shadow:0 5px 15px rgba(141,103,41,.16)}
          .exam-running-v3{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:14px}.exam-question-v3{padding:23px;border:1px solid #e7dcc7;border-radius:9px;background:#fffdf9}.exam-meta-v3{display:flex;justify-content:space-between;color:#8c7e68;font-size:.69rem}.exam-stem-v3{margin:23px 0;color:#342d23;font-size:.92rem;line-height:1.85}.exam-options-v3{display:grid;grid-template-columns:1fr 1fr;gap:8px}.exam-options-v3 button{display:grid;grid-template-columns:25px 1fr;gap:8px;text-align:left;padding:11px;border:1px solid #e5dbc8;border-radius:7px;background:#faf7f0;color:#4b4134;font-size:.72rem}.exam-options-v3 b{color:#8d6729}.exam-side-v3{padding:17px;border:1px solid #e7dcc7;border-radius:9px;background:#fffdf9}.exam-timer-read-v3{font:700 1.35rem/1 'Noto Serif SC',serif;color:#8d6729;text-align:center;margin:5px 0 15px}.exam-grid-v3{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.exam-grid-v3 button{aspect-ratio:1;border:1px solid #e2d7c2;border-radius:5px;background:#fbf8f1;color:#776954;font-size:.65rem}.exam-grid-v3 button.current{border-color:#a77d2e;background:#f5ead1;color:#75551d}.exam-side-actions-v3{display:grid;gap:7px;margin-top:13px}.exam-side-actions-v3 button{padding:8px;border:1px solid #dfd3bd;border-radius:999px;background:#fffdf8;color:#756348;font-size:.68rem}.exam-side-actions-v3 button:last-child{background:#9b752c;color:#fff;border-color:#9b752c}.exam-result-v3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0}.exam-result-v3 div{padding:20px;border:1px solid #e5dbc7;border-radius:8px;background:#fffdf9;text-align:center}.exam-result-v3 strong{display:block;color:#a17a2f;font:700 1.45rem/1.2 'Noto Serif SC',serif}.exam-result-v3 small{color:#837660;font-size:.66rem}.exam-result-note-v3{padding:18px;border:1px solid #e7dcc7;border-radius:9px;background:#fbf7ee;color:#716552;font-size:.75rem;line-height:1.75}
          .quantity-capabilities-v3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:23px}.quantity-capability-v3{padding:18px;border:1px solid #e7dcc7;border-radius:9px;background:#fffdf9}.quantity-capability-v3 b{display:block;color:#342d23;font-size:.84rem;margin-bottom:6px}.quantity-capability-v3 p{margin:0;color:#7d705d;font-size:.7rem;line-height:1.65}.quantity-capability-v3 em{display:inline-block;margin-top:12px;padding:4px 7px;border:1px solid rgba(176,138,58,.25);border-radius:5px;color:#8d6729;font-style:normal;font-size:.63rem}.quantity-flow-v3{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.quantity-flow-v3 div{padding:12px;border-top:2px solid rgba(176,138,58,.4);background:#fbf8f1;color:#4b4134;font-size:.71rem}.quantity-flow-v3 strong{display:block;margin-bottom:4px;color:#8d6729;font-size:.66rem}.quantity-table-v3{margin-top:20px;border:1px solid #e7dcc7;border-radius:9px;overflow:hidden}.quantity-row-v3{display:grid;grid-template-columns:100px 1fr 110px 90px;gap:10px;padding:12px 15px;border-top:1px solid #eee5d4;align-items:center;font-size:.7rem;color:#6f6251}.quantity-row-v3:first-child{border-top:0;background:#f6f0e3;color:#4a4033;font-weight:700}.quantity-row-v3 b{color:#8d6729}.quantity-cta-v3{display:flex;justify-content:space-between;align-items:center;margin-top:17px;padding:14px 16px;border:1px solid #e7dcc7;border-radius:9px;background:linear-gradient(135deg,#fffdf8,#f7efdf)}.quantity-cta-v3 span{color:#5d5140;font-size:.74rem}.quantity-cta-v3 a{padding:9px 16px;border:0;border-radius:999px;background:#9b752c;color:#fffdf8;font-size:.7rem;text-decoration:none;white-space:nowrap}
          .reading-method-v3{min-height:640px;padding:34px 38px!important;text-align:left!important;cursor:default!important}.reading-method-head-v3{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:28px;align-items:end;padding-bottom:24px;border-bottom:1px solid rgba(176,138,58,.18)}.reading-method-head-v3 h2{margin:8px 0 7px;color:#2c2618;font:700 1.5rem/1.4 'Noto Serif SC',serif}.reading-method-head-v3 p{margin:0;color:#786c59;font-size:.76rem;line-height:1.75}.reading-method-note-v3{padding:16px;border-left:3px solid #b08a3a;background:#fbf7ee;color:#665a49;font-size:.72rem;line-height:1.7}.reading-method-grid-v3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}.reading-method-card-v3{padding:20px;border:1px solid #e7dcc7;border-radius:10px;background:#fffdf9}.reading-method-card-v3 b{display:block;color:#342d23;font-size:.88rem}.reading-method-card-v3 p{min-height:72px;margin:9px 0 14px;color:#796d5b;font-size:.72rem;line-height:1.7}.reading-method-card-v3 span{display:block;padding-top:12px;border-top:1px solid rgba(176,138,58,.14);color:#8d6729;font-size:.68rem}.reading-method-apply-v3{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:18px;padding:16px 18px;border:1px solid #e7dcc7;border-radius:10px;background:linear-gradient(135deg,#fffdf8,#f8f1e3)}.reading-method-apply-v3 p{margin:0;color:#625746;font-size:.74rem;line-height:1.65}.reading-method-apply-v3 button{flex:none;border:0;border-radius:999px;background:#9b752c;color:#fffdf8;padding:10px 18px;font-size:.72rem}
          .spatial-inline-v3{min-height:640px;padding:34px 38px!important;text-align:left!important;cursor:default!important}.spatial-inline-v3 h2{margin:8px 0 7px;color:#2c2618;font:700 1.5rem/1.4 'Noto Serif SC',serif}.spatial-inline-v3>p{margin:0;color:#786c59;font-size:.76rem;line-height:1.75}.spatial-tools-v3{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:24px}.spatial-tool-v3{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:19px;border:1px solid #e7dcc7;border-radius:10px;background:#fffdf9;color:inherit;text-decoration:none}.spatial-tool-v3:hover{border-color:#b08a3a;background:#fffaf0}.spatial-tool-v3 i{width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(176,138,58,.3);border-radius:50%;color:#8d6729;font:normal .76rem 'Noto Serif SC',serif}.spatial-tool-v3 b{display:block;color:#342d23;font-size:.86rem}.spatial-tool-v3 span{display:block;margin-top:4px;color:#7d705d;font-size:.69rem;line-height:1.55}.spatial-tool-v3 small{color:#8d6729;font-size:.66rem}
          @media(max-width:760px){.reasoning-home-v3{padding:24px 18px!important}.reasoning-head-v3{display:block}.reasoning-head-v3 p{margin-top:9px;text-align:left}.reasoning-branches-v3{grid-template-columns:1fr}}
          @media(max-width:760px){.review-v3{padding:24px 18px!important}.review-hero-v3{display:block}.review-score-v3{grid-template-columns:repeat(3,1fr);margin-top:18px}.review-issues-v3,.review-bottom-v3{grid-template-columns:1fr}}
          @media(max-width:760px){.exam-v3,.quantity-home-v3,.reading-method-v3,.spatial-inline-v3{padding:24px 18px!important}.exam-config-v3,.exam-running-v3,.reading-method-head-v3{grid-template-columns:1fr}.exam-mode-v3,.quantity-capabilities-v3,.reading-method-grid-v3,.spatial-tools-v3{grid-template-columns:1fr}.exam-options-v3{grid-template-columns:1fr}.quantity-flow-v3{grid-template-columns:1fr 1fr}.quantity-row-v3{grid-template-columns:76px 1fr}.quantity-row-v3>*:nth-child(n+3){display:none}.reading-method-apply-v3{align-items:flex-start;flex-direction:column}}
        `;
        document.head.appendChild(style);

        const nav = document.createElement('div');
        nav.className = 'reasoning-subnav-v3';
        nav.innerHTML = `<div class="deck-tabs"><button class="deck-tab active" data-reasoning-v3="home">${icon.graph}图推总览</button><button class="deck-tab" data-reasoning-v3="plane">${icon.map}平面规律</button><button class="deck-tab" data-reasoning-v3="spatial">${icon.cube}立体空间</button><button class="deck-tab" data-reasoning-v3="review">${icon.review}我的复盘</button></div>`;
        verbalNav.after(nav);

        function activeCoachModuleV3() {
            if (existingGraph?.classList.contains('active')) return '图形推理';
            if (deckTabs.querySelector('[data-deck="math"]')?.classList.contains('active')) return '数量关系';
            return '言语理解';
        }
        function openUnifiedCoachV3(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            location.href = `/ai-coach?module=${encodeURIComponent(activeCoachModuleV3())}`;
        }
        document.getElementById('aiCoachDeckEntry')?.addEventListener('click', openUnifiedCoachV3, { capture:true });
        document.querySelector('.xi-logo-seal')?.addEventListener('click', openUnifiedCoachV3, { capture:true });

        function coachUrl(context) {
            return `/ai-coach?module=${encodeURIComponent('图形推理')}`;
        }
        function renderReviewV3() {
            learningZone.innerHTML = `<div class="big-card review-v3"><header class="review-hero-v3"><div><div class="review-eyebrow-v3">${icon.review}<span>本周复盘</span></div><h2>把出错变成下一步</h2><p>这里只保留能继续训练的问题和变化，不堆积聊天记录。</p></div><div class="review-score-v3"><div><strong>20</strong><small>本周完成</small></div><div><strong>2</strong><small>需要处理</small></div><div><strong>1</strong><small>已有改善</small></div></div></header><section class="review-section-v3"><div class="review-section-head-v3"><h3>最近容易错在哪里</h3><span>来自真实作答记录</span></div><div class="review-issues-v3"><article class="review-issue-v3"><div class="review-issue-top-v3"><b>容易把“问题”当成文段主旨</b><em>已连续出现 5 次</em></div><p>第 01 套的错题都停在问题描述，没有继续看作者最后要推向的对策。</p><div class="review-action-v3"><span>下一步：做 5 道同类题前先复习片段方法</span><button type="button" data-review-start-v3="reading">查看方法</button></div></article><article class="review-issue-v3"><div class="review-issue-top-v3"><b>转折后的选词方向还不稳定</b><em>再做 5 题后判断</em></div><p>目前只出现 2 次，还不足以说明是稳定问题，先补一组逻辑填空。</p><div class="review-action-v3"><span>下一步：补做转折语境逻辑填空</span><button type="button" data-review-start-v3="logic">补齐样本</button></div></article></div></section><div class="review-bottom-v3"><section class="review-panel-v3"><div class="review-section-head-v3"><h3>练完以后有没有改善</h3><span>近三次</span></div><div class="review-timeline-v3"><div><span>07-13</span><i></i><p><b>片段阅读·对策主体</b>5 题做对 4 题，比上次少错 2 题。</p></div><div><span>07-12</span><i></i><p><b>第 01 套·交卷</b>20 题完成，定位到主要错误。</p></div><div><span>07-11</span><i></i><p><b>逻辑填空·转折关系</b>样本还少，暂不下结论。</p></div></div></section><section class="review-panel-v3"><div class="review-section-head-v3"><h3>已处理的问题</h3><span>不反复打扰</span></div><div class="review-empty-v3"><div><strong>已改善 1 项</strong>“对策主体丢失”在最近 5 题中只出现 1 次，继续观察，暂不重复安排。</div></div></section></div></div>`;
            rightPanel.innerHTML = `<section class="context-card-v2"><div class="context-title-v2">${icon.review}今天先做什么</div><p class="context-sub-v2">按“先处理反复出错，再补齐样本”排序。</p><div class="review-next-v3"><a href="/verbal-reading-pilot.html"><b>先做</b><span>问题与对策专项</span><small>5题</small></a><a href="#"><b>后做</b><span>转折语境逻辑填空</span><small>5题</small></a></div></section><section class="context-card-v2 coach-card-v2"><div class="context-title-v2">${icon.graph}问西西</div><p class="context-sub-v2">可以追问某个错误为什么反复出现；只有真实学习记录会成为弱项证据。</p><div class="coach-actions-v2"><a class="btn-sm" style="text-align:center;text-decoration:none" href="/ai-coach?module=${encodeURIComponent('言语理解')}">进入 AI 教练</a></div></section>`;
        }
        function renderExamV3(state='setup') {
            if (state === 'setup') {
                learningZone.innerHTML = `<div class="big-card exam-v3"><header class="exam-head-v3"><div><div class="review-eyebrow-v3">${icon.review}<span>套题实战</span></div><h2>先设定这次怎么练</h2><p>组卷页只负责训练配置，作答中保持极简，交卷后再复盘用时与取舍。</p></div><span class="exam-state-v3">01 · 创建实战</span></header><div class="exam-config-v3"><section class="exam-card-v3"><h3>训练模式</h3><div class="exam-mode-v3"><button class="active" type="button"><strong>言语专项</strong><small>逻辑填空 + 片段阅读</small></button><button type="button"><strong>数量专项</strong><small>完成题库交接后开放</small></button><button type="button"><strong>行测混合</strong><small>完成双题库接入后开放</small></button></div><h3 style="margin-top:19px">题型构成</h3><div class="exam-composition-v3"><div><span>逻辑填空</span><b>10 题</b></div><div><span>片段阅读</span><b>10 题</b></div><div><span>本次合计</span><b>20 题</b></div></div></section><section class="exam-card-v3"><h3>计时方式</h3><div class="exam-timer-v3"><button class="active" type="button">倒计时·32分钟</button><button type="button">正计时·不限时</button></div><h3 style="margin-top:19px">本次做题规则</h3><div class="exam-rules-v3"><div><i>1</i><span>先做问法明确、熟悉的题型。</span></div><div><i>2</i><span>犹豫超过 60 秒先标记，不在单题上硬耗。</span></div><div><i>3</i><span>交卷后查看哪些题应该更早跳过。</span></div></div></section></div><div class="exam-start-v3"><small>Phase 1 先验收三态界面，Phase 3 接入真实组卷数据。</small><button type="button" data-exam-start-v3>预览作答流程</button></div></div>`;
            } else if (state === 'running') {
                learningZone.innerHTML = `<div class="big-card exam-v3"><header class="exam-head-v3"><div><div class="review-eyebrow-v3">${icon.review}<span>言语专项·流程预览</span></div><h2>第 1 题 / 共 20 题</h2></div><span class="exam-state-v3">02 · 作答中</span></header><div class="exam-running-v3"><section class="exam-question-v3"><div class="exam-meta-v3"><span>逻辑填空·转折关系</span><span>本题 00:00</span></div><p class="exam-stem-v3">真实题库将在 Phase 3 进入这个作答位置；交卷前不显示答案、原解析或 AI 讲解。</p><div class="exam-options-v3"><button type="button"><b>A</b><span>选项位置</span></button><button type="button"><b>B</b><span>选项位置</span></button><button type="button"><b>C</b><span>选项位置</span></button><button type="button"><b>D</b><span>选项位置</span></button></div></section><aside class="exam-side-v3"><div class="exam-timer-read-v3">32:00</div><div class="exam-grid-v3">${Array.from({length:20},(_,i)=>`<button class="${i===0?'current':''}" type="button">${i+1}</button>`).join('')}</div><div class="exam-side-actions-v3"><button type="button">标记本题</button><button type="button">先跳过</button><button type="button" data-exam-result-v3>查看交卷复盘预览</button></div></aside></div></div>`;
            } else {
                learningZone.innerHTML = `<div class="big-card exam-v3"><header class="exam-head-v3"><div><div class="review-eyebrow-v3">${icon.review}<span>套题结果·流程预览</span></div><h2>交卷后先看客观结果</h2><p>正式数值由真实作答生成，不在界面原型中伪造成绩。</p></div><span class="exam-state-v3">03 · 交卷后</span></header><div class="exam-result-v3"><div><strong>—</strong><small>正确率</small></div><div><strong>—</strong><small>实际用时</small></div><div><strong>—</strong><small>标记/跳过</small></div></div><div class="exam-result-note-v3"><strong>完成后这里会回答三个问题：</strong><br>① 哪个题型丢分最多；② 哪些题用时过长或应该更早跳过；③ 下一组训练应该如何调整做题顺序。AI 只在客观结果之后做解释。</div><div class="exam-start-v3"><button type="button" data-exam-reset-v3>返回组卷</button></div></div>`;
            }
            rightPanel.innerHTML = `<section class="context-card-v2"><div class="context-title-v2">${icon.review}本次实战</div><p class="context-sub-v2">言语和数量分别进入真实服务端套题，混合模式暂不以假数据开放。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>30</strong><small>言语套数</small></div><div class="context-metric-v2"><strong>60</strong><small>数量套数</small></div><div class="context-metric-v2"><strong>0</strong><small>假组卷</small></div></div></section><section class="context-card-v2"><div class="context-title-v2">${icon.graph}考场规则</div><div class="reasoning-evidence-v3"><div><b>先做</b><span>问法明确的熟悉题</span><small>稳定拿分</small></div><div><b>标记</b><span>犹豫超过 60 秒</span><small>暂跳</small></div></div></section>`;
            if (state === 'setup') {
                const modes = learningZone.querySelectorAll('.exam-mode-v3 button');
                if (modes[0]) {
                    modes[0].querySelector('small').textContent = '30 套片段阅读 · 每套 20 题';
                    modes[0].onclick = () => { location.href = '/verbal-reading-pilot.html'; };
                }
                if (modes[1]) {
                    modes[1].querySelector('small').textContent = '60 套数量关系 · 每套 10 题';
                    modes[1].onclick = () => { location.href = '/quantity-practice.html'; };
                }
                if (modes[2]) {
                    modes[2].disabled = true;
                    modes[2].querySelector('small').textContent = '本阶段明确不开放';
                }
                const start = learningZone.querySelector('[data-exam-start-v3]');
                if (start) start.textContent = '开始真实言语专项';
                const note = learningZone.querySelector('.exam-start-v3 small');
                if (note) note.textContent = '言语与数量分别进入真实服务端套题；混合组卷不使用假数据。';
            }
        }
        const quantityViewsV3 = {
            quantityToday: {
                title:'今日数量训练', desc:'不先讲一大页说明，直接完成一题诊断，再按结果决定今天练哪一类。',
                cards:[['先做一题','系统记录题型判断、答案、用时与卡点。','真实单题'],['再看建议','根据这一题判断继续同类题，还是先补方法。','动态下一步'],['最后复盘','提交后才能看答案，并可携带本题上下文问西西。','答案后置']],
                flow:[['1','开始单题'],['2','记录卡点'],['3','提交看解析'],['4','决定下一题']],
                rows:[['当前任务','完成一题真实诊断','约 1—3 分钟','立即开始'],['完成以后','查看题型与方法建议','按作答生成','继续或换题']],
                note:'今天先用真实作答确定起点，不再停留在说明卡。', href:'/quantity-single.html', cta:'开始今日第一题'
            },
            quantitySingle: {
                title:'单题诊断', desc:'只处理一道题：看出了什么、选了什么方法、用了多久、卡在哪一步。',
                cards:[['题型识别','从题干识别工程、利润、行程、容斥等类型。','看懂'],['方法与步骤','比较赋值、方程、比例、代入等路径。','会做'],['卡点记录','记录单题时间和真正卡住的步骤。','说清']],
                flow:[['1','读题识别'],['2','选择答案'],['3','记录步骤'],['4','提交诊断']],
                rows:[['作答前','不展示答案和官方解析','建议按题目','独立完成'],['作答后','给出解析与同题型下一步','基于真实记录','问西西']],
                note:'提交前 AI 也不会泄露正确答案；提交后可带本题记录继续追问。', href:'/quantity-single.html', cta:'进入单题诊断'
            },
            quantitySet: {
                title:'套题取舍', desc:'目标不是把 10 题全部硬做，而是在限时里安排必做 / 可做 / 先跳。',
                cards:[['必做题','模型明确、计算可控，优先拿到稳定分。','先做'],['可做题','条件清楚且方法熟悉时再进入。','后做'],['先跳题','建模长或计算量大，先留出整套时间。','标记']],
                flow:[['1','扫题排序'],['2','优先必做'],['3','回收可做'],['4','交卷复盘']],
                rows:[['正式套题','每套 10 道真实题','整套计时','开始套题'],['过程记录','保存答案、跳题和卡点','自动保存','刷新可续']],
                note:'套题页只负责真实作答、计时与交卷，不再重复单题说明。', href:'/quantity-practice.html', cta:'开始 10 题套题'
            },
            quantityType: {
                title:'系统学题型', desc:'按照“更值得先做”的顺序查看真实题型，再从题库抽取同题型原题专项训练。',
                cards:[['优先顺序','依据题库标签与考场价值排列，不按名称罗列。','先学什么'],['题型方法','每类显示识别信号、常见方法与建议用时。','怎么做'],['同类原题','从正式题库进入该题型单题训练，同类题确认是否掌握。','马上练']],
                flow:[['1','看优先级'],['2','选题型'],['3','学识别方法'],['4','练同类题']],
                rows:[['基础高频','工程、利润、比例等','优先掌握','专项训练'],['复杂题型','排列组合、几何等','先会取舍','按需进入']],
                note:'题型列表会真正切换训练内容，不再只是静态标签。', href:'/quantity-topics.html', cta:'查看题型学习顺序'
            },
            quantityReview: {
                title:'数量复盘', desc:'把最近作答整理成“问题—证据—下一步”，并明确推荐接下来练什么。',
                cards:[['哪里出错','区分题型没识别、方法选慢、步骤卡住和算错。','问题'],['证据够不够','只根据真实题目、用时与卡点判断，不编造弱项。','证据'],['下一步练什么','给出可直接进入的同题型单题或整套训练。','行动']],
                flow:[['1','看最近记录'],['2','找重复问题'],['3','确认是否改善'],['4','执行下一步']],
                rows:[['单题记录','答案、用时、方法与卡点','逐题查看','同类再练'],['套题记录','正确率、取舍与做题顺序','整套查看','调整策略']],
                note:'复盘只保留能指导下一次训练的内容，避免堆一页没有行动的统计。', href:'/quantity-review.html', cta:'打开我的数量复盘'
            }
        };
        function renderQuantityV3(kind) {
            const view = quantityViewsV3[kind] || quantityViewsV3.quantityToday;
            learningZone.innerHTML = `<div class="big-card quantity-home-v3"><div class="review-eyebrow-v3">${icon.graph}<span>数量关系·${view.title}</span></div><h2>${view.title}</h2><p>${view.desc}</p><div class="quantity-capabilities-v3">${view.cards.map(card=>`<article class="quantity-capability-v3"><b>${card[0]}</b><p>${card[1]}</p><em>${card[2]}</em></article>`).join('')}</div><div class="quantity-flow-v3">${view.flow.map(step=>`<div><strong>${step[0]}</strong>${step[1]}</div>`).join('')}</div><div class="quantity-table-v3"><div class="quantity-row-v3"><span>阶段</span><span>真实功能</span><span>建议用时</span><span>训练动作</span></div>${view.rows.map(row=>`<div class="quantity-row-v3"><b>${row[0]}</b><span>${row[1]}</span><span>${row[2]}</span><span>${row[3]}</span></div>`).join('')}</div><div class="quantity-cta-v3"><span>${view.note}</span><a href="${view.href}">${view.cta}</a></div></div>`;
        }
        function renderReadingMethodV3() {
            learningZone.innerHTML = `<div class="big-card reading-method-v3"><header class="reading-method-head-v3"><div><div class="review-eyebrow-v3">${icon.map}<span>言语理解·片段方法</span></div><h2>先按问法读，再进套题验证</h2><p>这里学习片段阅读的方法，不和 20 题限时套题重复。切换标签时内容直接在当前页更新。</p></div><div class="reading-method-note-v3">先看题目问什么，再决定抓主旨、找细节还是判断句子作用；不要从第一句开始平均用力。</div></header><div class="reading-method-grid-v3"><article class="reading-method-card-v3"><b>中心理解</b><p>先找作者最终要表达的结论，区分“描述的问题”和“主张的对策”。</p><span>信号：因此、可见、需要、关键在于</span></article><article class="reading-method-card-v3"><b>细节判断</b><p>回到原文逐项核对范围、程度、条件与对象，不凭印象选“差不多”。</p><span>信号：根据文段，下列说法正确的是</span></article><article class="reading-method-card-v3"><b>语句理解</b><p>结合前后关系判断代词、句子作用与隐含指向，避免只解释字面。</p><span>信号：这句话意在说明、承接上文</span></article></div><div class="reading-method-apply-v3"><p><strong>下一步：</strong>方法看完后切到“限时套题”，用真实 20 题检验；作答页只保留题目、进度和交卷后的复盘。</p><button type="button" data-reading-to-exam-v3>去限时套题</button></div></div>`;
            rightPanel.innerHTML = `<section class="context-card-v2"><div class="context-title-v2">${icon.map}片段方法定位</div><p class="context-sub-v2">这个标签只学习问法和阅读路径，不与 20 题套题重复。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>3</strong><small>方法类型</small></div><div class="context-metric-v2"><strong>20</strong><small>套题题数</small></div><div class="context-metric-v2"><strong>0</strong><small>提前泄题</small></div></div></section><section class="context-card-v2"><div class="context-title-v2">${icon.review}建议顺序</div><div class="reasoning-evidence-v3"><div><b>先看</b><span>题目问法与定位信号</span><small>当前页</small></div><div><b>再练</b><span>20 题限时套题</span><small>真实作答</small></div></div></section><section class="context-card-v2 coach-card-v2"><div class="context-title-v2">${icon.graph}下一步</div><p class="context-sub-v2">看完方法后进入限时套题，用作答结果决定是否需要同类强化。</p><div class="coach-actions-v2"><button class="btn-sm" type="button" data-reading-to-exam-v3>去限时套题</button><a class="btn-sm" style="text-align:center;text-decoration:none" href="/ai-coach?module=${encodeURIComponent('言语理解')}">问西西</a></div></section>`;
        }
        function renderSpatialV3() {
            learningZone.innerHTML = `<div class="big-card spatial-inline-v3"><div class="review-eyebrow-v3">${icon.cube}<span>图形推理·立体空间</span></div><h2>直接进入要练的空间工具</h2><p>不再先跳到一层介绍页。四个入口都对应真实可操作页面，学习顺序仍然保留。</p><div class="spatial-tools-v3"><a class="spatial-tool-v3" href="/section-foundation.html"><i>1</i><div><b>基础截面</b><span>先看懂几何体能截出什么，再判断切法。</span></div><small>开始</small></a><a class="spatial-tool-v3" href="/three-view-training.html"><i>2</i><div><b>三视图训练</b><span>记录真实答案与用时，练方向和投影判断。</span></div><small>练习</small></a><a class="spatial-tool-v3" href="/geometry.html"><i>3</i><div><b>自由切面</b><span>拖动切面观察截形变化，验证空间想象。</span></div><small>实验</small></a><a class="spatial-tool-v3" href="/csg-section.html"><i>4</i><div><b>组合体切割</b><span>处理组合体与相贯关系，查看截面数据。</span></div><small>进阶</small></a></div></div>`;
        }
        function renderHome() {
            learningZone.innerHTML = `<div class="big-card reasoning-home-v3"><div class="reasoning-kicker-v3">${icon.graph}<span>图形推理·学习入口</span></div><div class="reasoning-head-v3"><h2>先识别规律，再建立空间</h2><p>平面图推进入规律导图；立体空间先在当前页选择具体工具，不再多跳一层介绍页。</p></div><div class="reasoning-branches-v3"><section class="reasoning-branch-v3" data-mark="平"><h3>平面规律</h3><p>位置、样式、属性、数量四类规律，配合错题节点回看。</p><div class="reasoning-path-v3"><a class="reasoning-step-v3" href="/mindmap.html"><i>1</i><span>规律思维导图</span><small>进入</small></a><a class="reasoning-step-v3" href="/mindmap.html?tab=review"><i>2</i><span>错题归类与间隔复习</span><small>继续</small></a></div><a class="reasoning-branch-action-v3" href="/mindmap.html">打开平面图推</a></section><section class="reasoning-branch-v3" data-mark="立"><h3>立体空间</h3><p>基础截面、三视图、自由切面、组合体切割组成四段真实工具链。</p><div class="reasoning-path-v3"><button class="reasoning-step-v3" type="button" data-open-spatial-v3><i>1</i><span>选择立体空间工具</span><small>当前页展开</small></button><a class="reasoning-step-v3" href="/three-view-training.html"><i>2</i><span>三视图专项</span><small>直接练习</small></a></div><button class="reasoning-branch-action-v3" type="button" data-open-spatial-v3>查看四个工具</button></section></div></div>`;
            renderRight('图推总览');
        }
        function renderRight(context) {
            rightPanel.innerHTML = `<section class="context-card-v2"><div class="context-title-v2">${icon.graph}图推学习证据</div><p class="context-sub-v2">平面规律与立体空间分开记录，不用访问实验页次数伪造正确率。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>4</strong><small>平面规律</small></div><div class="context-metric-v2"><strong>4</strong><small>立体阶段</small></div><div class="context-metric-v2"><strong>5</strong><small>待复盘</small></div></div></section><section class="context-card-v2"><div class="context-title-v2">${icon.review}当前建议</div><div class="reasoning-evidence-v3"><div><b>先练</b><span>三视图方向判断</span><small>5题</small></div><div><b>再验</b><span>长方体倾斜截面</span><small>实验</small></div></div></section><section class="context-card-v2 coach-card-v2"><div class="context-title-v2">${icon.graph}问西西</div><p class="context-sub-v2">从当前板块进入时，携带导图节点、题目或几何模型上下文。</p><div class="coach-actions-v2"><a class="btn-sm" style="text-align:center;text-decoration:none" href="${coachUrl(context)}">带上下文提问</a><button class="btn-sm" data-reasoning-review>查看复盘</button></div></section>`;
        }
        function enterReasoning(view='home') {
            deckTabs.querySelectorAll('.deck-tab').forEach(btn => btn.classList.toggle('active', btn === existingGraph));
            verbalNav.style.display = 'none';
            nav.style.display = 'block';
            document.querySelector('.study-card-container > .card-header')?.style.setProperty('display','none');
            nav.querySelectorAll('[data-reasoning-v3]').forEach(btn => btn.classList.toggle('active', btn.dataset.reasoningV3 === view));
            renderHome();
        }
        existingGraph?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            enterReasoning();
        }, { capture:true });
        nav.addEventListener('click', event => {
            const btn = event.target.closest('[data-reasoning-v3]');
            if (!btn) return;
            const view = btn.dataset.reasoningV3;
            if (view === 'plane') return location.href = '/mindmap.html';
            if (view === 'spatial') { enterReasoning(view); renderSpatialV3(); renderRight('立体空间'); return; }
            if (view === 'review') { enterReasoning(view); renderRight('图推复盘'); return; }
            enterReasoning(view);
        });
        verbalNav.addEventListener('click', event => {
            const vocabButton = event.target.closest('[data-verbal-demo="vocab"]');
            if (vocabButton) {
                event.preventDefault();
                event.stopPropagation();
                verbalNav.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button === vocabButton));
                if (typeof window.switchDeck === 'function') window.switchDeck('idiom');
                return;
            }
            const logicButton = event.target.closest('[data-verbal-demo="logic"]');
            if (logicButton) {
                event.preventDefault();
                event.stopPropagation();
                verbalNav.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button === logicButton));
                if (typeof window.switchDeck === 'function') window.switchDeck('verbal');
                return;
            }
            const readingButton = event.target.closest('[data-verbal-demo="reading"]');
            if (readingButton) {
                event.preventDefault();
                event.stopPropagation();
                verbalNav.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button === readingButton));
                document.getElementById('modeSwitchGroup').style.display = 'none';
                document.getElementById('queueBadge').style.display = 'none';
                renderReadingMethodV3();
                return;
            }
            const examButton = event.target.closest('[data-verbal-demo="exam"]');
            if (examButton) {
                event.preventDefault();
                event.stopPropagation();
                verbalNav.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button === examButton));
                document.getElementById('modeSwitchGroup').style.display = 'none';
                document.getElementById('queueBadge').style.display = 'none';
                renderExamV3('setup');
                return;
            }
            const reviewButton = event.target.closest('[data-verbal-demo="review"]');
            if (!reviewButton) return;
            event.preventDefault();
            event.stopPropagation();
            verbalNav.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button === reviewButton));
            document.getElementById('modeSwitchGroup').style.display = 'none';
            document.getElementById('queueBadge').style.display = 'none';
            renderReviewV3();
        }, { capture:true });
        verbalNav.addEventListener('click', event => {
            const quantityButton = event.target.closest('[data-quantity-demo]');
            if (!quantityButton) return;
            event.preventDefault();
            event.stopPropagation();
            verbalNav.querySelectorAll('[data-quantity-demo]').forEach(button => button.classList.toggle('active', button === quantityButton));
            document.getElementById('modeSwitchGroup').style.display = 'none';
            document.getElementById('queueBadge').style.display = 'none';
            renderQuantityV3(quantityButton.dataset.quantityDemo);
        }, { capture:true });
        learningZone.addEventListener('click', event => {
            if (event.target.closest('[data-reading-to-exam-v3]')) verbalNav.querySelector('[data-verbal-demo="exam"]')?.click();
            else if (event.target.closest('[data-open-spatial-v3]')) { enterReasoning('spatial'); renderSpatialV3(); renderRight('立体空间'); }
            else if (event.target.closest('[data-review-start-v3="reading"]')) verbalNav.querySelector('[data-verbal-demo="reading"]')?.click();
            else if (event.target.closest('[data-review-start-v3="logic"]')) verbalNav.querySelector('[data-verbal-demo="logic"]')?.click();
            else if (event.target.closest('[data-exam-start-v3]')) location.href = '/verbal-reading-pilot.html';
            else if (event.target.closest('[data-exam-result-v3]')) renderExamV3('result');
            else if (event.target.closest('[data-exam-reset-v3]')) renderExamV3('setup');
        });
        rightPanel.addEventListener('click', event => {
            if (event.target.closest('[data-reading-to-exam-v3]')) {
                event.preventDefault();
                verbalNav.querySelector('[data-verbal-demo="exam"]')?.click();
                return;
            }
            const start = event.target.closest('[data-v2-start]');
            if (!start) return;
            event.preventDefault();
            const activeQuantity = verbalNav.querySelector('[data-quantity-demo].active')?.dataset.quantityDemo;
            if (activeQuantity) {
                location.href = (quantityViewsV3[activeQuantity] || quantityViewsV3.quantityToday).href;
                return;
            }
            const activeVerbal = verbalNav.querySelector('[data-verbal-demo].active')?.dataset.verbalDemo;
            if (activeVerbal === 'reading') verbalNav.querySelector('[data-verbal-demo="exam"]')?.click();
            else if (activeVerbal === 'exam') location.href = '/verbal-reading-pilot.html';
            else if (activeVerbal === 'review') verbalNav.querySelector('[data-verbal-demo="reading"]')?.click();
            else if (typeof window.switchDeck === 'function') window.switchDeck('verbal');
        });
        deckTabs.addEventListener('click', event => {
            if (event.target.closest('#reasoningDeckEntryV3')) return;
            if (event.target.closest('[data-deck]')) {
                nav.style.display = 'none';
                verbalNav.style.display = '';
                document.querySelector('.study-card-container > .card-header')?.style.removeProperty('display');
                setTimeout(() => {
                    const note = verbalNav.querySelector('.verbal-demo-note');
                    if (note) note.textContent = '公途统一学习页';
                }, 0);
            }
        });
    }
    boot();
})();
