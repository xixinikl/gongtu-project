(function () {
    if (window.__verbalAiNativeDemoLoaded) return;
    window.__verbalAiNativeDemoLoaded = true;

    const style = document.createElement('style');
    style.textContent = `
        .verbal-demo-subnav { margin: 0 0 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .verbal-demo-subnav .deck-tabs { width:100%; justify-content:center; }
        .verbal-demo-note { color:var(--ink-light,#8b7355); font-size:.72rem; white-space:nowrap; }
        .verbal-ai-plan { position:relative; }
        .verbal-ai-plan::after { content:'AI'; position:absolute; top:14px; right:18px; color:rgba(176,138,58,.36); font-family:'Noto Serif SC',serif; font-weight:800; letter-spacing:1px; }
        .verbal-ai-plan .ai-task { display:flex; align-items:center; gap:9px; padding:9px 0; border-top:1px solid rgba(176,138,58,.12); }
        .verbal-ai-plan .ai-task:first-of-type { border-top:0; }
        .verbal-ai-plan .ai-task-mark { width:6px; height:6px; flex:none; border-radius:50%; background:var(--gold,#b08a3a); }
        .verbal-ai-plan .ai-task-copy { min-width:0; flex:1; }
        .verbal-ai-plan .ai-task-copy strong { display:block; color:var(--ink-deep,#2c2618); font-size:.82rem; font-weight:600; }
        .verbal-ai-plan .ai-task-copy small { color:var(--ink-light,#8b7355); font-size:.72rem; }
        .verbal-ai-plan .ai-task-count { color:var(--gold-dark,#8d6729); font-size:.72rem; white-space:nowrap; }
        .verbal-ai-actions { display:flex; gap:7px; margin-top:10px; }
        .verbal-ai-actions .btn-sm { flex:1; }
        .verbal-demo-question { text-align:left !important; cursor:default !important; padding:30px 32px !important; }
        .verbal-demo-question::before { background:linear-gradient(90deg,var(--gold,#b08a3a),var(--gold-light,#c9a74d)) !important; }
        .verbal-demo-question .quiz-progress { margin-bottom:14px; }
        .verbal-demo-question .verbal-stem { color:var(--ink-deep,#2c2618); font-size:1rem; line-height:1.9; margin:14px 0 20px; }
        .verbal-demo-question .quiz-options { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .verbal-demo-question .quiz-option { margin:0 !important; background:var(--gold-bg,#faf7f0) !important; transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease !important; }
        .verbal-demo-question .quiz-option:hover { background:var(--gold-bg,#faf7f0) !important; border-color:var(--gold,#b08a3a) !important; transform:translateY(-2px) !important; box-shadow:0 5px 14px rgba(176,138,58,.10) !important; }
        .verbal-demo-question .verbal-ai-after { margin-top:16px; padding:13px 15px; border:1px solid var(--border,#e4d9c4); border-radius:var(--radius,8px); background:#faf7f0; }
        .verbal-demo-question .verbal-ai-after strong { color:var(--gold-dark,#8d6729); font-family:'Noto Serif SC',serif; font-size:.86rem; }
        .verbal-demo-question .verbal-ai-after p { margin:6px 0 0; color:var(--ink-mid,#5f5648); font-size:.78rem; line-height:1.65; }
        .verbal-demo-question .btn-primary.btn-cta { background:linear-gradient(135deg,var(--gold,#b08a3a),var(--gold-dark,#8d6729)) !important; color:#fffef9 !important; box-shadow:0 4px 14px rgba(176,138,58,.20) !important; }
        .verbal-demo-question .btn-primary.btn-cta:hover { background:linear-gradient(135deg,var(--gold-light,#c9a74d),var(--gold,#b08a3a)) !important; transform:translateY(-1px) !important; }
        .verbal-demo-dialog { position:fixed; z-index:10050; right:24px; bottom:86px; width:min(360px,calc(100vw - 24px)); }
        .verbal-demo-dialog .daily-plan-card { margin:0 !important; box-shadow:0 18px 50px rgba(44,38,24,.18) !important; }
        @media (max-width:700px) {
            .verbal-demo-subnav { display:block; }
            .verbal-demo-subnav .deck-tabs { justify-content:flex-start; overflow-x:auto; }
            .verbal-demo-subnav .deck-tab { flex:0 0 auto; }
            .verbal-demo-note { display:block; margin-top:7px; text-align:center; }
            .verbal-demo-question .quiz-options { grid-template-columns:1fr; }
            .verbal-demo-dialog { right:12px; bottom:76px; }
        }
    `;
    document.head.appendChild(style);

    const appContainer = document.querySelector('.app-container');
    const appGrid = document.querySelector('.app-grid');
    const learningZone = document.getElementById('learningZone');
    const rightPanel = document.querySelector('.right-panel');
    const dailyPlan = document.getElementById('dailyPlanCard');
    const idiomDeck = document.querySelector('[data-deck="idiom"]');
    if (!appContainer || !appGrid || !learningZone || !rightPanel || !dailyPlan || !idiomDeck) return;

    idiomDeck.lastChild.textContent = ' 言语';

    const aiCoachDeck = document.createElement('button');
    aiCoachDeck.className = 'deck-tab';
    aiCoachDeck.id = 'aiCoachDeckEntry';
    aiCoachDeck.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><path d="M2.5 2.5h13v10h-6l-3.5 3v-3H2.5z" stroke="rgba(176,138,58,0.7)" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.5 6h7M5.5 8.5h4.5" stroke="rgba(176,138,58,0.35)" stroke-width="0.8" stroke-linecap="round"/><circle cx="13" cy="10" r="1.3" stroke="rgba(176,138,58,0.55)" stroke-width="0.7"/></svg> AI教练`;
    document.getElementById('deckTabs').appendChild(aiCoachDeck);

    const subnav = document.createElement('div');
    subnav.className = 'verbal-demo-subnav';
    subnav.innerHTML = `
        <div class="deck-tabs" id="verbalDemoTabs">
            <button class="deck-tab active" data-verbal-demo="vocab"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><rect x="2" y="1.5" width="14" height="15" rx="1.5" stroke="rgba(176,138,58,0.7)" stroke-width="1.2"/><path d="M4.5 1.5v15" stroke="rgba(176,138,58,0.35)" stroke-width="0.9"/><line x1="6" y1="5.5" x2="12" y2="5.5" stroke="rgba(176,138,58,0.3)" stroke-width="0.7"/><line x1="6" y1="8.5" x2="12" y2="8.5" stroke="rgba(176,138,58,0.3)" stroke-width="0.7"/><line x1="6" y1="11.5" x2="10" y2="11.5" stroke="rgba(176,138,58,0.25)" stroke-width="0.7"/></svg> 词语积累</button>
            <button class="deck-tab" data-verbal-demo="logic"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><path d="M3 2.5h12v13H3z" stroke="rgba(176,138,58,0.7)" stroke-width="1.1"/><path d="M6 6h6M6 9h3.5M6 12h5" stroke="rgba(176,138,58,0.35)" stroke-width="0.8" stroke-linecap="round"/><circle cx="13.5" cy="12.5" r="1.5" stroke="rgba(176,138,58,0.55)" stroke-width="0.8"/></svg> 逻辑填空</button>
            <button class="deck-tab" data-verbal-demo="reading"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><path d="M2.5 3.5c2.5-.8 4.5-.3 6.5 1.2v10c-2-1.5-4-2-6.5-1.2z" stroke="rgba(176,138,58,0.7)" stroke-width="1.1"/><path d="M15.5 3.5c-2.5-.8-4.5-.3-6.5 1.2v10c2-1.5 4-2 6.5-1.2z" stroke="rgba(176,138,58,0.7)" stroke-width="1.1"/><path d="M4.5 7h2.5M11 7h2.5M4.5 9.5H7M11 9.5h2.5" stroke="rgba(176,138,58,0.3)" stroke-width="0.7"/></svg> 片段方法</button>
            <button class="deck-tab" data-verbal-demo="exam"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><rect x="3" y="2" width="12" height="14" rx="1.5" stroke="rgba(176,138,58,0.7)" stroke-width="1.1"/><path d="M6 6h6M6 9h6M6 12h3" stroke="rgba(176,138,58,0.35)" stroke-width="0.8" stroke-linecap="round"/><path d="M11 11.5l1 1 2-2" stroke="rgba(176,138,58,0.6)" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/></svg> 限时套题</button>
            <button class="deck-tab" data-verbal-demo="review"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><circle cx="9" cy="9" r="7" stroke="rgba(176,138,58,0.55)" stroke-width="1" stroke-dasharray="2.5 1.5"/><path d="M5 11.5c1.2-3 2.7-4.5 4-4.5s2.8 1.5 4 4.5" stroke="rgba(176,138,58,0.7)" stroke-width="1.1" stroke-linecap="round"/><circle cx="9" cy="5" r="1.5" stroke="rgba(176,138,58,0.6)" stroke-width="0.9"/></svg> 我的复盘</button>
        </div>
        <span class="verbal-demo-note">原页面原样式 · 演示模式</span>
    `;
    appContainer.insertBefore(subnav, appGrid);

    const aiPlan = document.createElement('div');
    aiPlan.className = 'daily-plan-card verbal-ai-plan';
    aiPlan.innerHTML = `
        <div class="daily-plan-header">
            <span class="daily-plan-title"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M3 13c2.4-.5 4-1.8 5-4 1 2.2 2.6 3.5 5 4" stroke="#c9a96e" stroke-width="1.1" stroke-linecap="round"/><path d="M8 2.2c.5 1.7 1.5 2.7 3.2 3.2C9.5 5.9 8.5 6.9 8 8.6 7.5 6.9 6.5 5.9 4.8 5.4 6.5 4.9 7.5 3.9 8 2.2z" stroke="#c9a96e" stroke-width="1" stroke-linejoin="round"/></svg> 今日老师建议</span>
        </div>
        <div class="daily-plan-body" id="verbalAiPlanBody"></div>
        <div class="verbal-ai-actions">
            <button class="btn-sm" id="verbalAiStart"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M3 2.5h8v9H3z" stroke="#c9a96e" stroke-width="1"/><path d="M5 5h4M5 7h4M5 9h2" stroke="#c9a96e" stroke-width=".7" stroke-linecap="round"/></svg> 开始第一项</button>
            <button class="btn-sm" id="verbalAiAsk"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><path d="M2 2.5h10v7H6l-2.5 2v-2H2z" stroke="#c9a96e" stroke-width="1" stroke-linejoin="round"/><circle cx="5" cy="6" r=".6" fill="#c9a96e"/><circle cx="7" cy="6" r=".6" fill="#c9a96e"/><circle cx="9" cy="6" r=".6" fill="#c9a96e"/></svg> 问西西</button>
        </div>
    `;
    dailyPlan.insertAdjacentElement('afterend', aiPlan);

    const originalLearningHtml = learningZone.innerHTML;
    let activeCoachModule = '言语理解';
    const originalModeDisplay = document.getElementById('modeSwitchGroup').style.display;
    const originalQueueDisplay = document.getElementById('queueBadge').style.display;
    const planBody = document.getElementById('verbalAiPlanBody');
    const statNumbers = [...document.querySelectorAll('.stats-dashboard .number')];
    const statLabels = [...document.querySelectorAll('.stats-dashboard .label')];
    const progressTitle = document.querySelector('.progress-title');
    const dailyPlanTitle = document.querySelector('.daily-plan-title');
    const dailyPlanBody = document.querySelector('#dailyPlanCard .daily-plan-body');
    const gallery = document.querySelector('.idiom-gallery');
    const galleryTitle = document.getElementById('galleryDeckLabel');
    const galleryGrid = document.getElementById('idiomGrid');
    const originals = {
        statNumbers: statNumbers.map(node => node.textContent),
        statLabels: statLabels.map(node => node.textContent),
        progressTitle: progressTitle.textContent,
        dailyPlanTitle: dailyPlanTitle.innerHTML,
        dailyPlanBody: dailyPlanBody.innerHTML,
        galleryTitle: galleryTitle.textContent,
        galleryGrid: galleryGrid.innerHTML
    };

    const plans = {
        vocab: [
            ['复习易忘词', '其中5个来自近期逻辑填空错题', '12个'],
            ['查看人民网例句', '优先复习语境辨析词', '6分钟']
        ],
        logic: [
            ['转折语境补证据', '目前仅2次错误，暂不下强结论', '5题'],
            ['错题词语回到词库', '练完自动进入易忘队列', '3词']
        ],
        reading: [
            ['问题项与对策项', '来自第01套5道真实错题', '5题'],
            ['继续第02套', 'AI推荐定位到第18题', '0/20']
        ],
        exam: [
            ['20题标准组', '混合逻辑填空与片段阅读', '32分钟'],
            ['先做专项再实战', '当前片段阅读证据较强', '建议']
        ],
        review: [
            ['片段阅读关键弱项', '问题项容易冒充主旨', '强证据'],
            ['逻辑填空疑似弱项', '转折语境仍需补题确认', '待验证']
        ],
        quantityToday: [
            ['工程与比例必拿题', '先训练快速设量与识别', '5题'],
            ['考场取舍判断', '只看题干先判断做不做', '3题']
        ],
        quantitySingle: [
            ['单题快速诊断', '判断题型、做法与预计用时', '1题'],
            ['慢步骤复盘', '记录列式与计算耗时', '建议']
        ],
        quantitySet: [
            ['10题套题策略', '先排序再逐题作答', '10题'],
            ['必做/可做/先跳', '训练考场取舍', '3档']
        ],
        quantityType: [
            ['基础必拿题型', '工程、利润、浓度、比例', '4类'],
            ['高难题只练识别', '排列组合与复杂几何', '先判断']
        ],
        quantityReview: [
            ['工程问题设量偏慢', '来自真实用时与步骤记录', '中证据'],
            ['复杂题取舍不足', '仍需补一组套题证据', '待验证']
        ]
    };

    function renderPlan(kind) {
        planBody.innerHTML = plans[kind].map(item => `
            <div class="ai-task">
                <span class="ai-task-mark"></span>
                <div class="ai-task-copy"><strong>${item[0]}</strong><small>${item[1]}</small></div>
                <span class="ai-task-count">${item[2]}</span>
            </div>
        `).join('');
    }

    const rightStates = {
        vocab: { numbers:['801','0','12'], labels:['词库总量','已掌握','今日待复习'], progress:'今日词语复习进度', daily:'今日词语计划', goal:'复习12个易忘词，优先处理近期错题中出现的词。', gallery:'词语库', cards:['按图索骥','持之以恒','一蹴而就'] },
        logic: { numbers:['231','68%','12'], labels:['逻辑填空题','近期正确率','待复盘'], progress:'逻辑填空专项进度', daily:'今日逻辑填空计划', goal:'完成5道转折语境题，记录选词方向与用时。', gallery:'逻辑填空题组', cards:['转折关系专项 · 5题','词义侧重专项 · 8题','近期错题 · 12题'] },
        reading: { numbers:['600','20','15'], labels:['片段阅读题','已完成','待强化'], progress:'片段阅读套题进度', daily:'今日片段阅读计划', goal:'继续第02套，并完成AI推荐的5道同类原题。', gallery:'片段阅读套题', cards:['第02套 · 0/20','第01套 · 5/20','对策识别强化 · 5题'] },
        exam: { numbers:['20','0','32'], labels:['本组题数','已完成','建议分钟'], progress:'本次套题进度', daily:'本次实战安排', goal:'逻辑填空与片段阅读混合训练，记录时间分配。', gallery:'实战记录', cards:['20题标准组','10题速度组','个人错题混合组'] },
        review: { numbers:['3','1','2'], labels:['问题证据','强证据','待确认'], progress:'本周复盘完成度', daily:'今日复盘任务', goal:'先修一个强弱项，再验证一个疑似弱项。', gallery:null, cards:[] },
        quantityToday: { numbers:['600','0','10'], labels:['数量题库','今日已练','今日任务'], progress:'今日数量训练进度', daily:'今日数量计划', goal:'先做5道基础必拿题，再做3道考场取舍判断。', gallery:'数量题型', cards:['工程与比例 · 必拿','利润与浓度 · 必拿','排列组合 · 先判断'] },
        quantitySingle: { numbers:['1','80','0'], labels:['当前题','预计秒数','已用秒数'], progress:'当前单题进度', daily:'单题诊断目标', goal:'先判断值不值得做，再选择最快方法。', gallery:null, cards:[] },
        quantitySet: { numbers:['10','0','3'], labels:['本套题数','已完成','建议先跳'], progress:'数量套题进度', daily:'本套取舍计划', goal:'先标必做、可做、先跳，再按顺序作答。', gallery:'套题题型分布', cards:['基础必拿 · 4题','中频可做 · 3题','高难取舍 · 3题'] },
        quantityType: { numbers:['12','4','3'], labels:['题型模块','基础必拿','高难取舍'], progress:'数量题型学习进度', daily:'题型学习计划', goal:'训练识别题型、判断做不做、选择方法。', gallery:'题型学习路径', cards:['工程问题','利润折扣','行程问题'] },
        quantityReview: { numbers:['2','0','2'], labels:['问题证据','强证据','待确认'], progress:'数量复盘完成度', daily:'数量复盘任务', goal:'验证工程设量速度和复杂题取舍。', gallery:null, cards:[] }
    };

    function renderRight(kind) {
        const state = rightStates[kind];
        statNumbers.forEach((node,index) => node.textContent = state.numbers[index]);
        statLabels.forEach((node,index) => node.textContent = state.labels[index]);
        progressTitle.textContent = state.progress;
        dailyPlanTitle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-2px"><rect x="2.5" y="2" width="11" height="12" rx="1" fill="none" stroke="#c9a96e" stroke-width="1.2"/><line x1="2.5" y1="6.5" x2="13.5" y2="6.5" stroke="#c9a96e" stroke-width="0.8" stroke-dasharray="1.5,1"/><line x1="5.5" y1=".5" x2="5.5" y2="4.5" stroke="#c9a96e" stroke-width=".8"/><line x1="10.5" y1=".5" x2="10.5" y2="4.5" stroke="#c9a96e" stroke-width=".8"/></svg> ${state.daily}`;
        dailyPlanBody.innerHTML = `<div class="daily-goal-display"><span class="goal-icon"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="7" stroke="#c9a96e" stroke-width="1"/><circle cx="9" cy="9" r="3.5" stroke="#c9a96e" stroke-width=".8"/><circle cx="9" cy="9" r="1" fill="#c9a96e"/></svg></span><span class="goal-text">${state.goal}</span></div><div class="daily-plan-progress" style="margin-top:10px"><div class="progress-bar-bg" style="height:6px"><div class="progress-bar-fill" style="width:0%;height:100%"></div></div><div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.75rem;color:#8b7355"><span>已完成 0</span><span>等待开始</span></div></div>`;
        gallery.style.display = state.gallery ? '' : 'none';
        if (state.gallery) {
            galleryTitle.textContent = state.gallery;
            galleryGrid.innerHTML = state.cards.map(card => `<div class="mini-card"><div class="mini-word">${card}</div></div>`).join('');
        }
    }

    function option(key, text) {
        return `<button class="quiz-option"><span class="quiz-opt-letter">${key}</span><span>${text}</span></button>`;
    }

    function renderQuestion(kind) {
        const isLogic = kind === 'logic';
        learningZone.innerHTML = `
            <div class="big-card verbal-demo-question">
                <div class="quiz-progress">${isLogic ? '逻辑填空 · 转折关系' : '片段阅读 · 中心理解题'}　示例题</div>
                <div class="verbal-stem">${isLogic
                    ? '基层治理不能只追求一时的声势，更需要在日常工作中＿＿地推进，把细小问题解决在萌芽状态。'
                    : '当前我国智慧城市建设已取得积极进展，但仍存在顶层设计不足、市民感知不明显等问题。如何把城市建设和群众需求结合起来，是解决智慧城市落地问题的关键。<br><br>这段文字意在强调：'}</div>
                <div class="quiz-options">${isLogic
                    ? option('A','大张旗鼓') + option('B','轰轰烈烈') + option('C','持之以恒') + option('D','一蹴而就')
                    : option('A','我国智慧城市建设已走在世界前列') + option('B','智慧城市建设面临许多问题') + option('C','建设智慧城市可以解决城市矛盾') + option('D','智慧城市建设要联系群众需求')}</div>
                <div class="verbal-ai-after"><strong><svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px;margin-right:5px"><path d="M7.5 1.5c.5 1.8 1.6 2.9 3.4 3.4C9.1 5.4 8 6.5 7.5 8.3 7 6.5 5.9 5.4 4.1 4.9 5.9 4.4 7 3.3 7.5 1.5z" stroke="#b08a3a" stroke-width="1"/><path d="M3 10.5h9M5 13h5" stroke="#b08a3a" stroke-width=".8" stroke-linecap="round"/></svg>交卷后由当前题老师接手</strong><p>自动读取你的选择、正确答案、原解析与${isLogic ? '逻辑填空' : '片段阅读'} Skill；作答前不返回答案。</p></div>
            </div>
        `;
    }

    function renderReview() {
        learningZone.innerHTML = `
            <div class="big-card verbal-demo-question">
                <div class="card-type-badge">真实学习证据</div>
                <div class="meaning-text">
                    <h3 style="font-family:'Noto Serif SC',serif;color:var(--ink-deep);margin-top:8px;">我的言语复盘</h3>
                    <div class="example-box"><strong>问题项容易冒充主旨</strong><br>片段阅读第01套5道错题，官方解析与AI诊断一致。　<span style="color:var(--gold-dark);">强证据</span></div>
                    <div class="example-box"><strong>转折后选词方向可能不稳</strong><br>逻辑填空出现2次，需要再做5题确认。　<span style="color:var(--gold-dark);">待补证据</span></div>
                </div>
            </div>
        `;
    }

    function activate(kind) {
        document.querySelectorAll('[data-verbal-demo]').forEach(button => button.classList.toggle('active', button.dataset.verbalDemo === kind));
        renderPlan(kind);
        renderRight(kind);
        const modeGroup = document.getElementById('modeSwitchGroup');
        const queueBadge = document.getElementById('queueBadge');
        if (kind === 'vocab') {
            modeGroup.style.display = originalModeDisplay;
            queueBadge.style.display = originalQueueDisplay;
            if (typeof window.renderAll === 'function') window.renderAll();
            else learningZone.innerHTML = originalLearningHtml;
        } else {
            modeGroup.style.display = 'none';
            queueBadge.style.display = 'none';
            if (kind === 'logic' || kind === 'reading') renderQuestion(kind);
            else if (kind === 'review') renderReview();
            else learningZone.innerHTML = `<div class="big-card verbal-demo-question"><div class="card-type-badge">套题实战</div><div class="idiom-word" style="font-size:2.4rem;letter-spacing:3px;">20题标准组</div><div class="meaning-text" style="text-align:center;">逻辑填空与片段阅读混合训练<br>建议用时32分钟 · 完成后进入AI综合复盘</div><button class="btn-primary btn-cta" style="margin-top:24px;">开始训练</button></div>`;
        }
    }

    subnav.addEventListener('click', event => {
        const button = event.target.closest('[data-verbal-demo]');
        if (button) activate(button.dataset.verbalDemo);
        const quantityButton = event.target.closest('[data-quantity-demo]');
        if (quantityButton) {
            document.querySelectorAll('[data-quantity-demo]').forEach(item => item.classList.toggle('active', item === quantityButton));
            renderPlan(quantityButton.dataset.quantityDemo);
            renderRight(quantityButton.dataset.quantityDemo);
        }
    });

    const quantityNavHtml = `
        <div class="deck-tabs" id="quantityDemoTabs">
            <button class="deck-tab active" data-quantity-demo="quantityToday"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><circle cx="9" cy="9" r="7" stroke="rgba(176,138,58,.65)" stroke-width="1.1"/><path d="M9 5v4l2.5 1.5" stroke="rgba(176,138,58,.45)" stroke-width=".9" stroke-linecap="round"/></svg> 今日训练</button>
            <button class="deck-tab" data-quantity-demo="quantitySingle"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><rect x="3" y="2" width="12" height="14" rx="1.5" stroke="rgba(176,138,58,.65)" stroke-width="1.1"/><path d="M6 6h6M6 9h4M6 12h5" stroke="rgba(176,138,58,.35)" stroke-width=".8"/></svg> 单题诊断</button>
            <button class="deck-tab" data-quantity-demo="quantitySet"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><path d="M3 4h12v11H3zM5 2h8v3H5z" stroke="rgba(176,138,58,.65)" stroke-width="1.1"/><path d="M6 8h6M6 11h6" stroke="rgba(176,138,58,.35)" stroke-width=".8"/></svg> 套题策略</button>
            <button class="deck-tab" data-quantity-demo="quantityType"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><circle cx="5" cy="5" r="2" stroke="rgba(176,138,58,.65)" stroke-width="1"/><circle cx="13" cy="5" r="2" stroke="rgba(176,138,58,.65)" stroke-width="1"/><circle cx="9" cy="13" r="2" stroke="rgba(176,138,58,.65)" stroke-width="1"/><path d="M6.5 6.5l1.6 4.5M11.5 6.5L9.9 11" stroke="rgba(176,138,58,.35)" stroke-width=".8"/></svg> 系统学题型</button>
            <button class="deck-tab" data-quantity-demo="quantityReview"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-3px"><circle cx="9" cy="9" r="7" stroke="rgba(176,138,58,.55)" stroke-width="1" stroke-dasharray="2.5 1.5"/><path d="M6 11c1-2.5 2-3.5 3-3.5s2 1 3 3.5" stroke="rgba(176,138,58,.65)" stroke-width="1"/></svg> 我的复盘</button>
        </div><span class="verbal-demo-note">数量专用入口 · 演示模式</span>`;
    const verbalNavHtml = subnav.innerHTML;
    document.getElementById('deckTabs').addEventListener('click', event => {
        const deckButton = event.target.closest('.deck-tab[data-deck]');
        if (!deckButton) return;
        if (deckButton.dataset.deck === 'math') {
            activeCoachModule = '数量关系';
            if (typeof window.switchDeck === 'function') window.switchDeck('math');
            subnav.innerHTML = quantityNavHtml;
            renderPlan('quantityToday');
            renderRight('quantityToday');
        } else if (deckButton.dataset.deck === 'idiom') {
            activeCoachModule = '言语理解';
            if (typeof window.switchDeck === 'function') window.switchDeck('idiom');
            subnav.innerHTML = verbalNavHtml;
            activate('vocab');
        }
    });

    function openAsk() {
        window.location.href = `ai-coach-demo.html?module=${encodeURIComponent(activeCoachModule)}`;
    }

    document.getElementById('verbalAiAsk').addEventListener('click', openAsk);
    aiCoachDeck.addEventListener('click', openAsk);
    const xiLogo = document.querySelector('.xi-logo-seal');
    if (xiLogo) { xiLogo.style.cursor = 'pointer'; xiLogo.addEventListener('click', openAsk); }
    document.getElementById('verbalAiStart').addEventListener('click', () => activate(document.querySelector('[data-verbal-demo].active').dataset.verbalDemo));
    if (typeof window.getCurrentDeckType === 'function' && window.getCurrentDeckType() === 'math') {
        activeCoachModule = '数量关系';
        subnav.innerHTML = quantityNavHtml;
        renderPlan('quantityToday');
        renderRight('quantityToday');
    } else {
        renderPlan('vocab');
        renderRight('vocab');
    }
})();
