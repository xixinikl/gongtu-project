#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const paths = {
  approvedSummary: join(root, 'output', 'quantity-bank', 'approved_seed', 'summary.json'),
  cleanQuestions: join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json'),
  queue: join(root, 'output', 'quantity-bank', 'vision_repair_queue.json'),
  visionTasks: join(root, 'output', 'quantity-bank', 'vision_model_outputs', 'vision_tasks_latest.json'),
  cropManifest: join(root, 'output', 'quantity-bank', 'crop_assets', 'crop_assets_manifest.json'),
  cropImport: join(root, 'output', 'quantity-bank', 'crop_import', 'crop_media_repair_candidates.json')
};

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

const approvedSummary = readJson(paths.approvedSummary, {});
const cleanQuestions = readJson(paths.cleanQuestions, []);
const queuePayload = readJson(paths.queue, {});
const queueSummary = queuePayload.summary || {};
const queue = queuePayload.queue || queuePayload.items || [];
const visionTasks = readJson(paths.visionTasks, {});
const cropManifest = readJson(paths.cropManifest, {});
const cropImport = readJson(paths.cropImport, {});
const cleanById = new Map(cleanQuestions.map(item => [item.id, item]));
const issueCounts = queueSummary.by_issue || queuePayload.by_issue || {};
const topIssues = Object.entries(issueCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([issue, count]) => ({ issue, count }));

function hasRiskyAnswerSource(source = '') {
  return /dirty|garbled|ocr|prefix|low/i.test(source);
}

const queuedAnswerRisk = queue
  .map(item => {
    const candidate = cleanById.get(item.id);
    const source = candidate?.learning_tags?.answer_source || '';
    const answer = candidate?.content?.answer || item.current?.answer;
    const issues = item.issues || candidate?.quality?.issues || [];
    const riskReasons = [];
    if (!answer) return null;
    if (issues.includes('analysis_stem_mismatch') || issues.includes('analysis_auto_rematched_needs_review')) {
      riskReasons.push('answer_with_analysis_mismatch');
    }
    if (issues.includes('answer_low_confidence')) riskReasons.push('answer_low_confidence');
    if (hasRiskyAnswerSource(source)) riskReasons.push(`risky_answer_source:${source}`);
    if (!riskReasons.length) return null;
    return { id: item.id, answer, riskReasons };
  })
  .filter(Boolean);
const approvedRiskyAnswerSources = cleanQuestions.filter(item =>
  item.review_status === 'candidate_ok'
  && hasRiskyAnswerSource(item.learning_tags?.answer_source || '')
);

const hasVisionEnv = Boolean(
  (process.env.QUANTITY_VISION_BASE_URL || process.env.OPENAI_BASE_URL)
    && (process.env.QUANTITY_VISION_API_KEY || process.env.OPENAI_API_KEY)
    && (process.env.QUANTITY_VISION_MODEL || process.env.OPENAI_MODEL)
);

console.log(JSON.stringify({
  status: 'quantity_bank_status',
  clean_candidates: cleanQuestions.length,
  approved_seed: approvedSummary.total || 0,
  repair_queue: queue.length,
  image_dependent_in_queue: issueCounts.image_dependent_question || 0,
  routes: queueSummary.by_route || {},
  priorities: queueSummary.by_priority || {},
  lanes: queueSummary.by_repair_lane || {},
  vision_tasks: {
    task_count: visionTasks.task_count || 0,
    missing_image_tasks: visionTasks.missing_image_tasks ?? null,
    execute: Boolean(visionTasks.execute)
  },
  crop_assets: {
    created_crops: cropManifest.created_crops || 0,
    rejected_crops: cropManifest.rejected_crops || 0,
    repair_candidates: cropImport.repair_candidates || 0
  },
  answer_risk: {
    queued_items_with_answer_risk: queuedAnswerRisk.length,
    approved_items_with_audited_ocr_like_answer_source: approvedRiskyAnswerSources.length,
    approved_answer_audit_tiers: approvedSummary.by_answer_audit_tier || {},
    approved_answer_recheck_recommended: approvedSummary.answer_recheck_recommended || 0,
    approved_note: 'These approved items may have originated from OCR-like answer extraction, but they are still subject to approved answer audit gates.',
    queued_samples: queuedAnswerRisk.slice(0, 8)
  },
  top_issues: topIssues,
  next_bottleneck: hasVisionEnv
    ? 'Run npm run quantity:vision:execute after confirming cost/model settings.'
    : 'Vision API env is not configured; repair queue can be prepared but not batch-executed.',
  user_facing_rule: 'Frontend must read approved_seed only; repair_queue remains backend-only.'
}, null, 2));
