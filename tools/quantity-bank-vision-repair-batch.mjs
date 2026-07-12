#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const queueFile = join(root, 'output', 'quantity-bank', 'vision_repair_queue.json');
const assetRoot = join(root, 'output', 'quantity-bank', 'repair_assets');
const outDir = join(root, 'output', 'quantity-bank', 'vision_model_outputs');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function numericArg(name, fallback, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = Number(argValue(name, String(fallback)));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function pageImage(kind, source, page) {
  if (kind === 'question') {
    const pdfName = basename(source.pdf, '.pdf');
    return join(assetRoot, 'questions', `${pdfName}_page-${String(page).padStart(3, '0')}.png`);
  }
  return join(assetRoot, 'analysis', `${source}_page-${String(page).padStart(3, '0')}.png`);
}

function imagePart(file) {
  const bytes = readFileSync(file);
  return {
    type: 'image_url',
    image_url: {
      url: `data:image/png;base64,${bytes.toString('base64')}`
    }
  };
}

function laneInstruction(item) {
  switch (item.repair_lane) {
    case 'answer_recovery':
      return '本题属于 answer_recovery：优先从解析页确认参考答案。若解析页没有清楚答案，answer 必须为 null，并写 uncertainty；不要根据解题直觉猜答案。';
    case 'options_recovery':
      return '本题属于 options_recovery：优先核对题本页的 A/B/C/D 四个选项。选项不完整或有 OCR 残片时，只能依据原题页图修复；不要从解析页或常识补选项。';
    case 'stem_recovery':
      return '本题属于 stem_recovery：优先修复题干 OCR 噪声和断句。必须保留题目原意；无法看清的条件写 uncertainty。';
    case 'stem_analysis_rematch':
      return '本题属于 stem_analysis_rematch：重点判断题干和解析是否为同一道题。若不匹配，不要输出修复字段，只写 uncertainty 说明错配。';
    case 'image_crop_and_structure_repair':
      return '本题属于 image_crop_and_structure_repair：必须定位题干依赖的局部图形/表格/路线图/统计图，输出 needs_original_crop=true 和 crop_requests；不能用文字或 AI 重画替代原图。';
    default:
      return '本题未归入明确泳道：先确认题干、选项、答案、题型和解析是否同属一道题。';
  }
}

function taskPrompt(item) {
  return [
    '你在核对公务员行测数量关系题库。只依据给出的原始 PDF 页图，不要猜。',
    laneInstruction(item),
    '任务：修复题目结构化字段。若页面看不清或无法确认，uncertainty 必须写明，不能编造。',
    '特别规则：有图形、表格、路线图、统计图的题，必须标记 needs_original_crop=true；需要保留的是题干所依赖的局部图形裁剪，不是整页题目、解析或答案截图。',
    '如果 needs_original_crop=true，必须尽量给出 crop_requests：说明应从哪张 question_page 截取哪块局部图，bbox 使用原图页的归一化坐标 [x,y,width,height]，范围 0~1；如果无法可靠定位 bbox，则写 uncertainty。',
    '普通文字题必须输出结构化题干、选项、答案和解析要点；不要建议把整页 PDF 当作前台题目内容。',
    '输出严格 JSON：',
    '{',
    '  "id": string,',
    '  "stem": string|null,',
    '  "options": [{"key":"A","text":string},{"key":"B","text":string},{"key":"C","text":string},{"key":"D","text":string}]|null,',
    '  "answer": "A"|"B"|"C"|"D"|null,',
    '  "primary_topic": string|null,',
    '  "methods": string[],',
    '  "analysis_note": string|null,',
    '  "same_question": boolean|null,',
    '  "evidence_note": string|null,',
    '  "needs_original_crop": boolean,',
    '  "crop_requests": [{"source_role":"question_page","page":number,"bbox_normalized":[number,number,number,number],"reason":string}]|[],',
    '  "uncertainty": string|null',
    '}',
    '',
    `题目 ID：${item.id}`,
    `修复泳道：${item.repair_lane || 'unknown'}`,
    `自动阻塞原因：${(item.automatic_blockers || []).join('、') || '无'}`,
    `当前问题：${item.issue_labels.join('、')}`,
    `当前题干预览：${item.current.stem_preview}`,
    `当前选项数量：${item.current.options_count}`,
    `当前答案：${item.current.answer || '缺失'}，置信度：${item.current.answer_confidence}`,
    `当前题型：${item.current.primary_topic || '缺失'}`
  ].join('\n');
}

function buildTask(item) {
  const images = [];
  if (item.repair_target.includes('question') && item.question_source?.likely_page) {
    const file = pageImage('question', item.question_source, item.question_source.likely_page);
    images.push({ role: 'question_page', page: item.question_source.likely_page, file });
  }
  if (item.repair_target.includes('analysis')) {
    for (const page of item.analysis_source?.pages || []) {
      const file = pageImage('analysis', page.source, page.physical_page);
      images.push({ role: 'analysis_page', page: page.physical_page, file });
    }
  }
  const missingImages = images.filter(image => !existsSync(image.file));
  return {
    id: item.id,
    priority: item.priority,
    repair_route: item.repair_route,
    repair_target: item.repair_target,
    repair_lane: item.repair_lane || null,
    automatic_blockers: item.automatic_blockers || [],
    images,
    missing_images: missingImages,
    prompt: taskPrompt(item)
  };
}

async function callVision(task, config) {
  const content = [
    { type: 'text', text: task.prompt },
    ...task.images.map(image => imagePart(image.file))
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content
        }
      ]
    })
  }).finally(() => clearTimeout(timeout));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`vision request failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function callWithRetry(task, config) {
  let lastError = null;
  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    try {
      const raw = await callVision(task, config);
      return { status: 'ok', raw, attempt: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt < config.retries) {
        const delayMs = Math.min(10_000, 750 * 2 ** attempt);
        await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
      }
    }
  }
  return {
    status: 'failed',
    error: lastError?.message || String(lastError),
    attempt: config.retries + 1
  };
}

async function runPool(tasks, config) {
  const stats = {
    succeeded: 0,
    failed: 0,
    skipped_existing: 0
  };
  let index = 0;

  async function worker(workerId) {
    while (index < tasks.length) {
      const task = tasks[index];
      index += 1;
      const resultFile = join(outDir, `${task.id}.json`);
      if (!config.force && existsSync(resultFile)) {
        stats.skipped_existing += 1;
        continue;
      }
      const startedAt = new Date().toISOString();
      const result = await callWithRetry(task, config);
      if (result.status === 'ok') {
        stats.succeeded += 1;
        writeFileSync(resultFile, `${JSON.stringify({
          task,
          raw: result.raw,
          meta: {
            worker_id: workerId,
            attempts: result.attempt,
            started_at: startedAt,
            finished_at: new Date().toISOString()
          }
        }, null, 2)}\n`);
      } else {
        stats.failed += 1;
        writeFileSync(join(outDir, `${task.id}.error.json`), `${JSON.stringify({
          id: task.id,
          task,
          error: result.error,
          attempts: result.attempt,
          started_at: startedAt,
          finished_at: new Date().toISOString()
        }, null, 2)}\n`);
      }
    }
  }

  const workerCount = Math.min(config.concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) => worker(workerIndex + 1)));
  return stats;
}

const queuePayload = readJson(queueFile);
const priority = argValue('priority');
const route = argValue('route');
const lane = argValue('lane');
const offset = numericArg('offset', 0, { min: 0 });
const limitArg = argValue('limit', '20');
const parsedLimit = limitArg === 'all' ? Number.POSITIVE_INFINITY : Number(limitArg);
const limit = limitArg === 'all'
  ? Number.POSITIVE_INFINITY
  : (Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : 20);
const concurrency = numericArg('concurrency', 3, { min: 1, max: 8 });
const retries = numericArg('retries', 2, { min: 0, max: 5 });
const timeoutMs = numericArg('timeout-ms', 120_000, { min: 10_000, max: 600_000 });
const execute = hasFlag('execute');
const force = hasFlag('force');
const baseUrl = process.env.QUANTITY_VISION_BASE_URL || process.env.OPENAI_BASE_URL || '';
const apiKey = process.env.QUANTITY_VISION_API_KEY || process.env.OPENAI_API_KEY || '';
const model = process.env.QUANTITY_VISION_MODEL || process.env.OPENAI_MODEL || '';

const sourceItems = queuePayload.queue
  .filter(item => !priority || item.priority === priority)
  .filter(item => !route || item.repair_route === route)
  .filter(item => !lane || item.repair_lane === lane)
  .slice(offset, Number.isFinite(limit) ? offset + limit : undefined);

const tasks = sourceItems.map(buildTask);
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dryRunFile = join(outDir, `vision_tasks_${stamp}.json`);
const isFullUnfilteredRun = !priority && !route && !lane && offset === 0 && limitArg === 'all';
const dryRunPayload = {
  created_at: new Date().toISOString(),
  execute,
  filters: { priority, route, lane, offset, limit: limitArg },
  execution: { concurrency, retries, timeout_ms: timeoutMs, force },
  task_count: tasks.length,
  missing_image_tasks: tasks.filter(task => task.missing_images.length).length,
  tasks: tasks.map(task => ({
    ...task,
    prompt: `${task.prompt.slice(0, 1200)}${task.prompt.length > 1200 ? '...' : ''}`
  }))
};
writeFileSync(dryRunFile, `${JSON.stringify(dryRunPayload, null, 2)}\n`);
const stableTaskFile = isFullUnfilteredRun ? 'vision_tasks_latest.json' : 'vision_tasks_latest_filtered.json';
writeFileSync(join(outDir, stableTaskFile), `${JSON.stringify({
  ...dryRunPayload,
  generated_file: dryRunFile
}, null, 2)}\n`);

if (!execute) {
  console.log(JSON.stringify({
    status: 'dry_run_created',
    task_count: tasks.length,
    missing_image_tasks: tasks.filter(task => task.missing_images.length).length,
    output: dryRunFile,
    next: 'Render missing images first, then set QUANTITY_VISION_BASE_URL, QUANTITY_VISION_API_KEY, QUANTITY_VISION_MODEL and rerun with --execute. Use --concurrency=3 and --limit=all for the prepared full queue.'
  }, null, 2));
  process.exit(0);
}

if (!baseUrl || !apiKey || !model) {
  throw new Error('Missing QUANTITY_VISION_BASE_URL/QUANTITY_VISION_API_KEY/QUANTITY_VISION_MODEL or OPENAI_* equivalents.');
}

const missing = tasks.filter(task => task.missing_images.length);
if (missing.length) {
  throw new Error(`Cannot execute; ${missing.length} tasks have missing rendered page images. Run quantity-bank-render-repair-assets first.`);
}

const stats = await runPool(tasks, { baseUrl, apiKey, model, concurrency, retries, timeoutMs, force });

console.log(JSON.stringify({
  status: 'vision_batch_completed',
  task_count: tasks.length,
  ...stats,
  out_dir: outDir
}, null, 2));
