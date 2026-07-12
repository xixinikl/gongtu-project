import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('智学成语-高级版.html', 'utf8');
const shell = fs.readFileSync('doc/prototypes/verbal-ai-native-demo-v3.js', 'utf8');

test('unified V3 shell is the default formal entry while historical demos remain addressable', () => {
  assert.match(page, /var verbalAiUnifiedShell = !verbalAiDemoMode \|\| verbalAiDemoMode === 'verbal-ai-v3'/);
  assert.match(page, /verbalAiDemoMode === 'verbal-ai-v2'/);
  assert.match(shell, /dataset\.productShell = 'gongtu-unified-v3'/);
  assert.match(shell, /公途统一学习页/);
  assert.match(shell, /setTimeout\(\(\) => \{[\s\S]*note\.textContent = '公途统一学习页'/);
  assert.match(shell, /ai-coach-demo\.html\?theme=gongtu&module=/);
});

test('review UI uses learner language instead of internal evidence jargon', () => {
  assert.match(shell, /最近容易错在哪里/);
  assert.match(shell, /下一步：做 5 道/);
  assert.match(shell, /练完以后有没有改善/);
  const reviewBlock = shell.slice(shell.indexOf('function renderReviewV3'), shell.indexOf('function renderHome'));
  assert.doesNotMatch(reviewBlock, /强证据|待补证据|confidence/i);
});

test('review has enough functional sections to avoid an empty document-like card', () => {
  for (const marker of ['review-issues-v3', 'review-timeline-v3', 'review-next-v3', '已处理的问题']) {
    assert.ok(shell.includes(marker), `missing review marker: ${marker}`);
  }
  assert.match(shell, /min-height:660px/);
});

test('exam is a three-state flow instead of a static twenty-question card', () => {
  for (const marker of ['创建实战', '作答中', '交卷后', 'data-exam-start-v3', 'data-exam-result-v3', 'data-exam-reset-v3']) {
    assert.ok(shell.includes(marker), `missing exam state marker: ${marker}`);
  }
  assert.match(shell, /逻辑填空/);
  assert.match(shell, /倒计时/);
  assert.match(shell, /犹豫超过 60 秒/);
  assert.match(shell, /不在界面原型中伪造成绩/);
});

test('quantity exposes recognition, tradeoff, method, timing, stuck step and similar-practice verification', () => {
  for (const marker of ['题型识别', '必做 / 可做 / 先跳', '方法与步骤', '单题时间', '真正卡住的步骤', '同类题确认是否掌握']) {
    assert.ok(shell.includes(marker), `missing quantity capability: ${marker}`);
  }
});
