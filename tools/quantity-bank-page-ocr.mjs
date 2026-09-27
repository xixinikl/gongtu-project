#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outRoot = join(root, 'output', 'quantity-bank', 'page_ocr');
const tmpRoot = join(root, 'tmp', 'pdfs', 'quantity_page_ocr');

const sources = {
  questions: {
    pdf: '/Users/miduoduo/Downloads/数量关系600题.pdf',
    start: 6,
    end: 125
  },
  analysis_01_17: {
    pdf: '/Users/miduoduo/Downloads/数量关系1-17解析.pdf',
    start: 6,
    end: 105
  },
  analysis_18_34: {
    pdf: '/Users/miduoduo/Downloads/数量关系18-34解析.pdf',
    start: 6,
    end: 102
  },
  analysis_35_60: {
    pdf: '/Users/miduoduo/Downloads/数量关系35-60解析.pdf',
    start: 6,
    end: 152
  }
};

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(item => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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
  if (result.status !== 0) throw new Error(`Missing tool: ${command}`);
}

function pageFile(key, page) {
  return join(outRoot, key, `page_${String(page).padStart(3, '0')}.json`);
}

ensureTool('pdftoppm');
ensureTool('tesseract');

const key = arg('source', 'questions');
const source = sources[key];
if (!source) {
  throw new Error(`Unknown source "${key}". Use one of: ${Object.keys(sources).join(', ')}`);
}

const pdf = arg('pdf', source.pdf);
const start = Number(arg('start', source.start));
const end = Number(arg('end', source.end));
const dpi = Number(arg('dpi', 140));
const force = hasFlag('force');

mkdirSync(join(outRoot, key), { recursive: true });
mkdirSync(tmpRoot, { recursive: true });

let completed = 0;
for (let page = start; page <= end; page += 1) {
  const output = pageFile(key, page);
  if (!force && existsSync(output)) {
    console.log(`[skip] ${key} page ${page}`);
    continue;
  }

  const prefix = join(tmpRoot, `${key}_page_${String(page).padStart(3, '0')}`);
  run('pdftoppm', ['-png', '-singlefile', '-f', String(page), '-l', String(page), '-r', String(dpi), pdf, prefix]);
  const image = `${prefix}.png`;
  const text = run('tesseract', [image, 'stdout', '-l', 'chi_sim+eng', '--psm', '6']);

  writeFileSync(output, `${JSON.stringify({
    source: key,
    pdf,
    physical_page: page,
    dpi,
    status: 'raw_ocr_needs_cleaning',
    text
  }, null, 2)}\n`);

  rmSync(image, { force: true });
  completed += 1;
  console.log(`[ok] ${key} page ${page} chars=${text.length}`);
}

console.log(`Done. New pages OCRed: ${completed}`);
