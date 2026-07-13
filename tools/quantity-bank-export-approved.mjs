#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const sourceFile = join(root, 'output', 'quantity-bank', 'clean_candidates', 'all_questions.json');
const outDir = join(root, 'output', 'quantity-bank', 'approved_seed');

const questions = JSON.parse(readFileSync(sourceFile, 'utf8'));

function isCleanTopic(topic) {
  return topic
    && topic.length <= 24
    && !/[A-Za-z]|[晶尸妇女太扒挤]|十等|问是|容斤|行各|各环|久变|匀变如|流术|等半|等关|遗失|分钟|即|空位|插入|成的|没有|和平方|\+\s*$|问题\s*人/.test(topic);
}

function publicMethods(topic) {
  if (topic.includes('工程')) return ['工程效率', '设总量'];
  if (topic.includes('和差倍比')) return ['赋值法', '方程法'];
  if (topic.includes('行程')) return ['行程公式', '画线段'];
  if (topic.includes('经济利润')) return ['利润公式', '方程法'];
  if (topic.includes('排列组合')) return ['分类分步', '插空法'];
  if (topic.includes('概率')) return ['概率分析'];
  if (topic.includes('几何')) return ['几何建模'];
  if (topic.includes('日期星期')) return ['周期推算'];
  if (topic.includes('周期循环')) return ['周期推算'];
  if (topic.includes('最值')) return ['极限构造'];
  if (topic.includes('不定方程')) return ['方程法', '代入排除'];
  if (topic.includes('牛吃草')) return ['牛吃草模型'];
  if (topic.includes('比赛')) return ['比赛积分'];
  return ['常规建模'];
}

function hasUsableQuestionMedia(media) {
  return Array.isArray(media)
    && media.some(item => item?.type === 'question_figure_crop'
      && typeof item.asset === 'string'
      && existsSync(item.asset)
      && Array.isArray(item.crop_box)
      && item.crop_box.length === 4
      && item.crop_box.every(value => Number.isFinite(Number(value)))
      && !/解析/.test(item.source_pdf || ''));
}

function hasSupportedOptions(item) {
  const options = item.content.options;
  if (!Array.isArray(options) || options.length < 4 || options.length > 8) return false;
  if (options.length !== 4 && item.source.verified_repair?.type !== 'full_visual_set_audit') return false;
  const expectedKeys = Array.from({ length: options.length }, (_, index) => String.fromCharCode(65 + index));
  return options.every((option, index) => option?.key === expectedKeys[index] && option.text?.trim())
    && expectedKeys.includes(item.content.answer);
}

function answerAuditTier(source) {
  if ([
    'full_visual_set_audit',
    'manual_original_page_recovery',
    'manual_analysis_page_recovery',
    'verified_original_page',
    'verified_original_analysis_page',
    'original_question_page_visual_review'
  ].includes(source)) {
    return 'manual_or_original_page_verified';
  }
  if ([
    'manual_strict_reasoning_override',
    'strict_reasoning_from_clean_stem'
  ].includes(source)) {
    return 'strict_reasoning_derived';
  }
  if ([
    'answer_sentence',
    'manual_ocr_option_recovery',
    'manual_ocr_stem_recovery',
    'verified_ocr_reference_answer',
    'strict_ocr_analysis_result_match',
    'strict_ocr_analysis_conclusion',
    'reference_answer_ocr_prefix',
    'reference_answer_ocr_variant',
    'garbled_reference_answer_line'
  ].includes(source)) {
    return 'ocr_evidence_audited';
  }
  return 'unknown_answer_source';
}

const approved = questions.filter(item => {
  return item.review_status === 'candidate_ok'
    && item.content.answer
    && hasSupportedOptions(item)
    && isCleanTopic(item.learning_tags.primary_topic)
    && item.learning_tags.answer_confidence === 'high'
    && (!item.quality.issues.includes('image_dependent_question') || hasUsableQuestionMedia(item.content.media))
    && !item.quality.issues.includes('topic_suspicious_ocr')
    && !item.quality.issues.includes('question_suspicious_ocr')
    && !item.quality.issues.includes('option_suspicious_ocr');
});

const canonicalTopics = new Set(approved.map(item => item.learning_tags.primary_topic));

