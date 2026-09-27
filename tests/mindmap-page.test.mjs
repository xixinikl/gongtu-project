import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('mindmap.html', 'utf8');
const main = fs.readFileSync('backend/main.py', 'utf8');

test('mindmap uses authenticated media instead of direct data image URLs', () => {
  assert.match(page, /setAuthenticatedImage/);
  assert.match(page, /\/api\/mindmap\/questions\/'\+qid\+'\/image/);
  assert.doesNotMatch(page, /img\.src='\/data\/'\+q\.image_path/);
  assert.match(main, /parts\[:2\] == \["data", "images"\] and parts\[2\]\.isdigit\(\)/);
});

test('question editing sends JSON to the typed update endpoint', () => {
  assert.match(page, /body:JSON\.stringify\(payload\)/);
  assert.doesNotMatch(page, /method:'PUT',body:fd/);
});

test('review state is server-owned and no longer uses global localStorage counters', () => {
  assert.match(page, /\/api\/mindmap\/review-session/);
  assert.doesNotMatch(page, /rv_mastered_mindmap|rv_mindmap_/);
  assert.match(page, /Math\.max\(0,Math\.min\(100,pct\)\)/);
});

test('401 returns through a safe login next and mobile review becomes one column', () => {
  assert.match(page, /login\.html\?next=/);
  assert.match(page, /@media \(max-width:768px\)/);
  assert.match(page, /#t4\.tab-panel\{min-width:0/);
  assert.match(page, /review-main-row\{display:grid;grid-template-columns:1fr/);
});

test('empty mistake bank does not start an endless badge poll', () => {
  assert.match(page, /qs\.length>0&&!window\._badgeRetryDone/);
  assert.doesNotMatch(page, /window\._badgeRetry=null;loadBadges\(\)/);
});
