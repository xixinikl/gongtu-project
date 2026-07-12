(function () {
    if (window.__verbalAiNativeDemoV2Loaded) return;
    window.__verbalAiNativeDemoV2Loaded = true;

    function boot() {
        const rightPanel = document.querySelector('.right-panel');
        if (!rightPanel || !document.querySelector('.verbal-ai-plan')) {
            setTimeout(boot, 30);
            return;
        }

        document.body.classList.add('verbal-ai-v2');
        const style = document.createElement('style');
        style.textContent = `
            .verbal-ai-v2 .right-panel > .stats-dashboard,
            .verbal-ai-v2 .right-panel > .progress-card,
            .verbal-ai-v2 .right-panel > #dailyPlanCard,
            .verbal-ai-v2 .right-panel > .verbal-ai-plan,
            .verbal-ai-v2 .right-panel > .heatmap-card,
            .verbal-ai-v2 .right-panel > .idiom-gallery { display:none !important; }
            .context-right-v2 { display:flex; flex-direction:column; gap:14px; }
            .context-card-v2 { background:#fefdf9; border:1px solid #ebe3d2; border-radius:12px; padding:18px 20px; box-shadow:0 1px 4px rgba(0,0,0,.04); }
            .context-title-v2 { display:flex; align-items:center; gap:7px; color:#2c2618; font-family:'Noto Serif SC',serif; font-size:.92rem; font-weight:600; }
            .context-title-v2 svg { flex:none; }
            .context-sub-v2 { margin:6px 0 0; color:#7a6e58; font-size:.74rem; line-height:1.6; }
            .context-metrics-v2 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:14px; }
            .context-metric-v2 { padding:11px 7px; border:1px solid #eee6d7; border-radius:9px; text-align:center; background:#fffefb; }
            .context-metric-v2 strong { display:block; color:#b08a3a; font-family:'Noto Serif SC',serif; font-size:1.3rem; }
            .context-metric-v2 small { color:#7a6e58; font-size:.66rem; }
            .strategy-list-v2 { display:grid; gap:8px; margin-top:13px; }
            .strategy-row-v2 { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:9px; padding:9px 0; border-top:1px solid rgba(176,138,58,.12); }
            .strategy-row-v2:first-child { border-top:0; }
            .strategy-seal-v2 { min-width:36px; padding:4px 6px; border:1px solid rgba(176,138,58,.28); border-radius:6px; color:#8d6729; background:#faf7f0; font-family:'Noto Serif SC',serif; font-size:.68rem; text-align:center; }
            .strategy-copy-v2 strong { display:block; color:#2c2618; font-size:.8rem; }
            .strategy-copy-v2 small { color:#8b806d; font-size:.69rem; }
            .strategy-value-v2 { color:#a77d2e; font-size:.7rem; white-space:nowrap; }
            .coach-card-v2 { position:relative; background:linear-gradient(145deg,#fefdf9,#fbf7ee); }
            .coach-card-v2::after { content:'师'; position:absolute; top:14px; right:17px; color:rgba(176,138,58,.24); font-family:'ZCOOL XiaoWei','Ma Shan Zheng','KaiTi',serif; font-size:1.35rem; }
            .coach-actions-v2 { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:12px; }
            .coach-actions-v2 .btn-sm { width:100%; }
            @media(max-width:900px){.context-right-v2{display:grid;grid-template-columns:1fr 1fr}.coach-card-v2{grid-column:1/-1}}
            @media(max-width:620px){.context-right-v2{display:flex}.context-metrics-v2{grid-template-columns:repeat(3,1fr)}}
        `;
        document.head.appendChild(style);

        const icon = {
            plan: `<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><rect x="2.5" y="2.5" width="12" height="12" rx="1.2" stroke="#c9a96e" stroke-width="1"/><path d="M5 6h7M5 9h5M5 12h6" stroke="#c9a96e" stroke-width=".7" stroke-linecap="round"/></svg>`,
            evidence: `<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="6.5" stroke="#c9a96e" stroke-width="1"/><path d="M5.5 10.5l2-2 1.7 1.5 2.5-3" stroke="#c9a96e" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            coach: `<svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M8.5 2c.5 1.8 1.6 2.9 3.4 3.4-1.8.5-2.9 1.6-3.4 3.4C8 7 6.9 5.9 5.1 5.4 6.9 4.9 8 3.8 8.5 2z" stroke="#c9a96e" stroke-width="1"/><path d="M4 12h9M6 14.5h5" stroke="#c9a96e" stroke-width=".8" stroke-linecap="round"/></svg>`
        };

        const panel = document.createElement('div');
        panel.className = 'context-right-v2';
        rightPanel.prepend(panel);

        function card(title, iconSvg, body, extraClass='') {
            return `<section class="context-card-v2 ${extraClass}"><div class="context-title-v2">${iconSvg}${title}</div>${body}</section>`;
        }

        const views = {
            vocab: () => card('词语学习状态',icon.evidence,`<p class="context-sub-v2">只保留词库真正需要的记忆与复习信息。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>801</strong><small>高频词</small></div><div class="context-metric-v2"><strong>12</strong><small>今日到期</small></div><div class="context-metric-v2"><strong>5</strong><small>来自错题</small></div></div>`) + card('今日复习顺序',icon.plan,`<div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">先</span><div class="strategy-copy-v2"><strong>易忘词</strong><small>近期错题中出现</small></div><span class="strategy-value-v2">5个</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">后</span><div class="strategy-copy-v2"><strong>到期新词</strong><small>按复习计划进入</small></div><span class="strategy-value-v2">7个</span></div></div>`) + coach('复习后回到对应错题，检查能否在语境中辨认。'),
            logic: () => card('逻辑填空证据',icon.evidence,`<p class="context-sub-v2">按语境、词义和搭配统计，不沿用成语记忆指标。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>231</strong><small>正式题</small></div><div class="context-metric-v2"><strong>68%</strong><small>近期正确率</small></div><div class="context-metric-v2"><strong>2</strong><small>转折错误</small></div></div>`) + card('下一组怎么练',icon.plan,`<div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">补证</span><div class="strategy-copy-v2"><strong>转折语境专项</strong><small>目前证据还不够强</small></div><span class="strategy-value-v2">5题</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">回词库</span><div class="strategy-copy-v2"><strong>错题词语复习</strong><small>练后自动进入易忘队列</small></div><span class="strategy-value-v2">3词</span></div></div>`) + coach('先判断语境关系，再比较词义；本轮结束后更新证据强度。'),
            reading: () => card('片段阅读证据',icon.evidence,`<p class="context-sub-v2">围绕题型、结构、干扰项和弱步骤形成诊断。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>600</strong><small>正式题</small></div><div class="context-metric-v2"><strong>20</strong><small>已完成</small></div><div class="context-metric-v2"><strong>15</strong><small>待强化</small></div></div>`) + card('下一轮训练',icon.plan,`<div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">强项</span><div class="strategy-copy-v2"><strong>继续第02套</strong><small>从AI推荐第18题进入</small></div><span class="strategy-value-v2">0/20</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">弱项</span><div class="strategy-copy-v2"><strong>问题项/对策项</strong><small>来自5道真实错题</small></div><span class="strategy-value-v2">5题</span></div></div>`) + coach('当前弱项证据较强，先做同类原题，不急着再刷新套题。'),
            exam: () => card('本次实战',icon.evidence,`<p class="context-sub-v2">只关注混合题的时间分配与做题顺序。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>20</strong><small>题目</small></div><div class="context-metric-v2"><strong>32</strong><small>建议分钟</small></div><div class="context-metric-v2"><strong>0</strong><small>已完成</small></div></div>`) + card('考场安排',icon.plan,`<div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">先做</span><div class="strategy-copy-v2"><strong>熟悉题型</strong><small>优先稳定拿分</small></div><span class="strategy-value-v2">建议</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">标记</span><div class="strategy-copy-v2"><strong>犹豫超过60秒</strong><small>暂跳并记录</small></div><span class="strategy-value-v2">规则</span></div></div>`) + coach('完成后综合分析正确率、用时和放弃策略。'),
            review: () => card('言语问题本',icon.evidence,`<p class="context-sub-v2">只保留可以继续训练的结论，不堆积聊天记录。</p><div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">强证据</span><div class="strategy-copy-v2"><strong>问题项容易冒充主旨</strong><small>片段阅读5道错题</small></div><span class="strategy-value-v2">待强化</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">待验证</span><div class="strategy-copy-v2"><strong>转折后选词方向</strong><small>逻辑填空2次记录</small></div><span class="strategy-value-v2">补5题</span></div></div>`) + coach('从强证据开始训练，再补充疑似弱项的样本。'),
            quantity: () => card('数量考场画像',icon.evidence,`<p class="context-sub-v2">数量不套用言语的正确率结构，重点看取舍、方法和速度。</p><div class="context-metrics-v2"><div class="context-metric-v2"><strong>5</strong><small>必做题</small></div><div class="context-metric-v2"><strong>3</strong><small>可做题</small></div><div class="context-metric-v2"><strong>2</strong><small>先跳题</small></div></div>`) + card('本轮做题顺序',icon.plan,`<div class="strategy-list-v2"><div class="strategy-row-v2"><span class="strategy-seal-v2">必做</span><div class="strategy-copy-v2"><strong>工程、利润、比例</strong><small>题干短、方法稳定</small></div><span class="strategy-value-v2">≤80秒</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">可做</span><div class="strategy-copy-v2"><strong>行程与容斥</strong><small>条件清楚再进入</small></div><span class="strategy-value-v2">看题况</span></div><div class="strategy-row-v2"><span class="strategy-seal-v2">先跳</span><div class="strategy-copy-v2"><strong>复杂排列与几何</strong><small>先训练识别，不硬算</small></div><span class="strategy-value-v2">保时间</span></div></div>`) + coach('先判断值不值得做，再决定用赋值、方程还是直接跳过。')
        };

        function coach(text) {
            return card('老师建议',icon.coach,`<p class="context-sub-v2">${text}</p><div class="coach-actions-v2"><button class="btn-sm" data-v2-start><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px"><path d="M3 2h8v10H3zM5 5h4M5 7.5h4" stroke="#c9a96e" stroke-width=".9"/></svg> 开始训练</button><button class="btn-sm" data-v2-ask><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px"><path d="M2 2.5h10v7H6l-2.5 2v-2H2z" stroke="#c9a96e" stroke-width=".9"/></svg> 问西西</button></div>`, 'coach-card-v2');
        }

        function currentView() {
            if (document.querySelector('.deck-tab[data-deck="math"].active')) return 'quantity';
            return document.querySelector('[data-verbal-demo].active')?.dataset.verbalDemo || 'vocab';
        }

        function render() {
            const key = currentView();
            panel.innerHTML = (views[key] || views.vocab)();
            panel.querySelector('[data-v2-ask]')?.addEventListener('click', () => document.getElementById('aiCoachDeckEntry')?.click());
        }

        document.addEventListener('click', event => {
            if (event.target.closest('[data-verbal-demo], [data-deck]')) setTimeout(render, 0);
        });
        render();
    }
    boot();
})();
