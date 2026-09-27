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

test('loads Vue locally and exposes a visible thinking state', () => {
  assert.match(page, /\/node_modules\/vue\/dist\/vue\.global\.prod\.js/);
  assert.doesNotMatch(page, /unpkg\.com\/vue/);
  assert.match(page, /老师思考中/);
});

test('shenlun provider accepts the shared DeepSeek key name', () => {
  const route = fs.readFileSync('backend/shenlun.py', 'utf8');
  const grader = fs.readFileSync('backend/src/grader.py', 'utf8');
  const tracker = fs.readFileSync('backend/src/mistake_tracker.py', 'utf8');
  assert.match(grader, /os\.getenv\("LLM_API_KEY"\) or os\.getenv\("DEEPSEEK_API_KEY"/);
  assert.match(tracker, /os\.getenv\("LLM_API_KEY"\) or os\.getenv\("DEEPSEEK_API_KEY"/);
  assert.match(route, /await asyncio\.to_thread\(llm_grade/);
  assert.match(route, /await asyncio\.to_thread\(llm_chat/);
  assert.match(route, /await asyncio\.to_thread\([\s\S]*call_llm_api/);
});

test('formal grading and ordinary questions are separate actions', () => {
  assert.match(page, /@click="gradeAnswer"/);
  assert.match(page, /\/api\/shenlun\/grade/);
  assert.match(page, /\/api\/shenlun\/chat/);
  assert.match(page, /向老师提问，回复后可手动加入问题追踪/);
  assert.match(page, /加入问题追踪/);
  assert.match(page, /historyId:d\.historyId/);
  assert.match(page, /JSON\.stringify\(\{historyId:message\.historyId\}\)/);
});

test('formal grading reuses one idempotency key across network and pending retries', async () => {
  const start = page.indexOf('function responseMessage(');
  const end = page.indexOf('// ─── Vue App', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const responses = [
    {
      status: 409,
      ok: false,
      async json() {
        return {detail:{code:'idempotency_in_progress',message:'仍在处理'}};
      },
    },
    {
      status: 200,
      ok: true,
      async json() {
        return {id:'same-result'};
      },
    },
  ];
  const context = {
    window: {crypto:{randomUUID:()=> 'fixed-grade-key'}},
    setTimeout(callback) { callback(); },
    apiFetch: async (path, options) => {
      calls.push({path, options});
      return responses.shift();
    },
  };
  vm.runInNewContext(
    `${page.slice(start, end)}\nglobalThis.gradeHelpers={responseMessage,createGradeRequestKey,requestFormalGrade};`,
    context,
  );
  assert.equal(context.gradeHelpers.createGradeRequestKey(), 'fixed-grade-key');
  const result = await context.gradeHelpers.requestFormalGrade(
    {questionId:'q3-1',studentAnswer:'同一作答'},
    'fixed-grade-key',
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.body.id, 'same-result');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.path === '/api/shenlun/grade'));
  assert.ok(calls.every(call => call.options.headers['Idempotency-Key'] === 'fixed-grade-key'));
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(
    context.gradeHelpers.responseMessage({detail:{message:'可读错误'}}, '后备'),
    '可读错误',
  );
});

test('a retryable grade stays attached to its original answer and key', () => {
  assert.match(page, /let pendingGradeAttempt=null/);
  assert.match(page, /pendingGradeAttempt&&pendingGradeAttempt\.questionId===questionId&&pendingGradeAttempt\.studentAnswer===text/);
  assert.match(page, /\{questionId,studentAnswer:text,key:createGradeRequestKey\(\),displayed:false\}/);
  assert.match(page, /e\.code!==['"]network_unavailable['"]&&e\.code!==['"]idempotency_in_progress['"]/);
  assert.match(page, /inputText\.value=text/);
  assert.doesNotMatch(page, /throw new Error\(e\.detail\|\|['"]批改失败['"]\)/);
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
  assert.match(page, /m\.questionText\|\|m\.questionTitle/);
  assert.match(page, /m\.questionRequirement/);
  assert.match(page, /m\.material/);
});

test('Word and PDF exports share one escaped complete tracking document', () => {
  assert.match(page, /function buildTrackingDocument\(\)/);
  assert.match(page, /const content=buildTrackingDocument\(\)/);
  assert.match(page, /win\.document\.write\(buildTrackingDocument\(\)\)/);
  assert.match(page, /_esc\(m\.questionText\|\|m\.questionTitle\|\|''\)/);
  assert.match(page, /飞扬申论 · 问题追踪/);
  assert.doesNotMatch(page, /document\.querySelector\('\.tracking-panel'\)/);
});

test('delete and clear only mutate local state after a successful response', () => {
  assert.match(page, /if\(!r\.ok\).*删除失败/);
  assert.match(page, /if\(!r\.ok\).*清空失败/);
});

test('untrusted AI html is escaped instead of passed through', () => {
  assert.doesNotMatch(page, /if \(raw\.startsWith\('<'\)\) return raw/);
  assert.match(page, /if \(raw\.startsWith\('<'\)\) return .*_esc\(raw\)/);
});
