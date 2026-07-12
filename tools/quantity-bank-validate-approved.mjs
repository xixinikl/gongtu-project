#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const file = join(root, 'output', 'quantity-bank', 'approved_seed', 'questions.json');
const questions = JSON.parse(readFileSync(file, 'utf8'));

const allowedDecisions = new Set(['must_do', 'can_do', 'skip_first']);
const imageDependencyPattern = /如图|如下图|下图|右图|左图|图所示|示意图|下表|表格|根据下表/;
const failures = [];
const canonicalTopics = new Set(questions.map(item => item.tags?.primary_topic).filter(Boolean));

function isCleanTopic(topic) {
  return topic
    && topic.length <= 24
    && !/[A-Za-z]|[^\u4e00-\u9fa5+之、/与\s]/.test(topic)
    && !/[晶尸妇女太扒挤]|十等|问是|容斤|行各|各环|久变|匀变如|流术|等半|等关|遗失|分钟|即|空位|插入|成的|没有|和平方|\+\s*$|问题\s*人/.test(topic);
}

function isCleanStem(item) {
  const stem = item.stem || '';
  const compactLength = stem.replace(/\s/g, '').length;
  const verifiedShortQuestion = item.source?.verified_repair?.type === 'original_question_page_visual_review'
    && compactLength >= 25;
  const manuallyRecovered = item.source?.verified_repair?.type === 'manual_original_page_recovery';
  const fullVisualAudit = hasFullVisualSetEvidence(item);
  const manualVisualRecovery = hasManualVisualEvidence(item);
  const imageDependentWithMedia = imageDependencyPattern.test(stem) && hasUsableQuestionMedia(item.media);
  const stemWithoutMathLabels = stem
    .replace(/\b[A-D]{2,4}\b/g, '')
    .replace(/\b[A-D](?=校|地|点|船|车|组|端|线路|路线)/g, '')
    .replace(/(?<=从 |从)[A-D](?= 校|校|地|点)/g, '');
  return stem
    && (compactLength >= 40 || verifiedShortQuestion || ((manualVisualRecovery || fullVisualAudit) && compactLength >= 25))
    && (manuallyRecovered || manualVisualRecovery || fullVisualAudit || !/[A-Za-z]{2,}|[@|]/.test(stemWithoutMathLabels))
    && (!imageDependencyPattern.test(stem) || imageDependentWithMedia);
}

function hasUsableQuestionMedia(media) {
  return Array.isArray(media)
    && media.some(item => item?.type === 'question_figure_crop'
      && typeof item.asset === 'string'
      && existsSync(item.asset)
      && Array.isArray(item.crop_box)
      && item.crop_box.length === 4
      && item.crop_box.every(value => Number.isFinite(Number(value)))
      && item.source_pdf === '数量关系600题.pdf');
}

function hasManualVisualEvidence(item) {
  return item.source?.verified_repair?.type === 'manual_visual_original_page_recovery'
    && item.tags?.answer_source === 'verified_original_analysis_page'
    && item.tags?.answer_audit_tier === 'manual_or_original_page_verified'
    && hasUsableQuestionMedia(item.media)
    && Array.isArray(item.options)
    && item.options.length === 4
    && ['A', 'B', 'C', 'D'].includes(item.answer)
    && typeof item.analysis === 'string'
    && item.analysis.replace(/\s/g, '').length >= 20;
}

function hasFullVisualSetEvidence(item) {
  const source = item.source?.verified_repair || {};
  return source.type === 'full_visual_set_audit'
    && Boolean(source.question_page || source.question_pages?.length)
    && Boolean(source.analysis_evidence_page || source.analysis_pages?.length)
    && hasSupportedOptions(item)
    && typeof item.analysis === 'string'
    && item.analysis.replace(/\s/g, '').length >= 80;
}

function hasSupportedOptions(item) {
  const options = item.options;
  if (!Array.isArray(options) || options.length < 4 || options.length > 8) return false;
  const sourceType = item.source?.verified_repair?.type;
  if (options.length !== 4 && sourceType !== 'full_visual_set_audit') return false;
  const expectedKeys = Array.from({ length: options.length }, (_, index) => String.fromCharCode(65 + index));
  return options.every((option, index) => option?.key === expectedKeys[index] && option.text?.trim())
    && expectedKeys.includes(item.answer);
}