const publicItems = approved.map(item => {
  const tier = answerAuditTier(item.learning_tags.answer_source);
  const fullyVisuallyAudited = item.learning_tags.answer_source === 'full_visual_set_audit';
  return {
    id: item.id,
    set_no: item.set_no,
    question_no: item.question_no,
    stem: item.content.stem,
    options: item.content.options,
    media: item.content.media || [],
    answer: item.content.answer,
    analysis: item.content.analysis,
    tags: {
      primary_topic: item.learning_tags.primary_topic,
      secondary_topics: (item.learning_tags.secondary_topics || [])
        .filter(topic => topic !== item.learning_tags.primary_topic)
        .filter(topic => canonicalTopics.has(topic)),
      methods: publicMethods(item.learning_tags.primary_topic),
      answer_source: item.learning_tags.answer_source,
      answer_audit_tier: tier,
      answer_requires_original_recheck: tier === 'ocr_evidence_audited' || tier === 'unknown_answer_source',
      exam_decision: item.learning_tags.exam_decision,
      estimated_seconds: item.learning_tags.estimated_seconds,
      decision_reason: item.learning_tags.decision_reason,
      weak_steps: item.learning_tags.weak_steps
    },
    source: {
      name: '数量关系600题',
      processing_stage: fullyVisuallyAudited
        ? 'approved_seed_from_full_visual_audit'
        : 'approved_seed_from_ocr_high_confidence',
      verified_repair: item.source.verified_repair || null
    }
  };
});

const byDecision = {};
const byTopic = {};
const byAnswerAuditTier = {};
const byAnswerSource = {};
for (const item of publicItems) {
  byDecision[item.tags.exam_decision] = (byDecision[item.tags.exam_decision] || 0) + 1;
  byTopic[item.tags.primary_topic] = (byTopic[item.tags.primary_topic] || 0) + 1;
  byAnswerAuditTier[item.tags.answer_audit_tier] = (byAnswerAuditTier[item.tags.answer_audit_tier] || 0) + 1;
  byAnswerSource[item.tags.answer_source] = (byAnswerSource[item.tags.answer_source] || 0) + 1;
}

const answerRecheckItems = publicItems
  .filter(item => item.tags.answer_requires_original_recheck)
  .map(item => ({
    id: item.id,
    set_no: item.set_no,
    question_no: item.question_no,
    answer: item.answer,
    answer_source: item.tags.answer_source,
    primary_topic: item.tags.primary_topic
  }));

const summary = {
  status: publicItems.every(item => item.tags.answer_source === 'full_visual_set_audit')
    ? 'approved_seed_full_visual_set_audit'
    : 'approved_seed_high_confidence_only',
  total: publicItems.length,
  excluded: questions.length - publicItems.length,
  by_decision: byDecision,
  by_answer_audit_tier: byAnswerAuditTier,
  answer_recheck_recommended: answerRecheckItems.length,
  answer_source_distribution: byAnswerSource,
  top_topics: Object.entries(byTopic)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([topic, count]) => ({ topic, count })),
  gate: [
    'review_status=candidate_ok',
    'answer exists',
    'options are continuous A-D, or A-H only when fully visually audited',
    'primary_topic clean',
    'stem/options clean',
    'answer_confidence=high',
    'not image_dependent_question unless audited question_figure_crop media exists'
  ],
  answer_policy: [
    'manual_or_original_page_verified is safest for production release.',
    'strict_reasoning_derived is structurally clean but still benefits from source-page spot checks.',
    'ocr_evidence_audited passed current evidence gates but should be rechecked against original analysis pages before high-stakes public launch.'
  ]
};

const auditReport = [
  '# Approved Seed Answer Audit',
  '',
  `- Total approved: ${publicItems.length}`,
  `- Manual/original-page verified: ${byAnswerAuditTier.manual_or_original_page_verified || 0}`,
  `- Strict reasoning derived: ${byAnswerAuditTier.strict_reasoning_derived || 0}`,
  `- OCR-evidence audited, original-page recheck recommended: ${byAnswerAuditTier.ocr_evidence_audited || 0}`,
  `- Unknown answer source: ${byAnswerAuditTier.unknown_answer_source || 0}`,
  '',
  '## Policy',
  '',
  '- For a production launch, prefer `manual_or_original_page_verified` first.',
  '- `ocr_evidence_audited` items are not dirty OCR, but their final answer still originated from OCR evidence; run original analysis-page recheck before treating them as zero-risk.',
  '- Do not describe total approved count as fully human-verified.',
  '',
  '## OCR-Evidence Recheck Samples',
  '',
  ...answerRecheckItems.slice(0, 80).map(item => `- ${item.id}: answer ${item.answer}, source ${item.answer_source}, topic ${item.primary_topic}`)
].join('\n');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'questions.json'), `${JSON.stringify(publicItems, null, 2)}\n`);
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(join(outDir, 'answer_audit_report.json'), `${JSON.stringify({ summary, answer_recheck_items: answerRecheckItems }, null, 2)}\n`);
writeFileSync(join(outDir, 'answer_audit_report.md'), `${auditReport}\n`);
console.log(JSON.stringify(summary, null, 2));
