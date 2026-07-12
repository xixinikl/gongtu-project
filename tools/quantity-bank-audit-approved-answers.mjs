#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const approvedFile = join(root, 'output', 'quantity-bank', 'approved_seed', 'questions.json');
const candidatesFile = join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json');

const approved = JSON.parse(readFileSync(approvedFile, 'utf8'));
const candidates = JSON.parse(readFileSync(candidatesFile, 'utf8'));
const candidateById = new Map(candidates.map(item => [item.id, item]));
const failures = [];

function answerEvidenceLine(candidate) {
  const beforeTopic = (candidate.content.analysis || '').split(/【题型分类|题型分类|【实战解析|实战解析/)[0] || '';
  const lines = beforeTopic
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const answer = candidate.content.answer;
  if (!answer) return '';
  return [...lines].reverse().find(line => hasStrictGarbledAnswerEvidence(line, answer)) || '';
}

function referenceEvidenceLine(candidate) {
  const beforeAnalysis = (candidate.content.analysis || '').split(/【实战解析|实战解析/)[0] || '';
  const lines = beforeAnalysis
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const answer = candidate.content.answer;
  if (!answer) return '';
  return lines.find(line => hasReferenceAnswerEvidence(line, answer)) || '';
}

function hasStrictGarbledAnswerEvidence(line, answer) {
  const upper = (line || '').toUpperCase();
  if (!answer) return false;
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:参考|答案|答)[^A-D]{0,20}${escaped}\\s*[\\]】)）]?\\s*$`),
    new RegExp(`[\\]】)）]\\s*${escaped}\\s*$`),
    new RegExp(`\\s${escaped}\\s*$`)
  ];
  return patterns.some(pattern => pattern.test(upper));
}

function hasReferenceAnswerEvidence(line, answer) {
  const upper = (line || '').toUpperCase();
  if (!answer) return false;
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`参考\\s*答[案和集本桌]*[^A-D]{0,10}${escaped}`).test(upper)
    || new RegExp(`\\[S4[^\\n]{0,12}${escaped}`).test(upper);
}

function hasStrictOcrConclusionEvidence(candidate) {
  if (candidate.content.answer !== 'A') return false;
  const analysis = (candidate.content.analysis || '').replace(/\s+/g, ' ');
  const hasConclusion = /答[案娄][^。；;,.，]{0,16}为\s*人\s*(?:\|[^。；;,.，]{0,20})?\s*选项/.test(analysis)
    || /答案为人选项/.test(analysis);
  const optionA = (candidate.content.options || []).find(option => option.key === 'A');
  return hasConclusion && Boolean(optionA?.text?.trim());
}

for (const item of approved) {
  const candidate = candidateById.get(item.id);
  if (!candidate) {
    failures.push(`${item.id}: approved item missing from clean_candidates`);
    continue;
  }
  const answer = candidate.content.answer;
  const source = candidate.learning_tags.answer_source;
  const confidence = candidate.learning_tags.answer_confidence;
  if (answer !== item.answer) {
    failures.push(`${item.id}: approved answer ${item.answer} does not match candidate answer ${answer}`);
  }
  if (confidence !== 'high') {
    failures.push(`${item.id}: answer confidence is ${confidence}`);
  }
  if (source === 'dirty_ocr_bracket') {
    failures.push(`${item.id}: dirty OCR bracket answer cannot enter approved_seed`);
  }
  if (source === 'garbled_reference_answer_line') {
    const evidence = answerEvidenceLine(candidate);
    if (!hasStrictGarbledAnswerEvidence(evidence, answer)) {
      failures.push(`${item.id}: weak garbled answer evidence "${evidence}"`);
    }
  }
  if (source === 'reference_answer_ocr_prefix' || source === 'reference_answer_ocr_variant') {
    const evidence = referenceEvidenceLine(candidate);
    if (!hasReferenceAnswerEvidence(evidence, answer)) {
      failures.push(`${item.id}: weak reference answer evidence "${evidence}"`);
    }
  }
  if (source === 'strict_ocr_analysis_conclusion' && !hasStrictOcrConclusionEvidence(candidate)) {
    failures.push(`${item.id}: weak strict OCR conclusion evidence`);
  }
}

const knownRegression = candidateById.get('quantity_hs13_set03_q03');
if (knownRegression?.content.answer !== 'D' || knownRegression?.learning_tags.answer_confidence !== 'high') {
  failures.push('quantity_hs13_set03_q03: regression guard failed, expected high-confidence answer D');
}

const correctedAnswerRegressions = [
  ['quantity_hs13_set26_q10', 'C'],
  ['quantity_hs13_set59_q05', 'C']
];
for (const [id, expected] of correctedAnswerRegressions) {
  const candidate = candidateById.get(id);
  if (candidate?.review_status === 'candidate_ok' && candidate.content.answer !== expected) {
    failures.push(`${id}: regression guard failed, expected corrected answer ${expected}, got ${candidate.content.answer}`);
  }
}

if (failures.length) {
  console.error(`Approved answer audit failed: ${failures.length}`);
  console.error(failures.slice(0, 80).join('\n'));
  process.exit(1);
}

console.log(`Approved answer audit passed: ${approved.length} questions`);
