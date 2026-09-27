#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pageRoot = join(root, 'output', 'quantity-bank', 'page_ocr');
const outDir = join(root, 'output', 'quantity-bank', 'raw_sets');
const pageMaps = JSON.parse(readFileSync(join(root, 'data', 'quantity_bank', 'page_maps.json'), 'utf8'));

function readPage(key, page) {
  const file = join(pageRoot, key, `page_${String(page).padStart(3, '0')}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listPages(key, start, end) {
  const pages = [];
  for (let page = start; page <= end; page += 1) {
    const item = readPage(key, page);
    if (item) pages.push(item);
  }
  return pages;
}

function pagesForItem(key, item) {
  if (Array.isArray(item.pages)) {
    return item.pages
      .map(page => readPage(key, page))
      .filter(Boolean);
  }
  return listPages(key, item.start, item.end);
}

function groupQuestionPages() {
  const groups = new Map();
  for (const item of pageMaps.questions.sets) {
    groups.set(item.set_no, pagesForItem(pageMaps.questions.source, item));
  }
  return groups;
}

function groupAnalysisPages() {
  const groups = new Map();
  for (const source of pageMaps.analysis) {
    for (const item of source.sets) {
      groups.set(item.set_no, pagesForItem(source.source, item));
    }
  }
  return groups;
}

function extractTopics(text) {
  const topics = [];
  const re = /【题型分类】([^\n\r【]+)/g;
  let match;
  while ((match = re.exec(text))) {
    topics.push(match[1].trim());
  }
  return topics;
}

function extractAnswers(text) {
  const answers = [];
  const re = /【参考答案】\s*([A-D])/g;
  let match;
  while ((match = re.exec(text))) answers.push(match[1]);
  return answers;
}

mkdirSync(outDir, { recursive: true });

const questionGroups = groupQuestionPages();
const analysisGroups = groupAnalysisPages();
const summary = [];

for (let setNo = 1; setNo <= 60; setNo += 1) {
  const questionPages = questionGroups.get(setNo) || [];
  const analysisPages = analysisGroups.get(setNo) || [];
  const questionText = questionPages.map(page => page.text).join('\n\n');
  const analysisText = analysisPages.map(page => page.text).join('\n\n');
  const payload = {
    set_no: setNo,
    status: 'raw_set_needs_ai_cleaning',
    question_pages: questionPages.map(page => page.physical_page),
    analysis_pages: analysisPages.map(page => ({
      source: page.source,
      physical_page: page.physical_page
    })),
    extracted: {
      answers: extractAnswers(analysisText),
      topics: extractTopics(analysisText)
    },
    raw_text: {
      questions: questionText,
      analysis: analysisText
    }
  };
  const output = join(outDir, `set_${String(setNo).padStart(2, '0')}.json`);
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
  summary.push({
    set_no: setNo,
    question_pages: payload.question_pages.length,
    analysis_pages: payload.analysis_pages.length,
    answers_found: payload.extracted.answers.length,
    topics_found: payload.extracted.topics.length
  });
}

writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Wrote raw set bundles to ${outDir}`);
console.log(summary.map(item => `set ${String(item.set_no).padStart(2, '0')}: q_pages=${item.question_pages}, a_pages=${item.analysis_pages}, answers=${item.answers_found}, topics=${item.topics_found}`).join('\n'));
