import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = fs.readFileSync('shenlun.html', 'utf8');

test('all inline scripts parse as JavaScript', () => {
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new vm.Script(source, {filename:`shenlun-inline-${index}.js`}));
  });
});

test('formal grading and ordinary questions are separate actions', () => {
  assert.match(page, /@click="gradeAnswer"/);
  assert.match(page, /\/api\/shenlun\/grade/);
  assert.match(page, /\/api\/shenlun\/chat/);
  assert.match(page, /向老师提问，不进入错题本/);
});

test('question source truth is loaded and missing content disables grading', () => {
  assert.match(page, /\/api\/shenlun\/catalog/);
  assert.match(page, /questionSourceUnavailable/);
  assert.match(page, /题源暂未提供/);
  assert.match(page, /当前题库 ·.*题材料摘要/);
  assert.match(page, /catalog\.value=\{catalogStatus:'not-provided'/);
  assert.match(page, /questions\.value=\[\]; selectedQuestion\.value=null/);
  assert.match(page, /:disabled="loading\|\|!inputText\.trim\(\)\|\|questionSourceUnavailable\|\|!!questionError"/);
  assert.match(page, /detail&&detail\.message/);
  assert.doesNotMatch(page, /questions\.value\s*=\s*\[\s*\{[^\]]+占位/);
});

test('mistake cards expose redo and single-delete actions', () => {
  assert.match(page, /@click="redoMistake\(m\)"/);
  assert.match(page, /@click="deleteMistake\(m\)"/);
  assert.match(page, /\/api\/shenlun\/mistakes\/'/);
});

test('delete and clear only mutate local state after a successful response', () => {
  assert.match(page, /if\(!r\.ok\).*删除失败/);
  assert.match(page, /if\(!r\.ok\).*清空失败/);
});

test('untrusted AI html is escaped instead of passed through', () => {
  assert.doesNotMatch(page, /if \(raw\.startsWith\('<'\)\) return raw/);
  assert.match(page, /if \(raw\.startsWith\('<'\)\) return .*_esc\(raw\)/);
});
