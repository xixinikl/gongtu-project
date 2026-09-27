#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(new URL('..', import.meta.url).pathname);
const defaultInputDir = join(root, 'tmp', 'quantity-batches');
const cropDir = join(root, 'output', 'quantity-bank', 'crop_assets', 'visual_batches');
const reportFile = join(root, 'output', 'quantity-bank', 'crop_import', 'visual_batch_candidates.json');
const repairFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');
const questionPagesDir = join(root, 'output', 'quantity-bank', 'repair_assets', 'questions');
const minCropAreaRatio = 0.003;
const maxCropAreaRatio = 0.55;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function validBBox(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.every(item => Number.isFinite(Number(item)))
    && Number(value[0]) >= 0
    && Number(value[1]) >= 0
    && Number(value[2]) > 0
    && Number(value[3]) > 0
    && Number(value[0]) + Number(value[2]) <= 1
    && Number(value[1]) + Number(value[3]) <= 1;
}

function validOptions(options) {
  return Array.isArray(options)
    && options.length === 4
    && options.every((option, index) => option?.key === 'ABCD'[index] && String(option.text || '').trim());
}

function normalizeOptions(options) {
  if (Array.isArray(options)) {
    return options.map(option => ({
      ...option,
      text: option?.text || (option?.kind === 'image' && option?.key ? `见原图选项 ${option.key}` : option?.text)
    }));
  }
  if (options && typeof options === 'object') {
    return ['A', 'B', 'C', 'D'].map(key => ({ key, text: options[key] }));
  }
  return [];
}

function normalizeBBox(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return [value.x, value.y, value.width, value.height];
  }
  return value;
}

function normalizeQuestionPage(value) {
  if (Number.isInteger(Number(value)) && Number(value) > 0) return Number(value);
  const match = String(value || '').match(/page-(\d{3})\.png$/);
  return match ? Number(match[1]) : NaN;
}

function hasUncertainty(value) {
  const text = String(value || '').trim();
  return Boolean(text && !/^无(?:[；;。,.，]|$)/.test(text));
}

function pageImage(page) {
  return join(questionPagesDir, `数量关系600题_page-${String(page).padStart(3, '0')}.png`);
}

function cropRect(bbox, width, height) {
  const [x, y, w, h] = bbox.map(Number);
  const left = Math.floor(x * width);
  const top = Math.floor(y * height);
  const right = Math.ceil((x + w) * width);
  const bottom = Math.ceil((y + h) * height);
  return { left, top, width: right - left, height: bottom - top };
}

function loadItems(inputDir) {
  const files = readdirSync(inputDir).filter(name => /^sets\d{2}-\d{2}\.json$/.test(name)).sort();
  return files.flatMap(name => {
    const file = join(inputDir, name);
    const payload = readJson(file);
    const items = Array.isArray(payload) ? payload : payload.items || payload.questions || [];
    return items.map(item => ({ ...item, batch_file: file }));
  });
}

function loadAnswerAudits(inputDir) {
  const audits = new Map();
  for (const name of ['answer-audit-01-30.json', 'answer-audit-31-60.json']) {
    const file = join(inputDir, name);
    if (!existsSync(file)) continue;
    const payload = readJson(file);
    const items = Array.isArray(payload) ? payload : payload.items || payload.results || payload.questions || [];
    for (const item of items) audits.set(item.id, { ...item, audit_file: file });
  }
  return audits;
}

