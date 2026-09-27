#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const cropManifestFile = join(root, 'output', 'quantity-bank', 'crop_assets', 'crop_assets_manifest.json');
const outDir = join(root, 'output', 'quantity-bank', 'crop_import');
const verifiedRepairFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function mergeMedia(existingMedia = [], addedMedia = []) {
  const byAsset = new Map();
  for (const item of [...existingMedia, ...addedMedia]) {
    if (item?.asset) byAsset.set(item.asset, item);
  }
  return [...byAsset.values()];
}

function buildMediaRepairs(manifest) {
  const byId = new Map();
  for (const crop of manifest.created || []) {
    if (!crop.id || !crop.suggested_media) continue;
    if (!byId.has(crop.id)) byId.set(crop.id, []);
    byId.get(crop.id).push(crop.suggested_media);
  }
  return [...byId.entries()].map(([id, media]) => ({
    id,
    source: {
      type: 'crop_asset_media_pending_gate',
      crop_manifest: cropManifestFile,
      review_note: 'Local original-PDF crop media imported after crop asset audit; still passes standard quality gates before approved_seed.'
    },
    fields: {
      media
    }
  }));
}

function mergeRepairs(existing, additions) {
  const byId = new Map((existing.repairs || []).map(repair => [repair.id, repair]));
  for (const repair of additions) {
    const current = byId.get(repair.id);
    if (!current) {
      byId.set(repair.id, repair);
      continue;
    }
    byId.set(repair.id, {
      ...current,
      source: {
        ...current.source,
        crop_media_source: repair.source
      },
      fields: {
        ...current.fields,
        media: mergeMedia(current.fields?.media, repair.fields.media)
      }
    });
  }
  return {
    ...existing,
    repairs: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  };
}

const apply = hasFlag('apply');
const manifest = readJson(cropManifestFile);
const repairs = buildMediaRepairs(manifest);
mkdirSync(outDir, { recursive: true });

const candidateFile = join(outDir, 'crop_media_repair_candidates.json');
writeFileSync(candidateFile, `${JSON.stringify({
  created_at: new Date().toISOString(),
  crop_manifest: cropManifestFile,
  crop_count: manifest.created_crops || 0,
  repair_candidates: repairs.length,
  candidates: repairs
}, null, 2)}\n`);

if (apply && repairs.length) {
  const existing = readJson(verifiedRepairFile);
  const merged = mergeRepairs(existing, repairs);
  writeFileSync(verifiedRepairFile, `${JSON.stringify(merged, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: apply ? 'imported_crop_media_to_verified_repairs' : 'dry_run_crop_media_candidates',
  crop_count: manifest.created_crops || 0,
  repair_candidates: repairs.length,
  output: candidateFile,
  applied: apply && repairs.length
}, null, 2));
