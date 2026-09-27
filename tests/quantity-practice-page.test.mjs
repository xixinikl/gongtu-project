import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../quantity-practice.html', import.meta.url), 'utf8');

test('inline script parses as JavaScript', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `inline-${index}.js` })));
});

test('requires the existing token and uses only real quantity routes', () => {
  assert.match(html, /TOKEN_KEY='gontu_token'/);
  assert.match(html, /\/api\/quantity\/sets/);
  assert.match(html, /\/api\/quantity\/sessions/);
  assert.match(html, /Authorization:'Bearer '/);
  assert.doesNotMatch(html, /Math\.random|fake|mock/i);
});

test('supports the full practice evidence loop', () => {
  for (const marker of ['data-answer', '先跳过', 'stuck_step', 'elapsed_ms', '正在保存', '交卷并复盘', 'review_questions']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  assert.match(html, /q\.options\.map/);
  assert.match(html, /q\.media\|\|\[\]/);
  assert.match(html, /URL\.createObjectURL/);
});

test('truthfully discloses incomplete analysis visual audit', () => {
  assert.match(html, /42 道解析文字提到辅助图/);
  assert.match(html, /不宣称解析视觉已 100% 还原/);
});

test('contains responsive and accessible interaction foundations', () => {
  assert.match(html, /@media\(max-width:560px\)/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /aria-live="polite"/);
});
