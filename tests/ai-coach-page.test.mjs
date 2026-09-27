import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync('ai-coach-demo.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);

test('inline AI coach scripts parse', () => {
  assert.ok(scripts.length >= 1);
  scripts.forEach((source,index) => assert.doesNotThrow(() => new vm.Script(source,{filename:`ai-coach-${index}.js`})));
});

test('uses JWT-protected real AI coach endpoints through one contract', () => {
  assert.match(html, /const API = Object\.freeze/);
  assert.match(html, /\/api\/ai-coach\/modules/);
  assert.match(html, /\/api\/ai-coach\/threads/);
  assert.match(html, /\/messages/);
  assert.match(html, /\/retry/);
  assert.match(html, /\/issue-proposals\//);
  assert.match(html, /localStorage\.getItem\('gontu_token'\)/);
  assert.match(html, /Authorization.*Bearer/);
  assert.match(html, /response\.status === 401/);
});

test('contains no canned answer, fake evidence totals, or static problem cards', () => {
  assert.doesNotMatch(html, /AI 教练原型|本页是原型/);
  assert.doesNotMatch(html, /这道逻辑填空我选了 B/);
  assert.doesNotMatch(html, /先看语境关系，不先背成语/);
  assert.doesNotMatch(html, /30 条问题记录|11 条待复盘|证据强度.*46%/);
  assert.doesNotMatch(html, /data-count=/);
  assert.doesNotMatch(html, /data-module-card=/);
});

test('persists threads, hides stale failure chrome, and supports explicit retry for a current failed run', () => {
  assert.match(html, /async function loadThreads/);
  assert.match(html, /async function openThread/);
  assert.match(html, /status:'sending'/);
  assert.match(html, /pending\.status='failed'/);
  assert.match(html, /id="errorPanel" hidden/);
  assert.match(html, /\.error-panel\[hidden\]/);
  assert.match(html, /id="retryBtn"/);
  assert.match(html, /async function retry/);
  assert.match(html, /const runId=state\.lastFailedRun/);
  assert.match(html, /API\.retry\(state\.thread\.id,runId\)/);
  assert.match(html, /发送失败，问题已保存/);
  assert.match(html, /AI 待配置 · 可查看历史/);
  assert.match(html, /\$\('retryBtn'\)\.hidden=!state\.lastFailedRun/);
  assert.match(html, /function applyThread[\s\S]*clearFailure\(\)/);
  assert.match(html, /已核验本次训练/);
  assert.match(html, /训练事实由服务端按当前账号核验/);
});

test('shows thinking feedback and formats numbered answers into readable steps', () => {
  assert.match(html, /思考中/);
  assert.match(html, /className.*message-step|message-step/);
  assert.match(html, /function appendMessageText/);
  assert.match(html, /function paragraphChunks/);
  assert.match(html, /function appendRichInline/);
  assert.match(html, /message-formula/);
  assert.match(html, /\(\?:\\\.\\s\+\|、\)/);
  assert.doesNotMatch(html, /\^\(\\d\+\)\[\.、\]\\s\*/);
});

test('problem proposals require an explicit save action', () => {
  assert.match(html, /issue_proposals/);
  assert.match(html, /加入问题本/);
  assert.match(html, /saveProposal\(p\.id,btn\)/);
  assert.doesNotMatch(html, /sendMessage[\s\S]{0,500}saveProposal/);
});

test('dynamic provider and user text use textContent rather than innerHTML', () => {
  assert.match(html, /node\.textContent=String\(text\)/);
  assert.match(html, /\$\('errorText'\)\.textContent/);
  assert.doesNotMatch(scripts.join('\n'), /\.innerHTML\s*=/);
});

test('return_url is restricted to the current origin', () => {
  assert.match(html, /parsed\.origin === location\.origin/);
  assert.match(html, /parsed\.pathname\.startsWith\('\/'\)/);
  assert.match(html, /return_url:safeReturnUrl\(\)/);
});

test('shows the exact backend-selected Skill id and version', () => {
  assert.match(html, /function activeSkillText\(\)/);
  assert.match(html, /module\?\.skill_id/);
  assert.match(html, /`Skill \$\{module\.skill_id\} · v\$\{module\.skill_version\}`/);
  assert.match(html, /网址不传答案，训练事实按当前账号核验/);
});

test('keeps the three-column shell and explicit 390px layout guard', () => {
  assert.match(html, /grid-template-columns:\s*252px minmax\(460px, 1fr\) 360px/);
  assert.match(html, /@media \(max-width:390px\)/);
  assert.match(html, /overflow-x:hidden/);
  assert.match(html, /<aside class="sidebar">/);
  assert.match(html, /<main class="main">/);
  assert.match(html, /<aside class="ledger">/);
});
