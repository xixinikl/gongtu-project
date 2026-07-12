#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`quantity-bank-pipeline

Usage:
  node tools/quantity-bank-pipeline.mjs [--skip-build]

Options:
  --skip-build   Reuse existing raw_sets/page OCR outputs and run the cheaper
                 clean/export/queue/assets/validation/CI chain.
  --help         Show this help without running the pipeline.

Notes:
  This command never calls the paid vision model. It only prepares the full
  vision task list in dry-run mode. To execute vision repair, run
  tools/quantity-bank-vision-repair-batch.mjs with --execute and explicit
  QUANTITY_VISION_* environment variables. You can narrow repair batches with
  --lane=answer_recovery, --lane=options_recovery, --lane=stem_recovery,
  --lane=stem_analysis_rematch, or --lane=image_crop_and_structure_repair.
`);
}

function run(step) {
  const script = typeof step === 'string' ? step : step.script;
  const args = typeof step === 'string' ? [] : (step.args || []);
  const startedAt = Date.now();
  console.log(`\n▶ node ${[script, ...args].join(' ')}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
  console.log(`✓ ${[script, ...args].join(' ')} (${Date.now() - startedAt} ms)`);
}

if (hasFlag('help') || hasFlag('h')) {
  printHelp();
  process.exit(0);
}

const skipBuild = hasFlag('skip-build');
const scripts = [
  ...(skipBuild ? [] : ['tools/quantity-bank-build-raw-sets.mjs']),
  'tools/quantity-bank-clean-candidates.mjs',
  'tools/quantity-bank-export-review.mjs',
  'tools/quantity-bank-export-approved.mjs',
  'tools/quantity-bank-export-vision-queue.mjs',
  { script: 'tools/quantity-bank-render-repair-assets.mjs', args: ['--limit=all', '--target=all', '--dpi=180'] },
  { script: 'tools/quantity-bank-vision-repair-batch.mjs', args: ['--limit=all'] },
  'tools/quantity-bank-export-crop-assets.mjs',
  'tools/quantity-bank-audit-crop-assets.mjs',
  'tools/quantity-bank-import-crop-media.mjs',
  'tools/quantity-bank-test-vision-import-gates.mjs',
  'tools/quantity-bank-validate-approved.mjs',
  'tools/quantity-bank-audit-approved-answers.mjs',
  'tools/quantity-bank-audit-page-map.mjs',
  'tools/quantity-bank-ci.mjs'
];

try {
  for (const script of scripts) run(script);
  console.log(JSON.stringify({
    status: 'quantity_bank_pipeline_passed',
    skipped_build: skipBuild,
    steps: scripts.length
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
