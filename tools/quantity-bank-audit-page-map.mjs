#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pageRoot = join(root, 'output', 'quantity-bank', 'page_ocr');
const outDir = join(root, 'output', 'quantity-bank', 'page_map_audit');
const pageMaps = JSON.parse(readFileSync(join(root, 'data', 'quantity_bank', 'page_maps.json'), 'utf8'));

function normalizeText(text) {
  return (text || '')
    .replace(/\r/g, '\n')
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[lI][L1]\./g, '1.');
}

function readPage(source, page) {
  const file = join(pageRoot, source, `page_${String(page).padStart(3, '0')}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function pagesForItem(source, item) {
  const pageNumbers = Array.isArray(item.pages)
    ? item.pages
    : Array.from({ length: item.end - item.start + 1 }, (_, index) => item.start + index);
  return pageNumbers
    .map(page => readPage(source, page))
    .filter(Boolean);
}

function questionMarker(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(10|[1-9]|[lI][L1])(?:[\s\.:、,，]|一)/);
  if (!match) return null;
  const value = Number(match[1].replace(/[lI][L1]/, '1'));
  return value >= 1 && value <= 10 ? value : null;
}

function splitNumberedBlocks(text) {
  const blocks = new Map();
  let current = null;
  for (const line of normalizeText(text).split('\n')) {
    const marker = questionMarker(line);
    if (marker) current = marker;
    if (!current) continue;
    if (!blocks.has(current)) blocks.set(current, []);
    blocks.get(current).push(line);
  }
  return blocks;
}

function trimNoise(text) {
  return (text || '')
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return true;
      if (/^--- IMAGE /.test(t)) return false;
      if (/四海公|SIHAI|数量关系[O0]+|花生十三/.test(t)) return false;
      if (/^练习题\s*\d+/.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function analysisHead(text) {
  return trimNoise((text || '').split(/【参考答案|参考答案|【题型分类|题型分类|【实战解析|实战解析/)[0] || '');
}

function chineseChars(text) {
  return [...(text || '').replace(/[^\u4e00-\u9fa5]/g, '')]
    .filter(char => !'的一是在和有为多少问则已知如果其中'.includes(char));
}

function textSimilarity(left, right) {
  const leftSet = new Set(chineseChars(left));
  const rightSet = new Set(chineseChars(right));
  if (leftSet.size < 12 || rightSet.size < 12) return 0;
  let overlap = 0;
  for (const char of leftSet) {
    if (rightSet.has(char)) overlap += 1;
  }
  return overlap / Math.min(leftSet.size, rightSet.size);
}

function joinedQuestionHeadsFromPages(pages) {
  const blocks = splitNumberedBlocks(pages.map(page => page.text).join('\n\n'));
  const heads = [];
  for (let questionNo = 1; questionNo <= 10; questionNo += 1) {
    heads.push(trimNoise((blocks.get(questionNo) || []).join('\n')).slice(0, 220));
  }
  return heads.join('\n');
}

function joinedAnalysisHeads(source, item) {
  const pages = pagesForItem(source, item);
  const blocks = splitNumberedBlocks(pages.map(page => page.text).join('\n\n'));
  const heads = [];
  for (let questionNo = 1; questionNo <= 10; questionNo += 1) {
    heads.push(analysisHead((blocks.get(questionNo) || []).join('\n')).slice(0, 220));
  }
  return heads.join('\n');
}

const analysisBySet = new Map();
for (const group of pageMaps.analysis) {
  for (const item of group.sets) {
    analysisBySet.set(item.set_no, joinedAnalysisHeads(group.source, item));
  }
}

const rows = [];
for (const item of pageMaps.questions.sets) {
  const pages = pagesForItem(pageMaps.questions.source, item);
  const questionHeads = joinedQuestionHeadsFromPages(pages);
  const scored = [];
  for (let setNo = 1; setNo <= 60; setNo += 1) {
    scored.push({
      set_no: setNo,
      score: Number(textSimilarity(questionHeads, analysisBySet.get(setNo)).toFixed(3))
    });
  }
  scored.sort((left, right) => right.score - left.score);
  rows.push({
    set_no: item.set_no,
    question_pages: pages.map(page => page.physical_page),
    mapping_status: item.status || 'mapped',
    best_matches: scored.slice(0, 5),
    likely_match_ok: pages.length === 0 ? false : scored[0]?.set_no === item.set_no && scored[0]?.score >= 0.62
  });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'question_page_map_audit.json'), `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync(join(outDir, 'question_page_map_audit.md'), `${[
  '# 数量关系题本页码映射审计',
  '',
  '| 套号 | 题本页 | 映射状态 | 最像的解析套 | 通过 |',
  '|---|---:|---|---|---|',
  ...rows.map(row => `| ${row.set_no} | ${row.question_pages.join(', ') || '-'} | ${row.mapping_status} | ${row.best_matches.map(item => `${item.set_no}:${item.score}`).join(' / ')} | ${row.likely_match_ok ? 'yes' : 'no'} |`)
].join('\n')}\n`);

const failed = rows.filter(row => !row.likely_match_ok);
console.log(JSON.stringify({
  sets: rows.length,
  likely_match_ok: rows.length - failed.length,
  needs_attention: failed.length,
  failed_sets: failed.map(row => row.set_no)
}, null, 2));