function isCleanOption(option) {
  const text = option?.text || '';
  const compact = text.replace(/\s/g, '');
  if (/^n(?:\/[234])?$/.test(compact)) return true;
  if (/^[A-Z]\d{1,3}$/i.test(compact)) return true;
  if (/^[A-D](?:[><][A-D]){2,3}$/.test(compact)) return true;
  if (/^[xX](?:[+-]\d+)?$/.test(compact)) return true;
  if (/^\d*[xX](?:[+-]\d+)?$/.test(compact)) return true;
  if (/^\d+(?:\.\d+)?[xX][+-]\d+$/.test(compact)) return true;
  if (/^[xX][不没]?(?:大于|小于|高于|低于|超过|少于|多于)[yY]$/.test(compact)) return true;
  const allowedRemoved = text
    .replace(/[A-D]{1,4}(?=\s*(?:间|地|点|端|码头|方案|商品|产品|零件|班级|号|线|内|外|的|中|和|、|,|，))/g, '')
    .replace(/\b[xX]\b/g, '');
  return option?.text
    && !/^[A-D]$/.test(option.text.trim())
    && !/[A-Za-z@|$]/.test(allowedRemoved);
}

for (const item of questions) {
  const manualVisualEvidence = hasManualVisualEvidence(item);
  const fullVisualEvidence = hasFullVisualSetEvidence(item);
  if (!item.id) failures.push([item.id, 'missing id']);
  if (!isCleanStem(item)) failures.push([item.id, `dirty stem: ${item.stem}`]);
  if (imageDependencyPattern.test(item.stem || '') && !hasUsableQuestionMedia(item.media)) {
    failures.push([item.id, 'image-dependent stem missing usable question_figure_crop media']);
  }
  if (!hasSupportedOptions(item)) failures.push([item.id, 'unsupported options']);
  const optionKeys = new Set(item.options.map(option => option.key));
  const requiredKeys = Array.from({ length: item.options.length }, (_, index) => String.fromCharCode(65 + index));
  for (const key of requiredKeys) {
    if (!optionKeys.has(key)) failures.push([item.id, `missing option ${key}`]);
  }
  for (const option of item.options || []) {
    if (!manualVisualEvidence && !fullVisualEvidence && !isCleanOption(option)) failures.push([item.id, `dirty option ${option.key}: ${option.text}`]);
  }
  if (!optionKeys.has(item.answer)) failures.push([item.id, 'answer not in options']);
  if (!item.analysis || (!manualVisualEvidence && item.analysis.replace(/\s/g, '').length < 80)) failures.push([item.id, 'short analysis']);
  if (!isCleanTopic(item.tags.primary_topic)) {
    failures.push([item.id, `dirty topic: ${item.tags.primary_topic}`]);
  }
  if (!Array.isArray(item.tags.secondary_topics)) {
    failures.push([item.id, 'secondary_topics must be an array']);
  }
  for (const topic of item.tags.secondary_topics || []) {
    if (topic === item.tags.primary_topic || !canonicalTopics.has(topic) || !isCleanTopic(topic)) {
      failures.push([item.id, `dirty secondary topic: ${topic}`]);
    }
  }
  if (!allowedDecisions.has(item.tags.exam_decision)) failures.push([item.id, 'bad exam decision']);
  if (!Array.isArray(item.tags.methods) || !item.tags.methods.length) failures.push([item.id, 'missing methods']);
  if ((item.tags.methods || []).length > 3) failures.push([item.id, `too many methods: ${item.tags.methods.join('/')}`]);
  if ((item.tags.methods || []).some(method => /妇女|太|扒|挤|同题|相过/.test(method))) {
    failures.push([item.id, `dirty methods: ${item.tags.methods.join('/')}`]);
  }
  if ((item.tags.methods || []).some(method => /[A-Za-z@|]|几何建模/.test(method) && !item.tags.primary_topic.includes('几何'))) {
    failures.push([item.id, `dirty methods: ${item.tags.methods.join('/')}`]);
  }
}

if (failures.length) {
  console.error(`Approved seed validation failed: ${failures.length}`);
  console.error(failures.slice(0, 80).map(([id, reason]) => `${id}: ${reason}`).join('\n'));
  process.exit(1);
}

console.log(`Approved seed validation passed: ${questions.length} questions`);
