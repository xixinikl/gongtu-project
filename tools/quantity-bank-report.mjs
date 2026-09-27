#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const rawDir = join(root, 'output', 'quantity-bank', 'raw_sets');
const outDir = join(root, 'output', 'quantity-bank');

const sets = [];
for (let setNo = 1; setNo <= 60; setNo += 1) {
  const file = join(rawDir, `set_${String(setNo).padStart(2, '0')}.json`);
  const item = JSON.parse(readFileSync(file, 'utf8'));
  const qChars = item.raw_text.questions.length;
  const aChars = item.raw_text.analysis.length;
  const lowConfidenceReasons = [];
  if (item.question_pages.length !== 2) lowConfidenceReasons.push('question_page_count');
  if (item.analysis_pages.length < 5) lowConfidenceReasons.push('analysis_page_count');
  if (item.extracted.topics.length < 3) lowConfidenceReasons.push('few_topics_extracted');
  if (item.extracted.answers.length < 3) lowConfidenceReasons.push('few_answers_extracted');
  if (qChars < 1500) lowConfidenceReasons.push('short_question_ocr');
  if (aChars < 3500) lowConfidenceReasons.push('short_analysis_ocr');

  sets.push({
    set_no: setNo,
    question_pages: item.question_pages,
    analysis_pages: item.analysis_pages.map(page => page.physical_page),
    question_chars: qChars,
    analysis_chars: aChars,
    answers_found: item.extracted.answers.length,
    topics_found: item.extracted.topics.length,
    confidence: lowConfidenceReasons.length ? 'needs_review' : 'raw_ok',
    review_reasons: lowConfidenceReasons
  });
}

const report = {
  status: 'raw_ocr_complete_needs_cleaning',
  totals: {
    sets: sets.length,
    raw_ok: sets.filter(item => item.confidence === 'raw_ok').length,
    needs_review: sets.filter(item => item.confidence === 'needs_review').length
  },
  notes: [
    'This report checks OCR completeness only, not content correctness.',
    'Answer extraction is intentionally conservative because OCR renders reference-answer markers inconsistently.',
    'Questions should be modeled with primary topic, secondary topics, methods, and exam decision rather than one fixed category.'
  ],
  sets
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'import_report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.totals, null, 2));
