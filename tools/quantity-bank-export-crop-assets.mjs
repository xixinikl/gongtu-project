#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(new URL('..', import.meta.url).pathname);
const defaultInputDir = join(root, 'output', 'quantity-bank', 'vision_model_outputs');
const defaultOutDir = join(root, 'output', 'quantity-bank', 'crop_assets');
const maxCropAreaRatio = 0.55;
const minCropAreaRatio = 0.003;

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function normalizeModelPayload(raw) {
  if (!raw) return null;
  if (raw.id && (raw.crop_requests || raw.needs_original_crop !== undefined)) return raw;
  const content = raw.choices?.[0]?.message?.content;
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cropPixels(bbox, width, height) {
  const [x, y, w, h] = bbox.map(Number);
  const left = Math.floor(clamp(x, 0, 0.999) * width);
  const top = Math.floor(clamp(y, 0, 0.999) * height);
  const right = Math.ceil(clamp(x + w, 0.001, 1) * width);
  const bottom = Math.ceil(clamp(y + h, 0.001, 1) * height);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function findImage(task, request) {
  const images = task?.images || [];
  const role = request.source_role || 'question_page';
  const page = Number(request.page);
  return images.find(image => image.role === role && Number(image.page) === page);
}

async function exportCrop(record, payload, request, index, outDir) {
  const task = record.task || {};
  const image = findImage(task, request);
  const failures = [];
  if (request.source_role !== 'question_page') failures.push('source_role must be question_page');
  if (!Number.isInteger(Number(request.page)) || Number(request.page) < 1) failures.push('page must be a positive integer');
  if (!image?.file) failures.push(`exact source image not found for role=${request.source_role} page=${request.page}`);
  if (image?.file && !existsSync(image.file)) failures.push(`source image file missing: ${image.file}`);
  if (!validBBox(request.bbox_normalized)) failures.push('bbox_normalized must be [x,y,width,height] within 0..1');
  if (failures.length) {
    return {
      status: 'rejected',
      id: payload?.id || task.id || record.id,
      request_index: index,
      failures,
      request
    };
  }

  const metadata = await sharp(image.file).metadata();
  const rect = cropPixels(request.bbox_normalized, metadata.width, metadata.height);
  const cropAreaRatio = (rect.width * rect.height) / (metadata.width * metadata.height);
  if (cropAreaRatio > maxCropAreaRatio) {
    return {
      status: 'rejected',
      id: payload?.id || task.id || record.id,
      request_index: index,
      failures: [`crop too large: ${(cropAreaRatio * 100).toFixed(1)}% of page`],
      request
    };
  }
  if (cropAreaRatio < minCropAreaRatio) {
    return {
      status: 'rejected',
      id: payload?.id || task.id || record.id,
      request_index: index,
      failures: [`crop too small: ${(cropAreaRatio * 100).toFixed(2)}% of page`],
      request
    };
  }
  const id = payload?.id || task.id || record.id;
  const fileName = `${id}_crop_${String(index + 1).padStart(2, '0')}.png`;
  const outFile = join(outDir, fileName);
  await sharp(image.file).extract(rect).png().toFile(outFile);
  return {
    status: 'created',
    id,
    request_index: index,
    asset: outFile,
    source_image: image.file,
    source_role: image.role,
    source_page: image.page,
    bbox_normalized: request.bbox_normalized.map(Number),
    crop_pixels: rect,
    crop_area_ratio: Number(cropAreaRatio.toFixed(4)),
    reason: request.reason || '',
    suggested_media: {
      type: 'question_figure_crop',
      asset: outFile,
      source_pdf: basename(task.question_source?.pdf || task.source?.question_pdf || '数量关系600题.pdf'),
      source_page: image.page,
      crop_box: request.bbox_normalized.map(Number),
      note: request.reason || '视觉模型建议的题干局部图形裁剪；入库前仍需审核。'
    }
  };
}

const inputDir = resolve(argValue('dir', defaultInputDir));
const outDir = resolve(argValue('out-dir', defaultOutDir));
mkdirSync(outDir, { recursive: true });

const records = [];
if (!existsSync(inputDir)) {
  throw new Error(`Vision output dir not found: ${inputDir}`);
}
for (const name of readdirSync(inputDir)
  .filter(name => name.endsWith('.json') && !name.startsWith('vision_tasks_') && !name.endsWith('.error.json'))
  .sort()) {
  const file = join(inputDir, name);
  records.push({
    ...readJson(file),
    file
  });
}

const created = [];
const rejected = [];
for (const record of records) {
  const payload = normalizeModelPayload(record.raw);
  const requests = Array.isArray(payload?.crop_requests) ? payload.crop_requests : [];
  for (let index = 0; index < requests.length; index += 1) {
    const result = await exportCrop(record, payload, requests[index], index, outDir);
    if (result.status === 'created') created.push(result);
    else rejected.push(result);
  }
}

const manifestFile = join(outDir, 'crop_assets_manifest.json');
writeFileSync(manifestFile, `${JSON.stringify({
  created_at: new Date().toISOString(),
  source_dir: inputDir,
  output_dir: outDir,
  total_outputs: records.length,
  created_crops: created.length,
  rejected_crops: rejected.length,
  created,
  rejected
}, null, 2)}\n`);

console.log(JSON.stringify({
  status: 'crop_assets_exported',
  total_outputs: records.length,
  created_crops: created.length,
  rejected_crops: rejected.length,
  output: manifestFile
}, null, 2));
