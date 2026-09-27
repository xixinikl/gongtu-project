#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const candidateFile = join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json');
const approvedFile = join(root, 'output', 'quantity-bank', 'approved_seed', 'questions.json');
const manifestFile = join(root, 'data', 'quantity_bank', 'import_manifest.json');
const rawDir = join(root, 'output', 'quantity-bank', 'raw_sets');
const outDir = join(root, 'output', 'quantity-bank');

const ISSUE_LABELS = {
  analysis_auto_rematched_needs_review: '解析自动重配待复核',
  analysis_stem_mismatch: '题干解析错配',
  answer_low_confidence: '答案低置信',
  answer_missing: '缺答案',
  analysis_missing_or_short: '解析缺失或过短',
  image_dependent_question: '图形依赖',
  option_suspicious_ocr: '选项 OCR 噪声',
  options_incomplete: '选项不完整',
  question_block_missing_needs_original_check: '题本切块缺失，需原图核对',
  question_suspicious_ocr: '题干 OCR 噪声',
  question_too_short: '题干过短',
  topic_missing: '题型缺失',
  topic_conflicts_with_stem: '题型与题干冲突',
  topic_suspicious_ocr: '题型 OCR 噪声'
};

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function preview(text, length = 96) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function hasAny(issues, names) {
  return names.some(name => issues.includes(name));
}

function issueLabels(issues) {
  return issues.map(issue => ISSUE_LABELS[issue] || issue);
}

function routeFor(issues) {
  if (issues.includes('image_dependent_question')) return 'vision_model_required';
  if (hasAny(issues, ['analysis_stem_mismatch', 'analysis_auto_rematched_needs_review'])) return 'vision_model_recommended';
  if (hasAny(issues, [
    'answer_missing',
    'options_incomplete',
    'option_suspicious_ocr',
    'question_block_missing_needs_original_check',
    'question_suspicious_ocr',
    'question_too_short'
  ])) {
    return 'vision_model_recommended';
  }
  if (hasAny(issues, ['answer_low_confidence', 'topic_missing', 'topic_suspicious_ocr', 'topic_conflicts_with_stem', 'analysis_missing_or_short'])) {
    return 'auto_rule_then_vision_if_unresolved';
  }
  return 'no_extra_repair';
}

function priorityFor(issues) {
  let score = 0;
  if (issues.includes('image_dependent_question')) score = Math.max(score, 100);
  if (issues.includes('answer_missing')) score = Math.max(score, 92);
  if (issues.includes('analysis_auto_rematched_needs_review')) score = Math.max(score, 89);
  if (issues.includes('analysis_stem_mismatch')) score = Math.max(score, 88);
  if (hasAny(issues, ['options_incomplete', 'option_suspicious_ocr'])) score = Math.max(score, 84);
  if (hasAny(issues, ['question_suspicious_ocr', 'question_too_short'])) score = Math.max(score, 74);
  if (hasAny(issues, ['topic_missing', 'topic_suspicious_ocr', 'topic_conflicts_with_stem'])) score = Math.max(score, 58);
  if (issues.includes('analysis_missing_or_short')) score = Math.max(score, 54);
  if (issues.includes('answer_low_confidence')) score = Math.max(score, 48);
  if (score >= 84) return { level: 'high', score };
  if (score >= 54) return { level: 'medium', score };
  return { level: 'low', score };
}

function repairTargetFor(issues) {
  const needsQuestionPage = hasAny(issues, [
    'analysis_stem_mismatch',
    'analysis_auto_rematched_needs_review',
    'image_dependent_question',
    'options_incomplete',
    'option_suspicious_ocr',
    'question_block_missing_needs_original_check',
    'question_suspicious_ocr',
    'question_too_short'
  ]);
  const needsAnalysisPage = hasAny(issues, [
    'analysis_stem_mismatch',
    'analysis_auto_rematched_needs_review',
    'answer_missing',
    'answer_low_confidence',
    'analysis_missing_or_short',
    'topic_missing',
    'topic_suspicious_ocr',
    'topic_conflicts_with_stem'
  ]);
  if (needsQuestionPage && needsAnalysisPage) return 'both_question_and_analysis_pages';
  if (needsQuestionPage) return 'question_page';
  if (needsAnalysisPage) return 'analysis_page';
  return 'none';
}

