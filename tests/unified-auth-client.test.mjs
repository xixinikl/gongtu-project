import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const auth = fs.readFileSync('gontu-auth-client.js', 'utf8');
const shell = fs.readFileSync('智学成语-高级版.html', 'utf8');
const mindmap = fs.readFileSync('mindmap.html', 'utf8');
const shenlun = fs.readFileSync('shenlun.html', 'utf8');
const reading = fs.readFileSync('verbal-reading-pilot.html', 'utf8');
const home = fs.readFileSync('index.html', 'utf8');
const admin = fs.readFileSync('admin.html', 'utf8');

test('unified shell loads the shared auth client before its inline auth module', () => {
  const shared = shell.indexOf('/gontu-auth-client.js');
  const inline = shell.indexOf('GONTU_TOKEN_KEY');
  assert.ok(shared >= 0 && shared < inline);
});

test('formal shell exposes the account area required for logout and A/B switching', () => {
  assert.match(shell, /id="navAuthArea"/);
  assert.match(shell, /onclick="logout\(\)"/);
  assert.match(shell, /localStorage\.removeItem\(GONTU_TOKEN_KEY\)/);
  assert.match(shell, /localStorage\.removeItem\(GONTU_USER_KEY\)/);
});

test('administrators can move between the learning and management workspaces', () => {
  assert.match(shell, /isAdmin \? '<button class="btn-nav"[^>]+>.*管理后台/);
  assert.match(shell, /window\.location\.href=\\'\/admin\\'/);
  assert.match(home, /navigateTop\(\\'\/admin\\'\)/);
  assert.match(admin, /class="btn-study" href="\/app">进入学习端<\/a>/);
});

test('shared auth client uses the existing token and user identity keys', () => {
  assert.match(auth, /TOKEN_KEY = 'gontu_token'/);
  assert.match(auth, /USER_KEY = 'gontu_user'/);
  assert.match(auth, /payload\.user_id/);
  assert.match(auth, /Authorization = `Bearer \$\{value\}`/);
});

test('401 clears identity only and never deletes backend learning data', () => {
  const clearBlock = auth.slice(auth.indexOf('function clearIdentity'), auth.indexOf('function loginUrl'));
  assert.match(clearBlock, /removeItem\(TOKEN_KEY\)/);
  assert.match(clearBlock, /removeItem\(USER_KEY\)/);
  assert.doesNotMatch(clearBlock, /fetch|DELETE|learning|deck|history/);
  assert.match(auth, /response\.status === 401/);
  assert.match(auth, /gontu:auth-required/);
});

test('existing specialist pages already share the same JWT token key', () => {
  for (const [name, page] of Object.entries({ mindmap, shenlun, reading })) {
    assert.match(page, /gontu_token/, `${name} must use the shared token key`);
    assert.match(page, /Authorization/, `${name} must send JWT authorization`);
  }
});

test('home page and formal shell use the current origin outside static port 8089', () => {
  for (const [name, page] of Object.entries({ home, shell })) {
    assert.match(page, /window\.__GONTU_API_BASE__/u, `${name} must allow an explicit API override`);
    assert.match(page, /location\.origin/u, `${name} must use the current origin for formal hosting`);
  }
  assert.doesNotMatch(home, /var GONTU_API_BASE = 'http:\/\/127\.0\.0\.1:8888';/u);
});
