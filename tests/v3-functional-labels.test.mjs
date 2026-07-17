import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(file, 'utf8');
const shell = read('gontu-v3-shell.js');

test('shared labels are page-specific and every spatial function opens real content', () => {
  for (const label of ['言语训练', '数量训练', '平面图推功能', '空间训练功能', '申论功能', '教练模块']) {
    assert.ok(shell.includes(label), `missing page-specific label: ${label}`);
  }
  const functions = [
    ['基础截面', '/section-foundation.html', '常见几何体截面'],
    ['三视图训练', '/three-view-training.html', '目标视图'],
    ['自由切面', '/geometry.html', '自由切割 · 连续拖动与倾斜'],
    ['组合体切割', '/csg-section.html', '截面数据'],
  ];
  for (const [label, href, marker] of functions) {
    assert.ok(shell.includes(`label: "${label}", href: "${href}"`));
    assert.ok(read(href.slice(1)).includes(marker), `${label} target lacks its own content`);
  }
  assert.match(shell, /页面内容将更新/);
  assert.doesNotMatch(shell, /href:\s*["']#["']/);
});

test('planar function labels switch four distinct panels and expose selected state', () => {
  const page = read('mindmap.html');
  for (const [tab, label] of [['t1', '万象图绎 · 全览'], ['t2', '图推「3+3」'], ['t3', '黑白块'], ['t4', '错题复习']]) {
    assert.ok(page.includes(`data-tab="${tab}"`));
    assert.ok(page.includes(`id="${tab}" role="tabpanel"`));
    assert.ok(page.includes(label));
  }
  assert.match(page, /panel\.hidden=false;panel\.classList\.add\('active'\)/);
  assert.match(page, /x\.setAttribute\('aria-selected','false'\)/);
  assert.match(page, /if\(this\.dataset\.tab==='t4'\) setTimeout\(initReview,200\)/);
});

test('shenlun labels change question lists and the whole working panel', () => {
  const page = read('shenlun.html');
  assert.match(page, /filterType==='全部'/);
  assert.match(page, /filterType===t/);
  assert.match(page, /const filteredQuestions = computed/);
  assert.match(page, /activeTab==='chat'/);
  assert.match(page, /activeTab==='tracking'/);
  assert.match(page, /switchToTracking/);
  assert.match(page, /AI分析薄弱点/);
  assert.match(page, /:aria-pressed="activeTab==='chat'"/);
  assert.match(page, /:aria-pressed="activeTab==='tracking'"/);
});

test('AI coach module labels update teacher, history and exact Skill content', () => {
  const page = read('ai-coach-demo.html');
  assert.match(page, /button\.setAttribute\('aria-pressed',String\(module\.id===state\.activeModule\)\)/);
  assert.match(page, /state\.activeModule=moduleId;state\.thread=null/);
  assert.match(page, /\$\('teacherTitle'\)\.textContent/);
  assert.match(page, /\$\('teacherIntro'\)\.textContent/);
  assert.match(page, /activeSkillText\(\)/);
  assert.match(page, /await loadThreads\(\)/);
});

test('inline practice has one render owner and keyboard navigation includes single questions', () => {
  const page = read('doc/prototypes/unified-inline-learning-v4.js');
  assert.match(page, /legacyRenderAll\.__inlineV4Guarded/);
  assert.match(page, /activeSurface && activeSurface !== 'vocab'/);
  assert.match(page, /activeSurface === 'quantityLegacy' && legacyRenderPermit <= 0/);
  assert.match(page, /legacyRenderPermit \+= 1/);
  assert.match(page, /setLegacyLearningMode\(requestedMode, true\)/);
  assert.match(page, /id="singlePrev"/);
  assert.match(page, /id="singleNext"/);
  assert.match(page, /#logicPrev,#readingPrev,#singlePrev,#setPrev/);
  assert.match(page, /#logicNext,#readingNext,#singleNext,#setNext/);
});

test('quantity navigation ignores stale async renders during fast tab switching', () => {
  const page = read('doc/prototypes/unified-inline-learning-v4.js');
  assert.match(page, /var navigationVersion = 0/);
  assert.match(page, /navigationVersion \+= 1/);
  assert.match(page, /handler\(requestedVersion\)/);
  assert.match(page, /renderVersion !== navigationVersion/);
  assert.match(page, /renderSingle\('quantityToday', null, false, version\)/);
  assert.match(page, /renderSingle\('quantitySingle', null, true, version\)/);
});

test('quantity legacy surface restores four vertical modes beside the narrowed card', () => {
  const page = read('doc/prototypes/unified-inline-learning-v4.js');
  for (const [mode, label] of [['recite', '全部题型'], ['difficult', '易忘攻克'], ['steps', '步骤填空'], ['quiz', '题型识别']]) {
    assert.ok(page.includes(`data-quantity-legacy-mode="${mode}">${label}`));
  }
  assert.match(page, /data-inline-surface="quantityLegacy"\] \.context-right-v2\{display:none!important\}/);
  assert.match(page, /grid-template-columns:minmax\(0,1fr\) 108px/);
  assert.match(page, /flex-direction:column;position:sticky;top:14px;align-self:start;height:max-content/);
  assert.match(page, /flex-direction:row;flex-wrap:wrap;align-self:stretch;height:auto/);
  assert.match(page, /studyContainer\.appendChild\(legacyTabs\)/);
  assert.match(page, /data-quantity-legacy-mode="recite"\] \.study-card-container/);
  assert.match(page, /data-quantity-legacy-mode="difficult"\] \.study-card-container/);
  assert.match(page, /min-height:calc\(100vh - 230px\)/);
  assert.match(page, /document\.body\.dataset\.quantityLegacyMode = renderedMode/);
  assert.match(page, /closest\('\.quantity-legacy-subtab\[data-quantity-legacy-mode\]'\)/);
  assert.doesNotMatch(page, /closest\('\[data-quantity-legacy-mode\]'\)/);
  assert.doesNotMatch(page, /setRight\('原数量训练'/);
});

test('late deck sync resolves through the guarded renderer and startup metadata is not duplicated', () => {
  const page = read('智学成语-高级版.html');
  assert.match(page, /window\.setLegacyLearningMode = function\(mode, keepEmptyMode\)/);
  assert.match(page, /if \(typeof window\.renderAll === 'function'\) window\.renderAll\(\)/);
  assert.doesNotMatch(page, /then\(renderAll\)/);
  const initDailyPlan = page.match(/\(function initDailyPlan\(\) \{[\s\S]*?\}\)\(\);/)?.[0] || '';
  assert.match(initDailyPlan, /syncUserMetaFromBackend\(\)/);
  assert.doesNotMatch(initDailyPlan, /syncDailyGoalFromBackend\(\);/);
});

test('quantity deck rehydrates missing blank-step cards after account sync', () => {
  const page = read('智学成语-高级版.html');
  assert.match(page, /function hydrateBuiltinMathDeck\(source\)/);
  assert.match(page, /type === 'math' \? hydrateBuiltinMathDeck\(data\.cards\) : data\.cards/);
  assert.match(page, /localStorage\.setItem\(deckKey\('data'\), JSON\.stringify\(hydrateBuiltinMathDeck\(loadIdiomsRaw\(\)\)\)\)/);
});
