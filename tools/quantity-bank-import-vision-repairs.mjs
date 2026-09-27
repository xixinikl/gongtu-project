#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outputsDir = join(root, 'output', 'quantity-bank', 'vision_model_outputs');
const outDir = join(root, 'output', 'quantity-bank', 'vision_import');
const verifiedRepairFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');

function argValue(name, fallback = '') {
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

function normalizeModelPayload(raw) {
  if (!raw) return null;
  if (raw.id && (raw.answer || raw.stem || raw.options || raw.uncertainty !== undefined)) return raw;
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

function validOptions(options) {
  return Array.isArray(options)
    && options.length === 4
    && ['A', 'B', 'C', 'D'].every(key => options.some(option => option?.key === key && option.text));
}

function addField(fields, name, value) {
  if (value !== undefined && value !== null && value !== '') fields[name] = value;
}

function laneAllowedFields(lane) {
  switch (lane) {
    case 'answer_recovery':
      return new Set(['answer', 'primary_topic', 'methods', 'analysis']);
    case 'options_recovery':
      return new Set(['options']);
    case 'stem_recovery':
      return new Set(['stem']);
    case 'stem_analysis_rematch':
      return new Set(['stem', 'options', 'answer', 'primary_topic', 'methods', 'analysis']);
    case 'image_crop_and_structure_repair':
      return new Set([]);
    default:
      return new Set(['stem', 'options', 'answer', 'primary_topic', 'methods', 'analysis']);
  }
}

function buildRepair(record) {
  const payload = normalizeModelPayload(record.raw);
  const task = record.task || {};
  const lane = task.repair_lane || payload?.repair_lane || 'unknown';
  const allowed = laneAllowedFields(lane);
  const failures = [];
  if (!payload) failures.push('model payload is not parseable JSON');
  if (payload?.id && task.id && payload.id !== task.id) failures.push(`payload id mismatch: ${payload.id} != ${task.id}`);
  if (payload?.uncertainty) failures.push(`uncertainty: ${payload.uncertainty}`);
  if (payload?.needs_original_crop) failures.push('needs_original_crop=true');
  if (payload?.answer && !['A', 'B', 'C', 'D'].includes(payload.answer)) failures.push(`bad answer: ${payload.answer}`);
  if (payload?.options && !validOptions(payload.options)) failures.push('options are not complete A/B/C/D');
  if (lane === 'answer_recovery' && !payload?.answer) failures.push('answer_recovery requires answer');
  if (lane === 'answer_recovery' && !payload?.evidence_note) failures.push('answer_recovery requires evidence_note');
  if (lane === 'options_recovery' && !validOptions(payload?.options)) failures.push('options_recovery requires complete options');
  if (lane === 'stem_recovery' && !(typeof payload?.stem === 'string' && payload.stem.trim())) failures.push('stem_recovery requires stem');
  if (lane === 'stem_analysis_rematch' && payload?.same_question !== true) failures.push('stem_analysis_rematch requires same_question=true');
  if (lane === 'image_crop_and_structure_repair') failures.push('image lane must go through crop asset import, not direct vision repair import');

  const fields = {};
  if (allowed.has('stem') && typeof payload?.stem === 'string' && payload.stem.trim()) addField(fields, 'stem', payload.stem.trim());
  if (allowed.has('options') && validOptions(payload?.options)) {
    addField(fields, 'options', payload.options.map(option => ({
      key: option.key,
      text: String(option.text).trim()
    })));
  }
  if (allowed.has('answer') && payload?.answer) addField(fields, 'answer', payload.answer);
  if (allowed.has('primary_topic') && typeof payload?.primary_topic === 'string' && payload.primary_topic.trim()) {
    addField(fields, 'primary_topic', payload.primary_topic.trim());
  }
  if (allowed.has('methods') && Array.isArray(payload?.methods)) addField(fields, 'methods', payload.methods.map(String).filter(Boolean));
  if (allowed.has('analysis') && typeof payload?.analysis_note === 'string' && payload.analysis_note.trim()) {
    addField(fields, 'analysis', payload.analysis_note.trim());
  }

  if (!Object.keys(fields).length) failures.push('no usable fields returned');
  if (failures.length) {
    return {
      id: payload?.id || task.id || record.id,
      status: 'rejected',
      failures,
      payload
    };
  }

  return {
    id: payload.id || task.id || record.id,
    status: 'candidate',
    repair: {
      id: payload.id || task.id || record.id,
      source: {
        type: 'vision_model_repair_pending_gate',
        repair_lane: lane,
        evidence_note: payload.evidence_note || null,
        same_question: payload.same_question ?? null,
        model_output_file: record.file,
        image_files: (task.images || []).map(image => image.file)
      },
      fields
    },
    payload
  };
}

function mergeRepairs(existing, additions) {
  const byId = new Map((existing.repairs || []).map(repair => [repair.id, repair]));
  for (const repair of additions) byId.set(repair.id, repair);
  return {
    ...existing,
    repairs: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  };
}

const inputDir = resolve(argValue('dir', outputsDir));
const apply = hasFlag('apply');
mkdirSync(outDir, { recursive: true });

const records = [];
if (!existsSync(inputDir)) {
  throw new Error(`Vision output dir not found: ${inputDir}`);
}
for (const name of readdirSync(inputDir)
  .filter(name => name.endsWith('.json') && !name.startsWith('vision_tasks_') && !name.endsWith('.error.json'))
  .sort()) {
  const file = join(inputDir, name);
  const record = readJson(file);
  records.push({
    ...record,
    file
  });
}

const results = records.map(buildRepair);
const candidates = results.filter(item => item.status === 'candidate').map(item => item.repair);
const rejected = results.filter(item => item.status === 'rejected');
const candidateFile = join(outDir, 'vision_repair_candidates.json');
writeFileSync(candidateFile, `${JSON.stringify({
  created_at: new Date().toISOString(),
  source_dir: inputDir,
  total_outputs: records.length,
  candidate_repairs: candidates.length,
  rejected: rejected.length,
  candidates,
  rejected_items: rejected
}, null, 2)}\n`);

if (apply && candidates.length) {
  const existing = readJson(verifiedRepairFile);
  const merged = mergeRepairs(existing, candidates);
  writeFileSync(verifiedRepairFile, `${JSON.stringify(merged, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: apply ? 'imported_to_verified_repairs' : 'dry_run_import_candidates',
  total_outputs: records.length,
  candidate_repairs: candidates.length,
  rejected: rejected.length,
  output: candidateFile,
  applied: apply && candidates.length
}, null, 2));
