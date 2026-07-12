#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const imageDependencyPattern = /如图|如下图|下图|右图|左图|图所示|示意图|下表|表格|根据下表/;
const failures = [];

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), 'utf8'));
}

function fail(message) {
  failures.push(message);
}

function hasUsableQuestionMedia(media) {
  return Array.isArray(media)
    && media.some(item => item?.type === 'question_figure_crop'
      && typeof item.asset === 'string'
      && existsSync(item.asset)
      && Array.isArray(item.crop_box)
      && item.crop_box.length === 4
      && item.crop_box.every(value => Number.isFinite(Number(value)))
      && !/解析/.test(item.source_pdf || ''));
}

const clean = readJson('output', 'quantity-bank', 'clean_candidates', 'all_questions.json');
const approved = readJson('output', 'quantity-bank', 'approved_seed', 'questions.json');
const approvedSummary = readJson('output', 'quantity-bank', 'approved_seed', 'summary.json');
const queuePayload = readJson('output', 'quantity-bank', 'vision_repair_queue.json');
const queue = queuePayload.queue || [];
const visionTasks = readJson('output', 'quantity-bank', 'vision_model_outputs', 'vision_tasks_latest.json');
const filteredVisionTasks = existsSync(join(root, 'output', 'quantity-bank', 'vision_model_outputs', 'vision_tasks_latest_filtered.json'))
  ? readJson('output', 'quantity-bank', 'vision_model_outputs', 'vision_tasks_latest_filtered.json')
  : null;
const cropManifest = readJson('output', 'quantity-bank', 'crop_assets', 'crop_assets_manifest.json');
const cropImport = readJson('output', 'quantity-bank', 'crop_import', 'crop_media_repair_candidates.json');
const repairs = readJson('data', 'quantity_bank', 'verified_repairs.json').repairs || [];
const portableManifest = existsSync(join(root, 'data', 'quantity_bank', 'approved_seed_manifest.json'))
  ? readJson('data', 'quantity_bank', 'approved_seed_manifest.json')
  : null;
const legacyDemoPath = join(root, 'quantity-redesign-demo.html');
const productionPracticePath = join(root, 'quantity-practice.html');
const publicDemoHtml = existsSync(legacyDemoPath)
  ? readFileSync(legacyDemoPath, 'utf8')
  : readFileSync(productionPracticePath, 'utf8');
const reviewPath = join(root, 'quantity-bank-review.html');
const reviewHtml = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : '';

if (clean.length !== 600) fail(`clean_candidates count is ${clean.length}, expected 600`);
if (approved.length !== approvedSummary.total) fail(`approved length ${approved.length} != summary total ${approvedSummary.total}`);
if (approvedSummary.excluded !== clean.length - approved.length) fail('approved summary excluded does not match clean-approved');
const answerTierCounts = approvedSummary.by_answer_audit_tier || {};
const answerTierTotal = Object.values(answerTierCounts).reduce((sum, count) => sum + Number(count || 0), 0);
if (answerTierTotal !== approved.length) fail(`answer audit tier total ${answerTierTotal} != approved ${approved.length}`);
const approvedMissingAnswerTier = approved.filter(item => !item.tags?.answer_audit_tier);
if (approvedMissingAnswerTier.length) {
  fail(`approved items missing answer_audit_tier: ${approvedMissingAnswerTier.slice(0, 10).map(item => item.id).join(', ')}`);
}
const approvedNeedingRecheck = approved.filter(item => item.tags?.answer_requires_original_recheck);
if (approvedSummary.answer_recheck_recommended !== approvedNeedingRecheck.length) {
  fail(`answer_recheck_recommended ${approvedSummary.answer_recheck_recommended} != item count ${approvedNeedingRecheck.length}`);
}
if (queue.length !== queuePayload.summary?.queue_items) fail(`queue length ${queue.length} != summary queue_items ${queuePayload.summary?.queue_items}`);
if (approved.length + queue.length !== clean.length) fail(`approved+queue=${approved.length + queue.length}, expected ${clean.length}`);

if (existsSync(legacyDemoPath)) {
  if (!publicDemoHtml.includes('/output/quantity-bank/approved_seed/questions.json')) {
    fail('quantity demo does not read approved_seed questions');
  }
} else if (!publicDemoHtml.includes('/api/quantity/')) {
  fail('production quantity practice does not read the authenticated quantity API');
}
for (const forbiddenPath of [
  '/output/quantity-bank/clean_candidates/',
  '/output/quantity-bank/review_queue',
  '/output/quantity-bank/vision_repair_queue',
  '/output/quantity-bank/question_status_'
]) {
  if (publicDemoHtml.includes(forbiddenPath)) {
    fail(`quantity demo must not read backend queue path: ${forbiddenPath}`);
  }
}
if (existsSync(reviewPath) && !reviewHtml.includes('/output/quantity-bank/clean_candidates/all_questions.json')) {
  fail('review page should read clean_candidates as the backend audit surface');
}

