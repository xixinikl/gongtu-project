import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const auth = fs.readFileSync('gontu-auth-client.js', 'utf8');
const shell = fs.readFileSync('智学成语-高级版.html', 'utf8');
const mindmap = fs.readFileSync('mindmap.html', 'utf8');
const shenlun = fs.readFileSync('shenlun.html', 'utf8');
const reading = fs.readFileSync('verbal-reading-pilot.html', 'utf8');

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
