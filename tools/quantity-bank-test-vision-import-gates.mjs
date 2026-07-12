#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const tempDir = mkdtempSync(join(tmpdir(), 'quantity-vision-import-'));
const candidateFile = join(root, 'output', 'quantity-bank', 'vision_import', 'vision_repair_candidates.json');
const candidateBackup = existsSync(candidateFile) ? readFileSync(candidateFile, 'utf8') : null;

function writeJson(name, payload) {
  writeFileSync(join(tempDir, name), `${JSON.stringify(payload, null, 2)}\n`);
}

function runImport() {
  const result = spawnSync(process.execPath, [
    'tools/quantity-bank-import-vision-repairs.mjs',
    `--dir=${tempDir}`
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`vision import gate test failed to run:\n${result.stderr || result.stdout}`);
  }
  const match = result.stdout.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`vision import did not print JSON:\n${result.stdout}`);
  return JSON.parse(match[0]);
}

try {
  writeJson('answer-ok.json', {
    task: {
      id: 'quantity_hs13_gate_answer_ok',
      repair_lane: 'answer_recovery',
      images: []
    },
    raw: {
      id: 'quantity_hs13_gate_answer_ok',
      answer: 'B',
      evidence_note: '解析页清楚显示【参考答案】B',
      uncertainty: null,
      needs_original_crop: false
    }
  });

  writeJson('answer-no-evidence.json', {
    task: {
      id: 'quantity_hs13_gate_answer_no_evidence',
      repair_lane: 'answer_recovery',
      images: []
    },
    raw: {
      id: 'quantity_hs13_gate_answer_no_evidence',
      answer: 'C',
      uncertainty: null,
      needs_original_crop: false
    }
  });

  writeJson('image-reject.json', {
    task: {
      id: 'quantity_hs13_gate_image_reject',
      repair_lane: 'image_crop_and_structure_repair',
      images: []
    },
    raw: {
      id: 'quantity_hs13_gate_image_reject',
      answer: 'A',
      evidence_note: '模型读到答案',
      uncertainty: null,
      needs_original_crop: false
    }
  });

  writeJson('rematch-no-proof.json', {
    task: {
      id: 'quantity_hs13_gate_rematch_no_proof',
      repair_lane: 'stem_analysis_rematch',
      images: []
    },
    raw: {
      id: 'quantity_hs13_gate_rematch_no_proof',
      stem: '题干和解析看起来相关，但没有确认同题。',
      same_question: false,
      evidence_note: '无法证明同题',
      uncertainty: null,
      needs_original_crop: false
    }
  });

  const output = runImport();
  const payload = JSON.parse(readFileSync(candidateFile, 'utf8'));
  const candidateIds = new Set(payload.candidates.map(item => item.id));
  const rejectedIds = new Set(payload.rejected_items.map(item => item.id));

  const failures = [];
  if (output.total_outputs !== 4) failures.push(`expected 4 outputs, got ${output.total_outputs}`);
  if (output.candidate_repairs !== 1) failures.push(`expected 1 candidate, got ${output.candidate_repairs}`);
  if (output.rejected !== 3) failures.push(`expected 3 rejected, got ${output.rejected}`);
  if (!candidateIds.has('quantity_hs13_gate_answer_ok')) failures.push('answer_ok was not accepted');
  for (const id of [
    'quantity_hs13_gate_answer_no_evidence',
    'quantity_hs13_gate_image_reject',
    'quantity_hs13_gate_rematch_no_proof'
  ]) {
    if (!rejectedIds.has(id)) failures.push(`${id} was not rejected`);
  }

  if (failures.length) {
    throw new Error(failures.join('\n'));
  }

  console.log(JSON.stringify({
    status: 'vision_import_gate_test_passed',
    total_outputs: output.total_outputs,
    candidate_repairs: output.candidate_repairs,
    rejected: output.rejected
  }, null, 2));
} finally {
  if (candidateBackup !== null) {
    writeFileSync(candidateFile, candidateBackup);
  }
  rmSync(tempDir, { recursive: true, force: true });
}