function repairLaneFor(issues) {
  if (issues.includes('image_dependent_question')) return 'image_crop_and_structure_repair';
  if (hasAny(issues, ['analysis_stem_mismatch', 'analysis_auto_rematched_needs_review'])) return 'stem_analysis_rematch';
  if (hasAny(issues, ['options_incomplete', 'option_suspicious_ocr'])) return 'options_recovery';
  if (hasAny(issues, ['answer_missing', 'answer_low_confidence'])) return 'answer_recovery';
  if (hasAny(issues, ['question_suspicious_ocr', 'question_too_short', 'question_block_missing_needs_original_check'])) return 'stem_recovery';
  if (hasAny(issues, ['topic_missing', 'topic_suspicious_ocr', 'topic_conflicts_with_stem'])) return 'topic_method_repair';
  if (issues.includes('analysis_missing_or_short')) return 'analysis_note_repair';
  return 'manual_triage';
}

function automaticBlockers(issues) {
  const blockers = [];
  if (issues.includes('image_dependent_question')) blockers.push('needs_original_question_crop');
  if (hasAny(issues, ['analysis_stem_mismatch', 'analysis_auto_rematched_needs_review'])) blockers.push('stem_analysis_pair_not_proven');
  if (hasAny(issues, ['options_incomplete', 'option_suspicious_ocr'])) blockers.push('options_not_structurally_safe');
  if (hasAny(issues, ['answer_missing', 'answer_low_confidence'])) blockers.push('answer_not_high_confidence');
  if (hasAny(issues, ['question_suspicious_ocr', 'question_too_short', 'question_block_missing_needs_original_check'])) blockers.push('stem_not_structurally_safe');
  if (hasAny(issues, ['topic_missing', 'topic_suspicious_ocr', 'topic_conflicts_with_stem'])) blockers.push('topic_or_method_not_clean');
  if (issues.includes('analysis_missing_or_short')) blockers.push('analysis_not_enough_for_teaching');
  return blockers;
}

function whyVisual(issues) {
  const reasons = [];
  if (issues.includes('image_dependent_question')) {
    reasons.push('题目含图形或版面信息，OCR 文本不足以保证题干完整。');
  }
  if (hasAny(issues, ['options_incomplete', 'option_suspicious_ocr'])) {
    reasons.push('选项缺失或含 OCR 噪声，需要看题本原图核对 A/B/C/D。');
  }
  if (hasAny(issues, ['question_suspicious_ocr', 'question_too_short'])) {
    reasons.push('题干疑似被旁栏、英文残片或断行污染，需要回看题本原图。');
  }
  if (issues.includes('question_block_missing_needs_original_check')) {
    reasons.push('题本 OCR 未能切出该题，只能暂用解析题头，必须回看题本原图确认题干和选项。');
  }
  if (issues.includes('analysis_stem_mismatch')) {
    reasons.push('题干和解析疑似不是同一道题，需要同时回看题本页和解析页重新匹配。');
  }
  if (issues.includes('analysis_auto_rematched_needs_review')) {
    reasons.push('系统已尝试按相似度重配解析块，但不能直接进入前台，需要原图或视觉模型复核。');
  }
  if (hasAny(issues, ['answer_missing', 'answer_low_confidence'])) {
    reasons.push('答案无法由解析 OCR 高置信提取，需要回看解析页。');
  }
  if (hasAny(issues, ['topic_missing', 'topic_suspicious_ocr', 'topic_conflicts_with_stem', 'analysis_missing_or_short'])) {
    reasons.push('题型或解析信息不可靠，需要结合解析页复核标签和方法。');
  }
  return reasons;
}

function canAutoRepairFirst(issues) {
  const highRisk = new Set([
    'image_dependent_question',
    'analysis_stem_mismatch',
    'analysis_auto_rematched_needs_review',
    'answer_missing',
    'options_incomplete',
    'option_suspicious_ocr',
    'question_block_missing_needs_original_check',
    'question_suspicious_ocr',
    'question_too_short'
  ]);
  return issues.length > 0 && issues.every(issue => !highRisk.has(issue));
}

function likelyQuestionPage(questionPages, questionNo) {
  if (!questionPages?.length) return null;
  const index = Math.min(Math.floor((questionNo - 1) / 5), questionPages.length - 1);
  return questionPages[index];
}

