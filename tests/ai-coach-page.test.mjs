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

test('persists threads, renders loading and failure, and supports explicit retry', () => {
  assert.match(html, /async function loadThreads/);
  assert.match(html, /async function openThread/);
  assert.match(html, /status:'sending'/);
  assert.match(html, /pending\.status='failed'/);
  assert.match(html, /id="errorPanel" hidden/);
  assert.match(html, /id="retryBtn"/);
  assert.match(html, /async function retry/);
  assert.match(html, /发送失败，问题已保存/);
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

test('keeps the three-column shell and explicit 390px layout guard', () => {
  assert.match(html, /grid-template-columns:\s*252px minmax\(460px, 1fr\) 360px/);
  assert.match(html, /@media \(max-width:390px\)/);
  assert.match(html, /overflow-x:hidden/);
  assert.match(html, /<aside class="sidebar">/);
  assert.match(html, /<main class="main">/);
  assert.match(html, /<aside class="ledger">/);
});
