import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('backend/main.py', 'utf8');
const homepage = readFileSync('doc/prototypes/homepage-middle-ink-morph.html', 'utf8');
const legacyHomepage = readFileSync('index.html', 'utf8');
const appPage = readFileSync('智学成语-高级版.html', 'utf8');

test('formal root serves the confirmed ink homepage while /app stays stable', () => {
  assert.match(
    backend,
    /PARENT_DIR, "doc", "prototypes", "homepage-middle-ink-morph\.html"/,
  );
  assert.match(backend, /@app\.get\("\/app"/);
  assert.match(backend, /PARENT_DIR, "智学成语-高级版\.html"/);
});

test('homepage fragments load legacy index explicitly and cannot recurse through root', () => {
  assert.equal((homepage.match(/src="\/index\.html"/g) || []).length, 2);
  assert.doesNotMatch(homepage, /<iframe[^>]+src="\/"/);
});

test('homepage-owned assets remain valid when the prototype is served at root', () => {
  assert.equal(
    (homepage.match(/\/doc\/prototypes\/assets\/gontu-module-ink-atlas-v1\.png/g) || []).length,
    2,
  );
  assert.match(
    homepage,
    /\/doc\/prototypes\/assets\/homepage-middle\/SmileySans-Oblique\.woff2/,
  );
  assert.doesNotMatch(homepage, /(?:url\(|atlasURL\s*=\s*)['"]\.\/assets\//);
});

test('homepage enters /app at top level and the function page returns to root', () => {
  assert.match(homepage, /inlineAction\.includes\('startLearning'\)/);
  assert.match(homepage, /inlineAction\.includes\("location\.href='\/app'"\)/);
  assert.match(homepage, /doc\.defaultView\.top\.location\.assign\('\/app'\)/);
  assert.match(legacyHomepage, /onclick="window\.location\.href='\/app'"/);
  assert.match(appPage, /window\.location\.href='\/'/);
});