function repairPrompt(item, target) {
  const requested = [];
  if (target.includes('question')) requested.push('题干和 A/B/C/D 四个选项');
  if (target.includes('analysis')) requested.push('参考答案、题型分类和解析摘要');
  const requestedText = requested.length ? requested.join('、') : '题目结构';
  return [
    `请根据原始 PDF 页图核对第 ${item.set_no} 套第 ${item.question_no} 题的${requestedText}。`,
    '只输出 JSON，不要补写题库里没有的内容。',
    '字段：stem, options[{key,text}], answer, primary_topic, methods, analysis_note, uncertainty。',
    '如果图片无法确认，请把 uncertainty 写清楚，不要猜。'
  ].join('');
}

function groupedCounts(items, keyFn) {
  const map = new Map();
  for (const item of items) bump(map, keyFn(item));
  return Object.fromEntries([...map.entries()].sort());
}

function actionForStatus(item) {
  if (item.public_status === 'approved_seed') return '可进入前台训练';
  if (item.repair_route === 'vision_model_required') return '必须原图/视觉复核，图形题需裁原 PDF 局部图';
  if (item.repair_route === 'vision_model_recommended') return '建议视觉模型或原图回看修复';
  if (item.repair_route === 'auto_rule_then_vision_if_unresolved') return '先规则修复，失败再送视觉/原图';
  return '保留后台，补充修复策略';
}

function loadRawBySet() {
  const map = new Map();
  for (let setNo = 1; setNo <= 60; setNo += 1) {
    const key = String(setNo).padStart(2, '0');
    map.set(setNo, readJson(join(rawDir, `set_${key}.json`)));
  }
  return map;
}

const manifest = readJson(manifestFile);
const candidates = readJson(candidateFile);
const approved = readJson(approvedFile);
const approvedIds = new Set(approved.map(item => item.id));
const rawBySet = loadRawBySet();

const queue = [];
const statusManifest = [];
const routeCounts = new Map();
const priorityCounts = new Map();
const targetCounts = new Map();
const laneCounts = new Map();
const issueCounts = new Map();
const autoFirstCounts = new Map();

for (const item of candidates) {
  const raw = rawBySet.get(item.set_no);
  const issues = item.quality?.issues || [];
  const publicStatus = approvedIds.has(item.id) ? 'approved_seed' : 'held_back';
  const route = publicStatus === 'approved_seed' ? 'approved_seed' : routeFor(issues);
  const priority = priorityFor(issues);
  const repairTarget = repairTargetFor(issues);
  const repairLane = publicStatus === 'approved_seed' ? 'approved_seed' : repairLaneFor(issues);
  const blockers = automaticBlockers(issues);
  const autoFirst = publicStatus !== 'approved_seed' && canAutoRepairFirst(issues);
  const questionLikelyPage = likelyQuestionPage(raw?.question_pages, item.question_no);
  const questionSource = {
    pdf: manifest.files.questions.path,
    pages: raw?.question_pages || [],
    likely_page: questionLikelyPage,
    note: 'likely_page uses 1-5 on the first set page and 6-10 on the second set page.'
  };
  const analysisSource = {
    pdfs: [...new Set((raw?.analysis_pages || []).map(page => manifest.files[page.source]?.path).filter(Boolean))],
    pages: raw?.analysis_pages || []
  };

  const statusRecord = {
    id: item.id,
    set_no: item.set_no,
    question_no: item.question_no,
    public_status: publicStatus,
    repair_route: route,
    priority: priority.level,
    repair_target: repairTarget,
    repair_lane: repairLane,
    automatic_blockers: blockers,
    issues,
    issue_labels: issueLabels(issues),
    can_auto_repair_first: autoFirst
  };
  statusManifest.push(statusRecord);

  if (publicStatus === 'approved_seed') continue;

  const queueItem = {
    ...statusRecord,
    priority_score: priority.score,
    why_visual: whyVisual(issues),
    question_source: questionSource,
    analysis_source: analysisSource,
    current: {
      stem_preview: preview(item.content?.stem),
      options_count: item.content?.options?.length || 0,
      options: item.content?.options || [],
      answer: item.content?.answer || null,
      answer_confidence: item.learning_tags?.answer_confidence || 'missing',
      primary_topic: item.learning_tags?.primary_topic || null,
      analysis_preview: preview(item.content?.analysis)
    },
    recommended_prompt: repairPrompt(item, repairTarget),
    blocked_from_user_training: true
  };
  queue.push(queueItem);

  bump(routeCounts, route);
  bump(priorityCounts, priority.level);
  bump(targetCounts, repairTarget);
  bump(laneCounts, repairLane);
  bump(autoFirstCounts, autoFirst ? 'auto_rule_first' : 'vision_or_original_required');
  for (const issue of issues) bump(issueCounts, issue);
}

