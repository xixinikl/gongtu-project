import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shell = fs.readFileSync('智学成语-高级版.html', 'utf8');

test('formal shell keeps module navigation available on small screens', () => {
  assert.match(shell, /class="app-nav-toggle"[^>]*aria-controls="deckTabs"[^>]*aria-expanded="false"/);
  assert.match(shell, /app-navbar\[data-nav-open="true"\] \.deck-tabs \{ display: flex;/);
  assert.match(shell, /@media \(max-width: 720px\)/);
  assert.match(shell, /formalNavigationToggle\.addEventListener\('click'/);
  assert.match(shell, /event\.key !== 'Escape' \|\| formalNavigationShell\.dataset\.navOpen !== 'true'/);
});

test('formal shell exposes a visible keyboard focus path and a skip link', () => {
  assert.match(shell, /class="skip-link" href="#learningZone">跳至学习内容/);
  assert.match(shell, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible/);
});

test('formal shell honors reduced motion beyond the entrance observer', () => {
  assert.match(shell, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(shell, /animation-duration: 0\.01ms !important;/);
  assert.match(shell, /transition-duration: 0\.01ms !important;/);
});
