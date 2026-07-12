#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(new URL('..', import.meta.url).pathname);
const manifestFile = join(root, 'output', 'quantity-bank', 'crop_assets', 'crop_assets_manifest.json');
const maxCropAreaRatio = 0.55;
const minCropAreaRatio = 0.003;

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

const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const failures = [];

for (const item of manifest.created || []) {
  if (!item.id) failures.push('crop item missing id');
  if (!item.asset || !existsSync(item.asset)) failures.push(`${item.id}: crop asset missing: ${item.asset}`);
  if (!item.source_image || !existsSync(item.source_image)) failures.push(`${item.id}: source image missing: ${item.source_image}`);
  if (item.source_role !== 'question_page') failures.push(`${item.id}: source_role must be question_page, got ${item.source_role}`);
  if (!validBBox(item.bbox_normalized)) failures.push(`${item.id}: invalid bbox_normalized`);
  if (!item.suggested_media || item.suggested_media.type !== 'question_figure_crop') failures.push(`${item.id}: missing question_figure_crop suggested_media`);
  if (item.suggested_media?.source_pdf !== '数量关系600题.pdf') {
    failures.push(`${item.id}: source_pdf must be 数量关系600题.pdf, got ${item.suggested_media?.source_pdf || '(empty)'}`);
  }

  if (item.asset && existsSync(item.asset)) {
    const metadata = await sharp(item.asset).metadata();
    if (!metadata.width || !metadata.height) failures.push(`${item.id}: crop asset has invalid dimensions`);
  }

  const ratio = Number(item.crop_area_ratio);
  if (!Number.isFinite(ratio)) {
    failures.push(`${item.id}: missing crop_area_ratio`);
  } else {
    if (ratio < minCropAreaRatio) failures.push(`${item.id}: crop too small (${ratio})`);
    if (ratio > maxCropAreaRatio) failures.push(`${item.id}: crop too large (${ratio})`);
  }
}

if (failures.length) {
  console.error(`Crop asset audit failed: ${failures.length}`);
  console.error(failures.slice(0, 80).join('\n'));
  process.exit(1);
}

console.log(`Crop asset audit passed: ${manifest.created_crops || 0} crops, ${manifest.rejected_crops || 0} rejected`);