queue.sort((a, b) => b.priority_score - a.priority_score
  || a.set_no - b.set_no
  || a.question_no - b.question_no);

const summary = {
  status: 'vision_repair_queue_exported',
  total_candidates: candidates.length,
  approved_seed: approvedIds.size,
  held_back: candidates.length - approvedIds.size,
  queue_items: queue.length,
  by_route: Object.fromEntries([...routeCounts.entries()].sort()),
  by_priority: Object.fromEntries([...priorityCounts.entries()].sort()),
  by_repair_target: Object.fromEntries([...targetCounts.entries()].sort()),
  by_repair_lane: Object.fromEntries([...laneCounts.entries()].sort()),
  by_repair_start: Object.fromEntries([...autoFirstCounts.entries()].sort()),
  by_issue: Object.fromEntries([...issueCounts.entries()].sort((a, b) => b[1] - a[1])),
  source_policy: [
    'approved_seed is the only user-facing layer.',
    'held_back questions stay in repair queues until they pass the same gate.',
    'image_dependent_question must be checked against original page images before training use.'
  ]
};

const csvHeaders = [
  'id',
  'set_no',
  'question_no',
  'priority',
  'repair_route',
  'repair_target',
  'repair_lane',
  'automatic_blockers',
  'issues',
  'question_pdf',
  'question_likely_page',
  'analysis_pdfs',
  'analysis_pages',
  'options_count',
  'answer',
  'answer_confidence',
  'primary_topic',
  'stem_preview'
];

const csvRows = queue.map(item => ({
  id: item.id,
  set_no: item.set_no,
  question_no: item.question_no,
  priority: item.priority,
  repair_route: item.repair_route,
  repair_target: item.repair_target,
  repair_lane: item.repair_lane,
  automatic_blockers: item.automatic_blockers.join('|'),
  issues: item.issues.join('|'),
  question_pdf: item.question_source.pdf,
  question_likely_page: item.question_source.likely_page,
  analysis_pdfs: item.analysis_source.pdfs.join('|'),
  analysis_pages: item.analysis_source.pages.map(page => `${page.source}:${page.physical_page}`).join('|'),
  options_count: item.current.options_count,
  answer: item.current.answer || '',
  answer_confidence: item.current.answer_confidence,
  primary_topic: item.current.primary_topic || '',
  stem_preview: item.current.stem_preview
}));

const csv = [
  csvHeaders.map(csvCell).join(','),
  ...csvRows.map(row => csvHeaders.map(header => csvCell(row[header])).join(','))
].join('\n');

const statusCsvHeaders = [
  'id',
  'set_no',
  'question_no',
  'public_status',
  'repair_route',
  'priority',
  'repair_target',
  'repair_lane',
  'automatic_blockers',
  'can_auto_repair_first',
  'issues',
  'issue_labels',
  'next_action'
];

const statusRows = statusManifest
  .slice()
  .sort((a, b) => a.set_no - b.set_no || a.question_no - b.question_no)
  .map(item => ({
    id: item.id,
    set_no: item.set_no,
    question_no: item.question_no,
    public_status: item.public_status,
    repair_route: item.repair_route,
    priority: item.priority,
    repair_target: item.repair_target,
    repair_lane: item.repair_lane,
    automatic_blockers: item.automatic_blockers.join('|'),
    can_auto_repair_first: item.can_auto_repair_first,
    issues: item.issues.join('|'),
    issue_labels: item.issue_labels.join('|'),
    next_action: actionForStatus(item)
  }));

const statusCsv = [
  statusCsvHeaders.map(csvCell).join(','),
  ...statusRows.map(row => statusCsvHeaders.map(header => csvCell(row[header])).join(','))
].join('\n');

