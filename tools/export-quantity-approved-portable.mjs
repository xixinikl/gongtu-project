#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve(process.argv[2] || process.cwd());
const targetRoot = path.resolve(process.argv[3] || process.cwd());
const sourceFile = path.join(sourceRoot, 'output/quantity-bank/approved_seed/questions.json');
const targetDir = path.join(targetRoot, 'data/quantity_bank');
const mediaDir = path.join(targetDir, 'approved_media');
const questions = JSON.parse(readFileSync(sourceFile, 'utf8'));

if (!Array.isArray(questions) || questions.length !== 600) {
  throw new Error('portable export requires the 600-question approved seed');
}
mkdirSync(mediaDir, { recursive: true });
let mediaCount = 0;
for (const question of questions) {
  if (question?.tags?.answer_source !== 'full_visual_set_audit') {
    throw new Error(`unapproved answer source: ${question?.id}`);
  }
  if (question?.source?.verified_repair?.type !== 'full_visual_set_audit') {
    throw new Error(`missing full visual repair evidence: ${question?.id}`);
  }
  question.tags.answer_audit_tier = 'manual_or_original_page_verified';
  question.tags.answer_requires_original_recheck = false;
  question.source.processing_stage = 'approved_seed_from_full_visual_audit';
  for (let index = 0; index < (question.media || []).length; index += 1) {
    const media = question.media[index];
    if (media.type !== 'question_figure_crop') {
      throw new Error(`unsupported media type: ${question.id}`);
    }
    const extension = path.extname(media.asset) || '.png';
    const filename = `${question.id}_${String(index + 1).padStart(2, '0')}${extension}`;
    copyFileSync(media.asset, path.join(mediaDir, filename));
    media.asset = `data/quantity_bank/approved_media/${filename}`;
    mediaCount += 1;
  }
}
const set28 = questions.filter(item => item.set_no === 28).sort((a, b) => a.question_no - b.question_no);
const q8_7 = questions.find(item => item.set_no === 8 && item.question_no === 7);
if (set28.map(item => item.answer).join('') !== 'DABDCCBCCB') throw new Error('set28 gate failed');
if (q8_7.options.map(item => item.key).join('') !== 'ABCDEFGH' || q8_7.answer !== 'E') {
  throw new Error('set08 q07 gate failed');
}
writeFileSync(path.join(targetDir, 'approved_seed.json'), `${JSON.stringify(questions, null, 2)}\n`);
writeFileSync(path.join(targetDir, 'approved_seed_manifest.json'), `${JSON.stringify({
  schema_version: '1.0.0',
  source: 'output/quantity-bank/approved_seed/questions.json',
  question_count: questions.length,
  set_count: 60,
  media_count: mediaCount,
  answer_source: 'full_visual_set_audit',
  set28_answers: 'DABDCCBCCB',
  set08_q07: { option_keys: 'ABCDEFGH', answer: 'E' },
  analysis_visual_audit: { status: 'incomplete', known_reference_questions: 42 },
}, null, 2)}\n`);
console.log(JSON.stringify({ status: 'portable_approved_seed_exported', questions: questions.length, media: mediaCount }));
