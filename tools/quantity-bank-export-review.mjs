#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const candidateFile = join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json');
const repairFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');
const outDir = join(root, 'output', 'quantity-bank');

function readVerifiedRepairCount() {
  try {
    return (JSON.parse(readFileSync(repairFile, 'utf8')).repairs || []).length;
  } catch {
    return 0;
  }
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function short(text, length = 120) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, length);
}

const questions = JSON.parse(readFileSync(candidateFile, 'utf8'));
const verifiedRepairCount = readVerifiedRepairCount();
const garbledReferenceCount = questions.filter(item => item.learning_tags.answer_source === 'garbled_reference_answer_line').length;
const reviewRows = questions
  .filter(item => item.review_status === 'needs_review')
  .map(item => ({
    id: item.id,
    set_no: item.set_no,
    question_no: item.question_no,
    issues: item.quality.issues.join('|'),
    answer: item.content.answer || '',
    primary_topic: item.learning_tags.primary_topic || '',
    secondary_topics: item.learning_tags.secondary_topics.join('|'),
    methods: item.learning_tags.methods.join('|'),
    exam_decision: item.learning_tags.exam_decision,
    options_count: item.content.options.length,
    stem_preview: short(item.content.stem),
    analysis_preview: short(item.content.analysis)
  }));

const headers = Object.keys(reviewRows[0] || {
  id: '',
  set_no: '',
  question_no: '',
  issues: '',
  answer: '',
  primary_topic: '',
  secondary_topics: '',
  methods: '',
  exam_decision: '',
  options_count: '',
  stem_preview: '',
  analysis_preview: ''
});

const csv = [
  headers.map(csvCell).join(','),
  ...reviewRows.map(row => headers.map(header => csvCell(row[header])).join(','))
].join('\n');

const byIssue = new Map();
for (const item of questions) {
  for (const issue of item.quality.issues) {
    byIssue.set(issue, (byIssue.get(issue) || 0) + 1);
  }
}

function hasOnly(item, issues) {
  return item.quality.issues.length === issues.length
    && issues.every(issue => item.quality.issues.includes(issue));
}

const repairBuckets = [
  {
    name: '高风险：题干解析错配',
    count: questions.filter(item => item.quality.issues.includes('analysis_stem_mismatch')).length,
    action: '必须重新匹配题本页和解析页；这种题即使答案、选项齐全也不能进入 approved_seed。'
  },
  {
    name: '低风险：仅答案低置信',
    count: questions.filter(item => hasOnly(item, ['answer_low_confidence'])).length,
    action: '只在出现明确“参考答案/答案为”或可人工抽样确认的 OCR 标记时升级，避免从乱码括号误抓答案。'
  },
  {
    name: '中风险：仅选项不完整',
    count: questions.filter(item => hasOnly(item, ['options_incomplete'])).length,
    action: '继续优化横排选项、大小写 C/D、断行数字选项识别；修完必须重新跑四选项门禁。'
  },
  {
    name: '中风险：仅题干 OCR 噪声',
    count: questions.filter(item => hasOnly(item, ['question_suspicious_ocr'])).length,
    action: '优先处理题干中残留英文大写、@、| 等旁栏噪声；不能用规则确定的继续留队列。'
  },
  {
    name: '高风险：图形依赖题',
    count: questions.filter(item => item.quality.issues.includes('image_dependent_question')).length,
    action: '必须保留原图裁片或人工重录图形信息，不能只靠 OCR 文字进入用户训练。'
  },
  {
    name: '中风险：题型与题干冲突',
    count: questions.filter(item => item.quality.issues.includes('topic_conflicts_with_stem')).length,
    action: '优先用解析页题型标题和题干关键词复核；无法确定时留在后台，不给用户做题型训练。'
  },
  {
    name: '高风险：缺答案',
    count: questions.filter(item => item.quality.issues.includes('answer_missing')).length,
    action: '需要回看解析 OCR 或原图；没有可靠答案前不得进入 approved_seed。'
  }
];

const byDecision = new Map();
for (const item of questions) {
  byDecision.set(item.learning_tags.exam_decision, (byDecision.get(item.learning_tags.exam_decision) || 0) + 1);
}

const topicCounts = new Map();
for (const item of questions) {
  const topic = item.learning_tags.primary_topic || '未识别';
  topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
}

const markdown = `# 数量关系题库审核队列

生成对象：\`output/quantity-bank/clean_candidates/all_questions.json\`

## 总览

- 候选题总数：${questions.length}
- 可作为候选基础：${questions.filter(item => item.review_status === 'candidate_ok').length}
- 需要复查：${reviewRows.length}

## 问题类型

${[...byIssue.entries()].sort((a, b) => b[1] - a[1]).map(([issue, count]) => `- ${issue}: ${count}`).join('\n')}

## 自动修复优先级

${repairBuckets.map(item => `- ${item.name}: ${item.count}。${item.action}`).join('\n')}

## 本轮自动修复策略

- 横排选项识别支持小写 \`c.\`、带引号/顿号/逗号的 \`D,.\` 等 OCR 形态。
- 选项展示清理百分数小数逗号、末尾孤立句点、重复选项字母前缀和 \`$F\` 误识别单位。
- 当题本选项不完整但解析页题头存在干净完整的 A/B/C/D 选项时，自动回填缺失或脏选项。
- 放行 \`AB 间距离\` 这类合法字母变量，但继续拦截 \`NIL/M12/uk/Wh\` 等不确定英文噪声。
- 明确的 \`参考答案】(C\` 这类答案格式按高置信处理。
- 明确的 \`参考答案】0C\`、\`参考答案】人A\`、\`参考答案】〗D\` 这类参考答案 OCR 前缀噪声按高置信处理，但不把孤立 \`0/6/8\` 猜成选项。
- 解析页答案行如果 OCR 成 \`[AFB#R) D\`、\`[SHER B\` 这类乱码，只在答案字母位于行尾、且是括号后或空格后独立字母时升级为高置信；当前识别 ${garbledReferenceCount} 道，避免把 \`SFERIA\`、\`LEAK\` 之类噪声尾字母当答案。
- 题型标签归一 \`周期各环\`、\`节什\`、\`等关\` 等 OCR 误字，并截断明显污染尾巴。
- 仍然不批量升级纯乱码括号答案，防止把错答案放入用户训练。
- 原图/视觉核验覆盖层当前记录 ${verifiedRepairCount} 道题，修复内容来自 \`data/quantity_bank/verified_repairs.json\`，仍需重新通过同一套门禁。

## 考场策略初标

${[...byDecision.entries()].sort((a, b) => b[1] - a[1]).map(([decision, count]) => `- ${decision}: ${count}`).join('\n')}

## 高频主题初标

${[...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([topic, count]) => `- ${topic}: ${count}`).join('\n')}

## 使用建议

1. 优先复查 \`answer_missing\`，因为没有答案不能进入正式训练。
2. 其次复查 \`options_incomplete\`，因为选项 OCR 错会影响选择题。
3. \`image_dependent_question\` 需要保留原图裁片或人工重录，不能只靠 OCR 文本。
4. 运行 \`node tools/quantity-bank-export-vision-queue.mjs\` 可生成原图/视觉模型修复队列，记录每道待修题应回看哪份 PDF 和哪些页。
5. 通过复查后的题目再进入正式题库，不要把 raw OCR 直接展示给用户。
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'review_queue.csv'), `${csv}\n`);
writeFileSync(join(outDir, 'review_summary.md'), markdown);
console.log(`Wrote ${reviewRows.length} review rows`);