const markdown = `# 数量关系视觉/原图修复队列

生成对象：\`output/quantity-bank/clean_candidates/all_questions.json\`

## 总览

- 候选题总数：${summary.total_candidates}
- 前台高置信可用：${summary.approved_seed}
- 后台待修：${summary.held_back}
- 视觉/原图队列：${summary.queue_items}

## 修复路线

${Object.entries(summary.by_route).map(([route, count]) => `- ${route}: ${count}`).join('\n')}

## 优先级

${Object.entries(summary.by_priority).map(([priority, count]) => `- ${priority}: ${count}`).join('\n')}

## 回看目标

${Object.entries(summary.by_repair_target).map(([target, count]) => `- ${target}: ${count}`).join('\n')}

## 批处理泳道

${Object.entries(summary.by_repair_lane).map(([lane, count]) => `- ${lane}: ${count}`).join('\n')}

## 问题分布

${Object.entries(summary.by_issue).map(([issue, count]) => `- ${issue}: ${count}`).join('\n')}

## 使用规则

1. 前台只读取 \`approved_seed\`，本队列题目默认 \`blocked_from_user_training=true\`。
2. \`vision_model_required\` 必须看原图或多模态模型，不允许只靠 OCR 文字上线。
3. \`auto_rule_then_vision_if_unresolved\` 可以先继续做规则修复，修不动再送视觉模型。
4. 视觉模型输出仍需回到同一套门禁：题干、四选项、答案、题型、方法全部干净才可进入 \`approved_seed\`。
`;

const statusReport = `# 数量关系 600 题状态总表

生成对象：\`output/quantity-bank/question_status_manifest.json\`

## 当前结论

- 全量候选：${summary.total_candidates}
- 可直接给用户训练：${summary.approved_seed}
- 后台待修：${summary.held_back}
- 前台读取规则：只读 \`output/quantity-bank/approved_seed/questions.json\`
- 后台队列规则：所有 \`held_back\` 题默认不能进入用户训练

## 600 题状态分布

${Object.entries(groupedCounts(statusManifest, item => item.public_status)).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

## 后台修复路线

${Object.entries(summary.by_route).map(([route, count]) => `- ${route}: ${count}`).join('\n')}

## 批处理泳道

${Object.entries(summary.by_repair_lane).map(([lane, count]) => `- ${lane}: ${count}`).join('\n')}

## 下一步动作分布

${Object.entries(groupedCounts(statusManifest, actionForStatus)).map(([action, count]) => `- ${action}: ${count}`).join('\n')}

## 主要不能上线原因

${Object.entries(summary.by_issue).map(([issue, count]) => `- ${ISSUE_LABELS[issue] || issue} (${issue}): ${count}`).join('\n')}

## 验收必备问题指标

- 缺答案：${summary.by_issue.answer_missing || 0}
- 缺选项/选项不完整：${summary.by_issue.options_incomplete || 0}
- 选项 OCR 噪声：${summary.by_issue.option_suspicious_ocr || 0}
- 题干 OCR 噪声：${summary.by_issue.question_suspicious_ocr || 0}
- 题型缺失/脏题型：${(summary.by_issue.topic_missing || 0) + (summary.by_issue.topic_suspicious_ocr || 0)}
- 图形依赖题：${summary.by_issue.image_dependent_question || 0}

## 可自动修复优先级

1. 先处理 \`auto_rule_then_vision_if_unresolved\`：${summary.by_route.auto_rule_then_vision_if_unresolved || 0} 道。重点是低风险题型/解析标签问题；修完必须重跑清洗、导出、校验。
2. 再批量处理 \`vision_model_recommended\`：${summary.by_route.vision_model_recommended || 0} 道。优先缺答案、选项缺失/噪声、题干 OCR 噪声和题干解析错配。
3. 单独处理 \`vision_model_required\`：${summary.by_route.vision_model_required || 0} 道。图形依赖题必须从原 PDF 裁局部题干图，不能 AI 重画，也不能贴整页题目或解析。

## 硬门禁

- 答案低置信、缺答案、题干解析错配、自动重配待复核、图形依赖题都不得直接进 \`approved_seed\`。
- 图形题没有原 PDF 局部裁剪资产前，不得上线。
- 视觉或规则修复后仍需通过：\`node tools/quantity-bank-validate-approved.mjs\` 和 \`node tools/quantity-bank-audit-approved-answers.mjs\`。
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'vision_repair_queue.json'), `${JSON.stringify({ summary, queue }, null, 2)}\n`);
writeFileSync(join(outDir, 'vision_repair_queue.csv'), `${csv}\n`);
writeFileSync(join(outDir, 'vision_repair_summary.md'), markdown);
writeFileSync(join(outDir, 'question_status_manifest.json'), `${JSON.stringify({ summary, items: statusManifest }, null, 2)}\n`);
writeFileSync(join(outDir, 'question_status_matrix.csv'), `${statusCsv}\n`);
writeFileSync(join(outDir, 'question_status_report.md'), statusReport);
console.log(JSON.stringify(summary, null, 2));