async function buildCandidate(item) {
  const failures = [];
  const id = String(item.id || '').trim();
  const answerAudit = answerAudits.get(id);
  const page = normalizeQuestionPage(item.question_page);
  const options = normalizeOptions(item.options);
  const bboxes = (item.figure_bboxes_normalized || []).map(normalizeBBox);
  const cropMasks = (item.figure_masks_in_crop_normalized || []).map(normalizeBBox);
  if (!/^quantity_hs13_set\d{2}_q\d{2}$/.test(id)) failures.push('invalid id');
  if (!(typeof item.stem === 'string' && item.stem.trim())) failures.push('stem missing');
  if (!validOptions(options)) failures.push('options must be complete ordered A/B/C/D');
  if (!['A', 'B', 'C', 'D'].includes(item.answer)) failures.push('answer must be A/B/C/D');
  if (!answerAudit) failures.push('independent answer audit missing');
  if (answerAudit && answerAudit.match !== true) failures.push('independent answer audit did not pass');
  if (answerAudit && answerAudit.batch_answer !== item.answer) failures.push(`batch answer differs from audit: ${item.answer} != ${answerAudit.batch_answer}`);
  if (answerAudit && answerAudit.original_answer !== item.answer) failures.push(`original analysis answer differs: ${item.answer} != ${answerAudit.original_answer}`);
  if (answerAudit && !(typeof answerAudit.stem_anchor === 'string' && answerAudit.stem_anchor.trim())) failures.push('answer audit stem_anchor missing');
  if (answerAudit?.evidence_page && !existsSync(resolve(root, answerAudit.evidence_page))) failures.push(`answer evidence page missing: ${answerAudit.evidence_page}`);
  if (!(typeof item.primary_topic === 'string' && item.primary_topic.trim())) failures.push('primary_topic missing');
  if (!(Array.isArray(item.methods) && item.methods.length >= 1 && item.methods.length <= 3)) failures.push('methods must contain 1-3 items');
  if (!(typeof item.analysis_note === 'string' && item.analysis_note.trim())) failures.push('analysis_note missing');
  if (hasUncertainty(item.uncertainty)) failures.push(`uncertainty: ${item.uncertainty}`);
  if (!Number.isInteger(page) || page < 1) failures.push('question_page must be a positive integer');
  if (!Array.isArray(bboxes) || !bboxes.length) failures.push('at least one figure bbox is required');
  if (Array.isArray(bboxes) && bboxes.some(bbox => !validBBox(bbox))) failures.push('invalid figure bbox');
  if (cropMasks.some(mask => !validBBox(mask))) failures.push('invalid crop mask');

  const sourceImage = pageImage(page);
  if (!existsSync(sourceImage)) failures.push(`question page image missing: ${sourceImage}`);
  if (failures.length) return { id, status: 'rejected', failures, item };

  const metadata = await sharp(sourceImage).metadata();
  const media = [];
  for (let index = 0; index < bboxes.length; index += 1) {
    const bbox = bboxes[index].map(Number);
    const rect = cropRect(bbox, metadata.width, metadata.height);
    const ratio = (rect.width * rect.height) / (metadata.width * metadata.height);
    if (ratio < minCropAreaRatio || ratio > maxCropAreaRatio) {
      failures.push(`crop ${index + 1} area ratio ${ratio.toFixed(4)} outside ${minCropAreaRatio}-${maxCropAreaRatio}`);
      continue;
    }
    const asset = join(cropDir, `${id}_crop_${String(index + 1).padStart(2, '0')}.png`);
    const mask = cropMasks[index];
    const pipeline = sharp(sourceImage).extract(rect);
    if (mask) {
      const maskRect = cropRect(mask, rect.width, rect.height);
      pipeline.composite([{
        input: {
          create: {
            width: maskRect.width,
            height: maskRect.height,
            channels: 3,
            background: 'white'
          }
        },
        left: maskRect.left,
        top: maskRect.top
      }]);
    }
    await pipeline.png().toFile(asset);
    media.push({
      type: 'question_figure_crop',
      asset,
      source_pdf: '数量关系600题.pdf',
      source_page: page,
      crop_box: bbox,
      note: `原 PDF 题干局部裁图 ${index + 1}/${bboxes.length}；仅保留作答所需图形${mask ? '，白底遮除裁框边缘的无关题干残片' : ''}。`
    });
  }
  if (failures.length) return { id, status: 'rejected', failures, item };

  return {
    id,
    status: 'candidate',
    repair: {
      id,
      source: {
        type: 'manual_visual_original_page_recovery',
        question_page: basename(sourceImage),
        batch_file: item.batch_file,
        answer_audit_file: answerAudit?.audit_file || null,
        analysis_evidence_page: answerAudit?.evidence_page ? basename(answerAudit.evidence_page) : null,
        stem_anchor: answerAudit?.stem_anchor || null,
        review_note: '逐题查看原题页与解析页，结构字段和原图裁剪仍需主 Agent 最终视觉复核后方可入库。'
      },
      fields: {
        stem: item.stem.trim(),
        options: options.map(option => ({ key: option.key, text: String(option.text).trim() })),
        answer: item.answer,
        answer_source: 'verified_original_analysis_page',
        primary_topic: item.primary_topic.trim(),
        methods: item.methods.map(String).map(value => value.trim()).filter(Boolean),
        analysis: item.analysis_note.trim(),
        media
      }
    }
  };
}

function mergeRepairs(existing, additions, managedIds) {
  const byId = new Map((existing.repairs || []).map(repair => [repair.id, repair]));
  const approvedIds = new Set(additions.map(repair => repair.id));
  for (const [id, repair] of byId) {
    if (managedIds.has(id)
      && repair?.source?.type === 'manual_visual_original_page_recovery'
      && !approvedIds.has(id)) {
      byId.delete(id);
    }
  }
  for (const repair of additions) byId.set(repair.id, repair);
  return { ...existing, repairs: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

const inputDir = resolve(argValue('dir', defaultInputDir));
const apply = hasFlag('apply');
if (!existsSync(inputDir)) throw new Error(`Visual batch directory not found: ${inputDir}`);
mkdirSync(cropDir, { recursive: true });
mkdirSync(resolve(reportFile, '..'), { recursive: true });

const answerAudits = loadAnswerAudits(inputDir);
const items = loadItems(inputDir);
const results = [];
for (const item of items) results.push(await buildCandidate(item));
const candidates = results.filter(item => item.status === 'candidate').map(item => item.repair);
const rejected = results.filter(item => item.status === 'rejected');

writeFileSync(reportFile, `${JSON.stringify({
  created_at: new Date().toISOString(),
  source_dir: inputDir,
  total_items: items.length,
  candidate_repairs: candidates.length,
  rejected: rejected.length,
  candidates,
  rejected_items: rejected
}, null, 2)}\n`);

if (apply) {
  const merged = mergeRepairs(readJson(repairFile), candidates, new Set(items.map(item => item.id)));
  writeFileSync(repairFile, `${JSON.stringify(merged, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: apply ? 'visual_batches_applied' : 'visual_batches_dry_run',
  total_items: items.length,
  candidate_repairs: candidates.length,
  rejected: rejected.length,
  report: reportFile,
  applied: apply ? candidates.length : 0
}, null, 2));
