(function () {
    if (window.__gontuInlineTabsDemoLoaded) return;
    window.__gontuInlineTabsDemoLoaded = true;

    const params = new URLSearchParams(location.search);
    if (params.get('review') !== 'inline-tabs-demo') return;

    const style = document.createElement('style');
    style.textContent = `
      body.inline-tabs-demo .verbal-demo-note{display:none!important}
      body.inline-tabs-demo .verbal-demo-subnav{margin-bottom:18px!important}
      body.inline-tabs-demo .study-card-container{padding:24px!important}
      body.inline-tabs-demo .study-card-container>.card-header{display:none!important}
      body.inline-tabs-demo .inline-demo-card{min-height:0!important;padding:24px 26px!important;text-align:left!important;cursor:default!important;transform:none!important;overflow:visible!important}
      body.inline-tabs-demo .inline-demo-card:hover{transform:none!important;border-color:var(--border-light)!important;box-shadow:var(--shadow-sm),inset 0 0 80px 20px rgba(139,109,56,.04)!important}
      .inline-demo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:16px}
      .inline-demo-kicker{color:var(--gold-dark);font-size:.72rem;letter-spacing:.12em}
      .inline-demo-title{margin:5px 0 0;color:var(--ink-deep);font:600 1.24rem/1.4 'Noto Serif SC','STKaiti',serif;letter-spacing:.04em}
      .inline-demo-meta{flex:none;padding:6px 10px;border:1px solid var(--border);border-radius:999px;background:var(--gold-bg);color:var(--ink-light);font-size:.68rem}
      .inline-demo-stem{margin:0 0 15px;color:var(--ink-deep);font-family:'Noto Serif SC','STKaiti',serif;font-size:.94rem;line-height:1.78}
      .inline-demo-prompt{margin:0 0 11px;color:var(--ink-body);font-size:.82rem;font-weight:700}
      .inline-demo-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .inline-demo-option{display:grid;grid-template-columns:25px minmax(0,1fr);align-items:center;gap:8px;min-height:46px;padding:9px 11px;border:1px solid var(--border-light);border-radius:10px;background:rgba(255,254,249,.78);color:var(--ink-body);font:inherit;font-size:.78rem;text-align:left;cursor:pointer}
      .inline-demo-option:hover,.inline-demo-option.selected{border-color:var(--gold);background:var(--gold-bg)}
      .inline-demo-option b{width:23px;height:23px;display:grid;place-items:center;border:1px solid var(--border);border-radius:50%;color:var(--gold-dark);font-size:.68rem}
      .inline-demo-foot{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;margin-top:14px;padding-top:13px;border-top:1px solid rgba(176,138,58,.14)}
      .inline-demo-foot p{margin:0;color:var(--ink-light);font-size:.7rem;line-height:1.55}
      .inline-demo-actions{display:flex;gap:8px}
      .inline-demo-btn{padding:8px 14px;border:1px solid var(--border);border-radius:999px;background:#fffef9;color:var(--ink-body);font:inherit;font-size:.72rem;cursor:pointer}
      .inline-demo-btn.primary{border-color:var(--gold-dark);background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:#fffef9}
      .inline-demo-coach{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;margin-top:12px;padding:9px 11px;border:1px solid var(--border-light);border-radius:10px;background:rgba(250,247,240,.86)}
      .inline-demo-coach span{width:25px;height:25px;display:grid;place-items:center;border-radius:7px;background:var(--gold-dark);color:#fffef9;font-family:'ZCOOL XiaoWei','STKaiti',serif;font-size:.72rem}
      .inline-demo-coach input{min-width:0;border:0;outline:0;background:transparent;color:var(--ink-body);font:inherit;font-size:.74rem}
      .inline-demo-coach button{border:0;background:transparent;color:var(--gold-dark);font:inherit;font-size:.7rem;cursor:pointer}
      .inline-demo-review{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .inline-demo-review article{padding:13px 14px;border:1px solid var(--border-light);border-radius:10px;background:rgba(255,254,249,.76)}
      .inline-demo-review small{color:var(--gold-dark);font-size:.66rem}.inline-demo-review h3{margin:5px 0;color:var(--ink-deep);font-size:.84rem}.inline-demo-review p{margin:0;color:var(--ink-light);font-size:.7rem;line-height:1.55}
      .inline-demo-type-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(176,138,58,.13)}
      .inline-demo-type-row:first-of-type{border-top:0}.inline-demo-type-row b{color:var(--gold-dark);font-size:.68rem}.inline-demo-type-row span{color:var(--ink-body);font-size:.76rem}.inline-demo-type-row small{color:var(--ink-light);font-size:.66rem}
      @media(max-width:760px){body.inline-tabs-demo .study-card-container{padding:16px!important}.inline-demo-options,.inline-demo-review{grid-template-columns:1fr}.inline-demo-foot{grid-template-columns:1fr}.inline-demo-actions{justify-content:flex-end}}
    `;
    document.head.appendChild(style);
    document.body.classList.add('inline-tabs-demo');

    const verbalContent = {
        vocab: {
            title: '词语积累', kicker: '言语 · 今日复习', meta: '12 个到期',
            body: `<div class="inline-demo-review"><article><small>易忘词</small><h3>功败垂成</h3><p>事情接近成功时失败。回到近期错题中的真实语境复习。</p></article><article><small>新词</small><h3>凝聚</h3><p>今天到期，完成后自动进入下一轮间隔复习。</p></article></div>`
        },
        logic: {
            title: '逻辑填空', kicker: '言语 · 第 1 / 231 题', meta: '建议 55 秒',
            stem: '创新是一棒接一棒的接力赛，如果碰到困难就停止研发，很容易导致______、被后来者超越。',
            prompt: '填入横线处最恰当的一项是：',
            options: ['半途而废', '推波助澜', '前功尽弃', '层出不穷']
        },
        exam: {
            title: '限时套题', kicker: '言语 · 练习题 01 套', meta: '第 1 / 20 题 · 55 秒',
            stem: '如果从专业发展的角度看，同居不同专业的学生“混居”，不仅会拓展学生的知识面，也会带来非专业的专业视角。这样的住宿布局是否更有利于培养视野宽阔的人才？',
            prompt: '这段文字旨在说明：',
            options: ['“混居”模式帮助学生拓展知识结构', '“混居”模式的独特之处', '学生“混居”对人才培养的好处', '学生“混居”优势大于劣势'],
            coach: true
        },
        review: {
            title: '我的复盘', kicker: '言语 · 最近更新 07-14 03:52', meta: '2 个待处理',
            body: `<div class="inline-demo-review"><article><small>明确问题 · 连续 5 次</small><h3>容易把“问题”当成主旨</h3><p>最近一套片段阅读错 4 题。下一步：做 5 道“问题→对策”原题。</p></article><article><small>待验证 · 出现 2 次</small><h3>转折后的方向仍不稳定</h3><p>证据还不够。下一步：补 5 道转折语境题再判断。</p></article></div>`
        }
    };

    const quantityContent = {
        quantityToday: {
            title: '今日训练', kicker: '数量关系 · 今日第 1 / 10 题', meta: '经济利润 · 建议 80 秒',
            stem: '某药材公司以每千克 8 元收购 5000 千克药材，加工后合格品比例为 1∶3∶6。公司最终获利 108000 元，问加工中的废品率是多少？',
            prompt: '请选择答案：', options: ['1%', '4%', '6%', '10%'], coach: true
        },
        quantitySingle: {
            title: '单题诊断', kicker: '数量关系 · 完整走一题', meta: '必做 · 80 秒',
            stem: '一项工程，甲单独完成需要 12 天，乙单独完成需要 18 天。两人合作 4 天后，剩余工程由甲完成，还需要多少天？',
            prompt: '先判断题型与取舍，再写关键步骤：', options: ['2 天', '3 天', '4 天', '5 天'], coach: true
        },
        quantitySet: {
            title: '套题策略', kicker: '数量关系 · 第 01 套', meta: '10 题 · 建议 12 分钟',
            body: `<div class="inline-demo-review"><article><small>先做 · 4 题</small><h3>工程、利润、比例</h3><p>题干短、方法稳定，优先拿分。</p></article><article><small>后做 / 先跳 · 6 题</small><h3>行程、排列与几何</h3><p>先按题型和预计用时排序，再从第 1 题开始。</p></article></div>`
        },
        quantityType: {
            title: '系统学题型', kicker: '数量关系 · 按值得做的顺序', meta: '12 类题型',
            body: `<div class="inline-demo-type-row"><b>01 必做</b><span>工程问题</span><small>建议 80 秒 · 同题型训练 24 题</small></div><div class="inline-demo-type-row"><b>02 必做</b><span>利润与浓度</span><small>建议 75 秒 · 同题型训练 31 题</small></div><div class="inline-demo-type-row"><b>03 可做</b><span>基础行程</span><small>看条件后决定 · 同题型训练 18 题</small></div>`
        },
        quantityReview: {
            title: '我的复盘', kicker: '数量关系 · 最近更新 07-14 03:40', meta: '下一步已生成',
            body: `<div class="inline-demo-review"><article><small>卡点 · 3 次</small><h3>工程题设量偏慢</h3><p>平均 108 秒。下一步：练 5 道同题型，只记录设量步骤。</p></article><article><small>取舍 · 待补证据</small><h3>复杂排列不该硬算</h3><p>目前只有 2 次记录。下一步：套题中先标“先跳”再作答。</p></article></div>`
        }
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    function renderDemo(data) {
        const zone = document.getElementById('learningZone');
        if (!zone) return;
        const options = data.options ? `<div class="inline-demo-options">${data.options.map((option, index) => `<button class="inline-demo-option" type="button"><b>${String.fromCharCode(65 + index)}</b><span>${escapeHtml(option)}</span></button>`).join('')}</div>` : '';
        zone.innerHTML = `<section class="big-card inline-demo-card">
          <header class="inline-demo-head"><div><div class="inline-demo-kicker">${escapeHtml(data.kicker)}</div><h2 class="inline-demo-title">${escapeHtml(data.title)}</h2></div><span class="inline-demo-meta">${escapeHtml(data.meta)}</span></header>
          ${data.stem ? `<p class="inline-demo-stem">${escapeHtml(data.stem)}</p>` : ''}
          ${data.prompt ? `<p class="inline-demo-prompt">${escapeHtml(data.prompt)}</p>` : ''}
          ${options}${data.body || ''}
          ${data.coach ? `<div class="inline-demo-coach"><span>西</span><input aria-label="带当前题目问西西" placeholder="带着当前题目问西西，例如：这题应该先看什么？"><button type="button">发送</button></div>` : ''}
          <footer class="inline-demo-foot"><p>Demo 只确认“原标签下方直接换内容”的版式；现在没有跳转，也还没有批量接题库。</p><div class="inline-demo-actions"><button class="inline-demo-btn" type="button">上一题</button><button class="inline-demo-btn primary" type="button">下一题</button></div></footer>
        </section>`;
        zone.querySelectorAll('.inline-demo-option').forEach(button => button.addEventListener('click', () => {
            zone.querySelectorAll('.inline-demo-option').forEach(item => item.classList.remove('selected'));
            button.classList.add('selected');
        }));
    }

    function normalizeVerbalNav(nav) {
        const reading = nav.querySelector('[data-verbal-demo="reading"]');
        if (reading) reading.remove();
        const exam = nav.querySelector('[data-verbal-demo="exam"]');
        if (exam) exam.lastChild.textContent = ' 限时套题';
    }

    function activate(button, data) {
        const nav = button.closest('.verbal-demo-subnav');
        nav.querySelectorAll('.deck-tab').forEach(item => item.classList.toggle('active', item === button));
        document.getElementById('modeSwitchGroup')?.style.setProperty('display', 'none');
        document.getElementById('queueBadge')?.style.setProperty('display', 'none');
        renderDemo(data);
    }

    function boot() {
        const nav = document.querySelector('.verbal-demo-subnav');
        const deckTabs = document.getElementById('deckTabs');
        if (!nav || !deckTabs || !document.getElementById('learningZone')) return setTimeout(boot, 40);
        normalizeVerbalNav(nav);

        nav.addEventListener('click', event => {
            const verbal = event.target.closest('[data-verbal-demo]');
            const quantity = event.target.closest('[data-quantity-demo]');
            const key = verbal?.dataset.verbalDemo || quantity?.dataset.quantityDemo;
            const data = verbal ? verbalContent[key] : quantityContent[key];
            if (!data) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            activate(verbal || quantity, data);
        }, true);

        new MutationObserver(() => normalizeVerbalNav(nav)).observe(nav, {childList:true, subtree:true});
        deckTabs.addEventListener('click', event => {
            const deck = event.target.closest('[data-deck]')?.dataset.deck;
            if (deck !== 'idiom' && deck !== 'math') return;
            setTimeout(() => {
                normalizeVerbalNav(nav);
                const button = deck === 'math' ? nav.querySelector('[data-quantity-demo="quantityToday"]') : nav.querySelector('[data-verbal-demo="exam"]');
                if (button) activate(button, deck === 'math' ? quantityContent.quantityToday : verbalContent.exam);
            }, 0);
        });

        const first = nav.querySelector('[data-verbal-demo="exam"]');
        if (first) {
            activate(first, verbalContent.exam);
            setTimeout(() => {
                const settled = nav.querySelector('[data-verbal-demo="exam"]');
                if (settled) activate(settled, verbalContent.exam);
            }, 120);
        }
    }

    boot();
})();