const laneCounts = queuePayload.summary?.by_repair_lane || {};
const laneTotal = Object.values(laneCounts).reduce((sum, count) => sum + Number(count || 0), 0);
if (laneTotal !== queue.length) fail(`repair lane total ${laneTotal} != queue ${queue.length}`);
const queueMissingLane = queue.filter(item => !item.repair_lane || !Array.isArray(item.automatic_blockers));
if (queueMissingLane.length) fail(`queue items missing repair_lane/automatic_blockers: ${queueMissingLane.slice(0, 10).map(item => item.id).join(', ')}`);

const approvedIds = new Set(approved.map(item => item.id));
const queueIds = new Set(queue.map(item => item.id));
const overlap = [...approvedIds].filter(id => queueIds.has(id));
if (overlap.length) fail(`approved and queue overlap: ${overlap.slice(0, 10).join(', ')}`);

const imageApproved = approved.filter(item => imageDependencyPattern.test(item.stem || ''));
const imageApprovedWithoutMedia = imageApproved.filter(item => !hasUsableQuestionMedia(item.media));
if (imageApprovedWithoutMedia.length) {
  fail(`image-dependent approved items missing usable media: ${imageApprovedWithoutMedia.map(item => item.id).slice(0, 10).join(', ')}`);
}

const cleanImage = clean.filter(item => item.quality?.issues?.includes('image_dependent_question'));
const cleanImageWithoutMedia = cleanImage.filter(item => !hasUsableQuestionMedia(item.content?.media));
if (cleanImageWithoutMedia.length !== cleanImage.length) {
  fail('some image-dependent clean candidates have media but still carry image_dependent_question');
}

if (visionTasks.task_count !== queue.length) fail(`vision task_count ${visionTasks.task_count} != queue ${queue.length}`);
if (visionTasks.missing_image_tasks !== 0) fail(`vision missing_image_tasks is ${visionTasks.missing_image_tasks}`);
if (visionTasks.filters?.lane) fail(`full vision latest was overwritten by lane filter ${visionTasks.filters.lane}`);
if (filteredVisionTasks?.filters && !filteredVisionTasks.filters.lane && !filteredVisionTasks.filters.priority && !filteredVisionTasks.filters.route) {
  fail('filtered vision latest exists but has no filter');
}
if (queue.length > 0 && !visionTasks.tasks?.some(task => task.repair_route === 'vision_model_required' && task.prompt?.includes('crop_requests'))) {
  fail('vision tasks missing crop_requests prompt for required image repairs');
}
if (queue.length > 0 && !visionTasks.tasks?.every(task => task.prompt?.includes('修复泳道'))) {
  fail('vision tasks missing lane-specific prompt marker');
}

if (cropManifest.created_crops !== (cropManifest.created || []).length) fail('crop manifest created_crops mismatch');
if (cropManifest.rejected_crops !== (cropManifest.rejected || []).length) fail('crop manifest rejected_crops mismatch');
if (cropImport.crop_count !== cropManifest.created_crops) fail('crop import crop_count does not match manifest created_crops');
if (cropImport.repair_candidates !== (cropImport.candidates || []).length) fail('crop import repair_candidates mismatch');

const repairsWithMedia = repairs.filter(repair => repair.fields?.media?.length);
if (cropManifest.created_crops === 0 && repairsWithMedia.length && !portableManifest?.media_count) {
  fail('verified repairs contain media even though crop manifest has no created crops');
}

if (failures.length) {
  console.error(`Quantity bank CI failed: ${failures.length}`);
  console.error(failures.slice(0, 80).join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'quantity_bank_ci_passed',
  clean: clean.length,
  approved: approved.length,
  queue: queue.length,
  image_approved: imageApproved.length,
  clean_image_dependent: cleanImage.length,
  vision_tasks: visionTasks.task_count,
  repair_lanes: laneCounts,
  answer_audit_tiers: answerTierCounts,
  answer_recheck_recommended: approvedSummary.answer_recheck_recommended,
  public_demo_source: existsSync(legacyDemoPath) ? 'approved_seed_only' : 'authenticated_quantity_api',
  crop_assets: cropManifest.created_crops,
  crop_media_candidates: cropImport.repair_candidates
}, null, 2));
