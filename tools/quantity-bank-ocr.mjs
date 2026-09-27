#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = join(root, 'output', 'quantity-bank', 'raw_ocr');
const tmpDir = join(root, 'tmp', 'pdfs', 'quantity_ocr');

const defaults = {
  questionsPdf: '/Users/miduoduo/Downloads/数量关系600题.pdf',
  analysisPdf: '/Users/miduoduo/Downloads/数量关系1-17解析.pdf',
  setNo: 1,
  questionStartPage: 6,
  questionEndPage: 7,
  analysisStartPage: 6,
  analysisEndPage: 11,
  dpi: 180
};

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(item => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function ensureTool(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Missing tool: ${command}. Install it before running OCR.`);
  }
}

function renderRange(pdf, prefix, first, last, dpi) {
  run('pdftoppm', ['-png', '-f', String(first), '-l', String(last), '-r', String(dpi), pdf, prefix]);
}

function ocrImage(path) {
  return run('tesseract', [path, 'stdout', '-l', 'chi_sim+eng', '--psm', '6']);
}

function collectImages(prefix, first, last) {
  const paths = [];
  for (let page = first; page <= last; page += 1) {
    const file = `${prefix}-${String(page).padStart(3, '0')}.png`;
    if (existsSync(file)) paths.push(file);
  }
  return paths;
}

ensureTool('pdftoppm');
ensureTool('tesseract');
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const setNo = Number(arg('set', defaults.setNo));
const questionStartPage = Number(arg('question-start', defaults.questionStartPage));
const questionEndPage = Number(arg('question-end', defaults.questionEndPage));
const analysisStartPage = Number(arg('analysis-start', defaults.analysisStartPage));
const analysisEndPage = Number(arg('analysis-end', defaults.analysisEndPage));
const dpi = Number(arg('dpi', defaults.dpi));
const questionsPdf = arg('questions-pdf', defaults.questionsPdf);
const analysisPdf = arg('analysis-pdf', defaults.analysisPdf);

const questionPrefix = join(tmpDir, `set${String(setNo).padStart(2, '0')}_question`);
const analysisPrefix = join(tmpDir, `set${String(setNo).padStart(2, '0')}_analysis`);

renderRange(questionsPdf, questionPrefix, questionStartPage, questionEndPage, dpi);
renderRange(analysisPdf, analysisPrefix, analysisStartPage, analysisEndPage, dpi);

const questionText = collectImages(questionPrefix, questionStartPage, questionEndPage)
  .map(file => `\n\n--- IMAGE ${file} ---\n\n${ocrImage(file)}`)
  .join('\n');
const analysisText = collectImages(analysisPrefix, analysisStartPage, analysisEndPage)
  .map(file => `\n\n--- IMAGE ${file} ---\n\n${ocrImage(file)}`)
  .join('\n');

const payload = {
  set_no: setNo,
  status: 'raw_ocr_needs_cleaning',
  pages: {
    questions: [questionStartPage, questionEndPage],
    analysis: [analysisStartPage, analysisEndPage]
  },
  raw_text: {
    questions: questionText,
    analysis: analysisText
  }
};

const output = join(outDir, `set_${String(setNo).padStart(2, '0')}_raw_ocr.json`);
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);

const check = JSON.parse(readFileSync(output, 'utf8'));
console.log(`Wrote ${output}`);
console.log(`Question chars: ${check.raw_text.questions.length}`);
console.log(`Analysis chars: ${check.raw_text.analysis.length}`);
