import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pipeline = readFileSync(new URL('../tools/quantity-bank-pipeline.mjs', import.meta.url), 'utf8');

test('quantity pipeline falls back to the committed portable seed in a clean worktree', () => {
  assert.match(pipeline, /import \{ existsSync \} from 'node:fs';/u);
  assert.match(pipeline, /hasFlag\('portable'\)/u);
  assert.match(pipeline, /!existsSync\(join\(root, 'output', 'quantity-bank', 'raw_sets'\)\)/u);
  assert.match(pipeline, /tools\/quantity-bank-ci\.mjs \(portable approved seed\)/u);
  assert.match(pipeline, /mode: 'portable_approved_seed'/u);
});
