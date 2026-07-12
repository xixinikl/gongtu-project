#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const queueFile = join(root, 'output', 'quantity-bank', 'vision_repair_queue.json');
const outRoot = join(root, 'output', 'quantity-bank', 'repair_assets');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function findPdftoppm() {
  const candidates = [
    process.env.PDFTOPPM,
    '/Users/miduoduo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm',
    'pdftoppm'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) return candidate;
  }
  return 'pdftoppm';
}

function renderPage(pdftoppm, pdf, page, prefix, dpi) {
  mkdirSync(resolve(prefix, '..'), { recursive: true });
  const expected = `${prefix}-${String(page).padStart(3, '0')}.png`;
  if (existsSync(expected)) return { status: 'skipped', expected };
  const result = spawnSync(pdftoppm, [
    '-f', String(page),
    '-l', String(page),
    '-png',
    '-r', String(dpi),
    pdf,
    prefix
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`pdftoppm failed for ${pdf} page ${page}: ${result.stderr || result.stdout}`);
  }
  return { status: 'rendered', expected };
}

const limitArg = argValue('limit', '20');
const parsedLimit = limitArg === 'all' ? Number.POSITIVE_INFINITY : Number(limitArg);
const limit = Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : Number.POSITIVE_INFINITY;
const priority = argValue('priority', '');
const target = argValue('target', 'all');
const dpi = Number(argValue('dpi', '180'));
const queuePayload = JSON.parse(readFileSync(queueFile, 'utf8'));
const pdftoppm = findPdftoppm();

const items = queuePayload.queue
  .filter(item => !priority || item.priority === priority)
  .slice(0, Number.isFinite(limit) ? limit : undefined);

const rendered = [];
for (const item of items) {
  if ((target === 'all' || target === 'question') && item.question_source?.likely_page) {
    const pdfName = basename(item.question_source.pdf, '.pdf');
    const prefix = join(outRoot, 'questions', `${pdfName}_page`);
    rendered.push({
      id: item.id,
      kind: 'question',
      page: item.question_source.likely_page,
      ...renderPage(pdftoppm, item.question_source.pdf, item.question_source.likely_page, prefix, dpi)
    });
  }
  if (target === 'all' || target === 'analysis') {
    for (const page of item.analysis_source?.pages || []) {
      const pdf = item.analysis_source.pdfs.find(path => path.includes(page.source.replace('analysis_', ''))) || item.analysis_source.pdfs[0];
      if (!pdf) continue;
      const prefix = join(outRoot, 'analysis', `${page.source}_page`);
      rendered.push({
        id: item.id,
        kind: 'analysis',
        page: page.physical_page,
        ...renderPage(pdftoppm, pdf, page.physical_page, prefix, dpi)
      });
    }
  }
}

const counts = rendered.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  items: items.length,
  rendered_pages: rendered.length,
  counts,
  out_root: outRoot
}, null, 2));
