#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const inDir = join(root, 'output', 'quantity-bank', 'answer_recheck_parallel');
const cleanFile = join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json');
const repairsFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');
const outFile = join(inDir, 'repair_candidates_from_answer_recheck.json');
const apply = process.argv.includes('--apply');
const mismatchesOnly = process.argv.includes('--mismatches-only');
const confirmedOnly = process.argv.includes('--confirmed-only');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function normalizeResult(raw) {
  return {
    id: raw.id,
    current_answer: raw.current_answer,
    verdict: raw.verdict,
    confirmed_answer: raw.confirmed_answer,
    evidence_source: raw.evidence_source || '',
    evidence_note: raw.evidence_note || '',
    should_upgrade_to_manual_verified: Boolean(raw.should_upgrade_to_manual_verified),
    risk_note: raw.risk_note || ''
  };
}

function resultFiles() {
  if (!existsSync(inDir)) return [];
  return readdirSync(inDir)
    .filter(name => /^result_.*\.json$/.test(name))
    .sort()
    .map(name => join(inDir, name));
}

const clean = readJson(cleanFile);
const cleanById = new Map(clean.map(item => [item.id, item]));
const repairsPayload = readJson(repairsFile);
const existingManualIds = new Set((repairsPayload.repairs || [])
  .filter(repair => /manual_.*page_recovery|verified_original_page|original_question_page_visual_review/.test(repair.source?.type || ''))
  .map(repair => repair.id));

const files = resultFiles();
const results = [];
for (const file of files) {
  const payload = readJson(file);
  for (const raw of payload.results || []) results.push(normalizeResult(raw));
}

const candidates = [];
const rejected = [];
for (const result of results) {
  const item = cleanById.get(result.id);
  if (!item) {
    rejected.push({ id: result.id, reason: 'missing_clean_candidate' });
    continue;
  }
  if (!/analysis|解析|page|pdf|原页|原图/i.test(`${result.evidence_source} ${result.evidence_note}`)) {
    rejected.push({ id: result.id, reason: 'weak_evidence_source' });
    continue;
  }

  if (result.verdict === 'mismatch') {
    if (confirmedOnly) {
      rejected.push({ id: result.id, reason: 'skipped_mismatch_confirmed_only' });
      continue;
    }
    const currentAnswer = item.content?.answer;
    if (!currentAnswer || result.current_answer !== currentAnswer) {
      rejected.push({
        id: result.id,
        reason: 'mismatch_current_answer_changed',
        current_answer: currentAnswer,
        result_current_answer: result.current_answer,
        confirmed_answer: result.confirmed_answer
      });
      continue;
    }
    if (!/^[A-D]$/.test(result.confirmed_answer || '')) {
      rejected.push({ id: result.id, reason: 'invalid_confirmed_answer', confirmed_answer: result.confirmed_answer });
      continue;
    }
    candidates.push({
      id: item.id,
      source: {
        type: 'manual_analysis_page_answer_correction',
        review_note: `并行答案复核发现冲突，按解析原页修正：${result.evidence_note || result.evidence_source}`
      },
      fields: {
        answer: result.confirmed_answer,
        answer_source: 'manual_analysis_page_recovery'
      }
    });
    continue;
  }

  if (result.verdict !== 'confirmed') {
    rejected.push({ id: result.id, reason: `verdict_${result.verdict || 'missing'}` });
    continue;
  }
  if (mismatchesOnly) {
    rejected.push({ id: result.id, reason: 'skipped_confirmed_mismatches_only' });
    continue;
  }
  if (!result.should_upgrade_to_manual_verified) {
    rejected.push({ id: result.id, reason: 'not_marked_for_upgrade' });
    continue;
  }
  const currentAnswer = item.content?.answer;
  if (!currentAnswer || result.confirmed_answer !== currentAnswer || result.current_answer !== currentAnswer) {
    rejected.push({
      id: result.id,
      reason: 'answer_mismatch',
      current_answer: currentAnswer,
      result_current_answer: result.current_answer,
      confirmed_answer: result.confirmed_answer
    });
    continue;
  }
  if (existingManualIds.has(result.id)) {
    rejected.push({ id: result.id, reason: 'already_manual_verified' });
    continue;
  }
  candidates.push({
    id: item.id,
    source: {
      type: 'manual_analysis_page_recovery',
      review_note: `并行答案复核确认：${result.evidence_note || result.evidence_source}`
    },
    fields: {
      stem: item.content.stem,
      options: item.content.options,
      answer: currentAnswer,
      answer_source: 'manual_analysis_page_recovery',
      primary_topic: item.learning_tags.primary_topic,
      secondary_topics: item.learning_tags.secondary_topics || [],
      methods: item.learning_tags.methods || [],
      analysis: item.content.analysis
    }
  });
}

const summary = {
  status: apply ? 'answer_recheck_repairs_applied' : 'dry_run_answer_recheck_repairs',
  result_files: files.map(file => file.replace(`${root}/`, '')),
  total_results: results.length,
  repair_candidates: candidates.length,
  rejected: rejected.length,
  output: outFile.replace(`${root}/`, ''),
  applied: apply,
  mismatches_only: mismatchesOnly,
  confirmed_only: confirmedOnly
};

mkdirSync(inDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify({ summary, candidates, rejected }, null, 2)}\n`);

if (apply && candidates.length) {
  const nextPayload = {
    ...repairsPayload,
    repairs: [...(repairsPayload.repairs || []), ...candidates]
  };
  writeFileSync(repairsFile, `${JSON.stringify(nextPayload, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));
