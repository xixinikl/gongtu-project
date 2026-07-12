#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const rawDir = join(root, 'output', 'quantity-bank', 'raw_sets');
const outDir = join(root, 'output', 'quantity-bank', 'clean_candidates');
const verifiedRepairFile = join(root, 'data', 'quantity_bank', 'verified_repairs.json');
const CANONICAL_BROAD_TOPICS = new Set([
  '方阵问题', '植树问题', '容斥问题', '和差倍比问题', '日期星期问题',
  '工程问题', '行程问题', '经济利润问题', '概率问题', '排列组合问题',
  '浓度问题', '几何问题', '不定方程问题', '年龄问题', '最值问题',
  '比赛问题', '数列问题', '统筹规划问题', '余数倍数问题', '牛吃草问题',
  '周期循环问题', '整除问题'
]);

const TOPIC_METHOD_HINTS = [
  ['赋值法', '赋值法'],
  ['方程', '方程法'],
  ['代入', '代入排除'],
  ['枚举', '枚举法'],
  ['十字', '十字交叉'],
  ['最小公倍数', '设总量'],
  ['总量', '设总量'],
  ['余数', '余数法'],
  ['倍数', '倍数特性'],
  ['排列', '排列组合'],
  ['组合', '排列组合'],
  ['概率', '概率分析'],
  ['容斥', '容斥原理'],
  ['几何', '几何建模'],
  ['行程', '行程公式'],
  ['工程', '工程效率'],
  ['利润', '利润公式'],
  ['浓度', '浓度公式']
];

const KNOWN_IMAGE_DEPENDENT_IDS = new Set([
  'quantity_hs13_set15_q10',
  'quantity_hs13_set25_q03',
  'quantity_hs13_set28_q04',
  'quantity_hs13_set35_q09',
  'quantity_hs13_set44_q09',
  'quantity_hs13_set45_q06',
  'quantity_hs13_set49_q08',
  'quantity_hs13_set56_q08',
  'quantity_hs13_set60_q09'
]);

function readVerifiedRepairs() {
  try {
    const payload = JSON.parse(readFileSync(verifiedRepairFile, 'utf8'));
    const merged = new Map();
    for (const item of payload.repairs || []) {
      const previous = merged.get(item.id);
      if (!previous) {
        merged.set(item.id, {
          ...item,
          source: {
            ...(item.source || {}),
            types: [item.source?.type || 'verified_repair']
          },
          fields: { ...(item.fields || {}) }
        });
        continue;
      }
      const previousTypes = previous.source?.types || [previous.source?.type || 'verified_repair'];
      const nextType = item.source?.type || 'verified_repair';
      merged.set(item.id, {
        ...previous,
        source: {
          ...previous.source,
          ...(item.source || {}),
          type: choosePrimaryRepairType([...previousTypes, nextType]),
          types: [...previousTypes, nextType],
          question_pages: [
            ...(previous.source?.question_pages || []),
            ...(item.source?.question_pages || [])
          ],
          analysis_pages: [
            ...(previous.source?.analysis_pages || []),
            ...(item.source?.analysis_pages || [])
          ]
        },
        fields: {
          ...(previous.fields || {}),
          ...(item.fields || {})
        }
      });
    }
    return merged;
  } catch {
    return new Map();
  }
}

const verifiedRepairs = readVerifiedRepairs();

function choosePrimaryRepairType(types) {
  const priority = [
    'full_visual_set_audit',
    'manual_visual_original_page_recovery',
    'original_question_page_visual_review',
    'manual_original_page_recovery',
    'manual_analysis_page_recovery',
    'manual_analysis_page_answer_correction',
    'verified_original_page'
  ];
  return priority.find(type => types.includes(type)) || types.at(-1) || 'verified_repair';
}

function normalizeText(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[：]/g, ':')
    .replace(/[；]/g, ';')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[【\[]\s*是型分类/g, '【题型分类')
    .replace(/[【\[]\s*着型分类/g, '【题型分类')
    .replace(/[【\[]\s*是别分类/g, '【题型分类')
    .replace(/[【\[]\s*题型分类/g, '【题型分类')
    .replace(/[【\[]\s*参考答案/g, '【参考答案')
    .replace(/[lI][L1]\./g, '1.')
    .replace(/^\s*[lI][L1]\s*[\.:]/gm, '1.')
    .replace(/^\s*C[cC][\.,]/gm, 'C.')
    .replace(/^\s*AL\s+/gm, 'A. ')
    .replace(/\n{3,}/g, '\n\n');
}

function questionMarker(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(10|[1-9]|[lI][L1])(?:[\s\.:、,]|一)/);
  if (!match) return null;
  const raw = match[1].replace(/[lI][L1]/, '1');
  const value = Number(raw);
  return value >= 1 && value <= 10 ? value : null;
}

function splitNumberedBlocks(text) {
  const lines = normalizeText(text).split('\n');
  const blocks = new Map();
  let current = null;
  for (const line of lines) {
    const marker = questionMarker(line);
    if (marker) current = marker;
    if (!current) continue;
    if (!blocks.has(current)) blocks.set(current, []);
    blocks.get(current).push(line);
  }
  return blocks;
}

function trimNoise(blockText) {
  return blockText
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
    .trim();
}

function cleanOptionValue(value) {
  return value
    .replace(/^[A-Da-d][\.,、,，]\s*/, '')
    .replace(/^[|｜]\s*/, '')
    .replace(/\s*[|｜]$/g, '')
    .replace(/\$[Ff]\b/g, '份')
    .replace(/\bWh(?=\s*\d+\s*元)/g, '满')
    .replace(/(\d),\s*(\d{1,2})%/g, '$1.$2%')
    .replace(/\s+\.$/g, '')
    .trim();
}

function hasSuspiciousLatin(text) {
  const compact = (text || '').replace(/\s/g, '');
  if (/^[A-Z]\d{1,3}$/i.test(compact)) return false;
  if (/^[A-D](?:[><][A-D]){2,3}$/.test(compact)) return false;
  if (/^[xX](?:[+-]\d+)?$/.test(compact)) return false;
  if (/^\d*[xX](?:[+-]\d+)?$/.test(compact)) return false;
  if (/^\d+(?:\.\d+)?[xX][+-]\d+$/.test(compact)) return false;
  if (/^[xX][不没]?(?:大于|小于|高于|低于|超过|少于|多于)[yY]$/.test(compact)) return false;
  const allowedRemoved = (text || '')
    .replace(/[A-D]{1,4}(?=\s*(?:间|地|点|端|码头|方案|商品|产品|零件|班级|号|线|内|外|的|中|和|、|,|，))/g, '')
    .replace(/\b[xX]\b/g, '');
  return /[A-Za-z@|$]/.test(allowedRemoved);
}

function extractOptions(text) {
  const optionText = {};
  const lines = normalizeText(text).split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const markers = [...trimmed.matchAll(/(^|\s|[0-9]|["'“”‘’])([A-Da-d])(?:[\.,、,，L]|T)?\s*/g)];
    if (!markers.length) continue;
    if (markers.length < 2 && !/^[A-Da-d](?:[\.,、,，L]|T)?\s*/.test(trimmed)) continue;

    for (let i = 0; i < markers.length; i += 1) {
      const key = markers[i][2].toUpperCase();
      const start = markers[i].index + markers[i][0].length;
      const end = i + 1 < markers.length ? markers[i + 1].index : trimmed.length;
      const value = trimmed
        .slice(start, end)
        .replace(/^[:：\.,，、\s]+/, '')
        .replace(/[”"']+$/g, '')
        .trim();
      const cleanedValue = cleanOptionValue(value);
      if (cleanedValue && cleanedValue.length <= 80 && !optionText[key]) optionText[key] = cleanedValue;
    }
  }

  return Object.entries(optionText).map(([key, value]) => ({ key, text: value }));
}

function extractOptionsFromAnalysisHeader(text) {
  const header = normalizeText(text)
    .split(/【参考答案|参考答案|【题型分类|题型分类|【实战解析|实战解析/)[0] || '';
  const options = extractOptions(header);
  if (options.length !== 4) return [];
  if (options.some(isSuspiciousOption)) return [];
  return options;
}

function extractAnalysisHeader(text) {
  return trimNoise(normalizeText(text)
    .split(/【参考答案|参考答案|【题型分类|题型分类|【实战解析|实战解析/)[0] || '');
}

function mergeOptions(primaryOptions, fallbackOptions) {
  if (primaryOptions.length >= 4 && !primaryOptions.some(isSuspiciousOption)) {
    return primaryOptions;
  }
  if (fallbackOptions.length !== 4) return primaryOptions;

  const primaryByKey = new Map(primaryOptions.map(option => [option.key, option]));
  const fallbackByKey = new Map(fallbackOptions.map(option => [option.key, option]));
  const merged = [];
  for (const key of ['A', 'B', 'C', 'D']) {
    const primary = primaryByKey.get(key);
    const fallback = fallbackByKey.get(key);
    if (primary && !isSuspiciousOption(primary)) {
      merged.push(primary);
    } else if (fallback) {
      merged.push(fallback);
    }
  }
  return merged.length === 4 ? merged : primaryOptions;
}

function extractStemOnly(text) {
  const normalized = normalizeText(text).replace(/\s+/g, ' ').trim();
  const optionStart = normalized.search(/\sA(?:[\.,、,，L]|T)?\s*[:：]?/);
  if (optionStart > 20) return normalized.slice(0, optionStart).trim();
  return normalized;
}

function chooseAnalysisHeaderStem(questionStem, analysisHeaderText) {
  const headerStem = extractStemOnly(analysisHeaderText);
  if (!headerStem) return null;
  const questionLength = questionStem.replace(/\s/g, '').length;
  const headerLength = headerStem.replace(/\s/g, '').length;
  if (headerLength < 40) return null;
  if (!isSuspiciousStem(questionStem) && questionLength >= 40) return null;
  if (isSuspiciousStem(headerStem)) return null;
  if (hasHighRiskChineseOcrNoise(headerStem)) return null;
  if (/参考答案|题型分类|实战解析|难度评价/.test(headerStem)) return null;
  if (headerLength < Math.max(40, questionLength * 0.75)) return null;
  if (textSimilarity(questionStem, headerStem) < 0.55) return null;
  return headerStem;
}

function hasHighRiskChineseOcrNoise(text) {
  const value = text || '';
  if ((value.match(/问/g) || []).length > 1) return true;
  return /草攻|收刘|收审|收制|两四人|丙带的饥|2了%|A型\s*46|B型\s*56|销售笑比|光业技术|审核部门时、乙|本全本|一哥|音理档案|增面|南面粉刷|两地在甲|超市撒了|沼着影子|e、了六门|增加3\s*,|工作,直至任务全部完成|多爸|行程同题|相过问题|相过\.|两地相遇|勾速|与两相遇|则两\s*每分钟/.test(value);
}

function extractAnswer(text) {
  const normalized = normalizeText(text);
  const beforeTopic = normalized.split(/【题型分类|题型分类|【实战解析|实战解析/)[0] || normalized;
  const patterns = [
    [/【?参考答案[】\]〗\s]*(?:[0O人入八〗(（\s]{0,4})([A-D])/, 'reference_answer_ocr_prefix'],
    [/【?参考答素[】\]〗\s]*(?:[0O人入八〗(（\s]{0,4})([A-D])/, 'reference_answer_ocr_prefix'],
    [/【参考答案[】\]\s]*([A-D])/, 'reference_answer'],
    [/【参考答案[】\]\s]*[\(（]\s*([A-D])/, 'reference_answer_parenthesized'],
    [/参考答案[】\]\s]*([A-D])/, 'reference_answer'],
    [/参考答案[】\]\s]*[\(（]\s*([A-D])/, 'reference_answer_parenthesized'],
    [/参考答[^\n】\]]{0,6}[】\]\s]*([A-D])/, 'reference_answer_ocr_variant'],
    [/答案为\s*([A-D])\s*选项/, 'answer_sentence'],
    [/答案为\s*([A-D])/, 'answer_sentence'],
    [/([A-D])\s*选项/, 'answer_sentence']
  ];
  for (const [pattern, source] of patterns) {
    const match = normalized.match(pattern);
    if (match) return { value: match[1], confidence: 'high', source };
  }
  const garbledReference = extractGarbledReferenceAnswerLine(beforeTopic, normalized);
  if (garbledReference) return garbledReference;
  const dirtyPatterns = [
    /\[[^\]]{1,14}\]\s*([A-D])\b/,
    /\[[^\]\n]{1,14}\)\s*([A-D])\b/,
    /\([^\n)]{1,14}\]\s*([A-D])\b/,
    /\([^\n)]{1,14}\)\s*([A-D])\b/,
    /[\[【(（][^\n\]】)）]{0,16}([A-D])(?:[\]】)）]|\s|$)/
  ];
  for (const pattern of dirtyPatterns) {
    const match = beforeTopic.match(pattern);
    if (match) return { value: match[1], confidence: 'low', source: 'dirty_ocr_bracket' };
  }
  return { value: null, confidence: 'missing', source: 'missing' };
}

function extractGarbledReferenceAnswerLine(beforeTopic, fullText) {
  if (!/【题型分类|题型分类|【实战解析|实战解析/.test(fullText)) return null;
  const lines = beforeTopic
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.length > 60) continue;
    if (/^[A-Da-d][\.,、,，]/.test(line)) continue;
    if (!/[\[【(（\]】)）#]/.test(line)) continue;
    if (!/(参考|答案|答|[ABSKZ]\d?|[A-Z]#|HER|FER|BR|ER|FS|FR)/i.test(line)) continue;
    const upperLine = line.toUpperCase();
    const answerAtEnd = upperLine.match(/(?:参考|答案|答)[^A-D]{0,20}([A-D])\s*[\]】)）]?\s*$/)
      || upperLine.match(/[\]】)）]\s*([A-D])\s*$/)
      || upperLine.match(/\s([A-D])\s*$/);
    if (!answerAtEnd) continue;
    return {
      value: answerAtEnd[1],
      confidence: 'high',
      source: 'garbled_reference_answer_line'
    };
  }
  return null;
}

function extractTopicLabels(text) {
  const normalized = normalizeText(text);
  const labels = [];
  const patterns = [
    /【题型分类】\s*([^\n【]+)/g,
    /题型分类[】\]\s:：]*([^\n【]+)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized))) {
      const value = normalizeTopicLabel(match[1]
        .replace(/[A-Z]{2,}.*$/, '')
        .replace(/[|@].*$/, '')
        .trim());
      if (value && !labels.includes(value)) labels.push(value);
    }
  }
  return labels;
}

function normalizeTopicLabel(label) {
  const cleaned = (label || '')
    .replace(/晶期/g, '日期')
    .replace(/星期间题/g, '星期问题')
    .replace(/周期各环/g, '周期循环')
    .replace(/等关/g, '等差')
    .replace(/节什/g, '最值')
    .replace(/概毕/g, '概率')
    .replace(/年擒/g, '年龄')
    .replace(/问是/g, '问题')
    .replace(/间题/g, '问题')
    .replace(/容斤/g, '容斥')
    .replace(/行各/g, '行程')
    .replace(/流术/g, '流水')
    .replace(/久变如/g, '匀变速')
    .replace(/匀变如/g, '匀变速')
    .replace(/过及/g, '追及')
    .replace(/等半数列/g, '等差数列')
    .replace(/十(?=等差数列)/g, '+')
    .replace(/平均分扒/g, '平均分配')
    .replace(/和差信比/g, '和差倍比')
    .replace(/和差售比/g, '和差倍比')
    .replace(/统著/g, '统筹')
    .replace(/和平方数/g, '和差倍比')
    .replace(/\s*没有.*$/, '')
    .replace(/\s+二$/, '')
    .replace(/\s+人$/, '')
    .replace(/\s*即.*$/, '')
    .replace(/\s*分钟.*$/, '')
    .replace(/[^\u4e00-\u9fa5+之、/与\s]/g, '')
    .replace(/\s*\+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const baseMatch = cleaned.match(/^(工程问题|经济利润问题|和差倍比问题|行程问题|几何问题|概率问题|排列组合问题|日期星期问题|数列问题|浓度问题|植树问题|方阵问题|牛吃草问题|年龄问题|最值问题|统筹规划问题|不定方程问题|余数倍数问题|容斥问题|整除问题|周期循环问题|溶液问题)\s+[^+之与、/]/);
  return baseMatch ? baseMatch[1] : cleaned;
}

function isSuspiciousTopic(topic) {
  return !topic
    || topic.length > 24
    || /[A-Za-z]|[晶尸妇女太扒挤]|十等|问是|容斤|行各|各环|久变|匀变如|流术|等半|等关|遗失|分钟|同题|相过|即|空位|插入|成的|没有|和平方|\+\s*$|问题\s*人/.test(topic);
}

function isSuspiciousStem(stem) {
  const text = stem || '';
  const withoutMathLabels = text
    .replace(/\b[A-D]{2,4}\b/g, '')
    .replace(/\b[A-D](?=校|地|点|船|车|组|端|线路|路线)/g, '')
    .replace(/(?<=从 |从)[A-D](?= 校|校|地|点)/g, '');
  return /[A-Za-z]{2,}|[@|]/.test(withoutMathLabels);
}

function isSuspiciousOption(option) {
  const text = option?.text?.trim() || '';
  if (/^n(?:\s*\/\s*[234])?$/.test(text)) return false;
  return !option?.text
    || /^[A-D]$/.test(text)
    || /#/.test(option.text)
    || hasSuspiciousLatin(option.text);
}

function extractDifficulty(text) {
  const normalized = normalizeText(text);
  const stars = normalized.match(/难度评价[^\n]*([★☆妇女太]{1,8})/);
  if (stars) return stars[1].replace(/[妇女太]/g, '★');
  return null;
}

function methodsForTopic(topic) {
  const broad = broadTopic(topic);
  if (broad === '工程问题') return ['工程效率', '设总量'];
  if (broad === '和差倍比问题') return ['赋值法', '方程法'];
  if (broad === '行程问题') return ['行程公式', '画线段'];
  if (broad === '经济利润问题') return ['利润公式', '方程法'];
  if (broad === '排列组合问题') return ['分类分步', '插空法'];
  if (broad === '概率问题') return ['概率分析', '分类讨论'];
  if (broad === '几何问题') return ['几何建模', '公式计算'];
  if (broad === '日期星期问题' || broad === '周期循环问题') return ['周期推算'];
  if (broad === '最值问题') return ['极限构造'];
  if (broad === '不定方程问题') return ['方程法', '代入排除'];
  if (broad === '余数倍数问题' || broad === '整除问题') return ['倍数特性', '余数法'];
  if (broad === '容斥问题') return ['容斥原理'];
  if (broad === '浓度问题' || broad === '溶液问题') return ['浓度公式', '方程法'];
  if (broad === '植树问题') return ['间隔模型'];
  if (broad === '方阵问题') return ['方阵公式'];
  if (broad === '年龄问题') return ['年龄差', '方程法'];
  if (broad === '牛吃草问题') return ['牛吃草模型'];
  if (broad === '统筹规划问题') return ['列表规划', '枚举法'];
  if (broad === '比赛问题') return ['比赛积分'];
  return ['常规建模'];
}

function inferMethods(text, topics, primaryTopic) {
  const allowed = methodsForTopic(primaryTopic);
  const haystack = `${text}\n${topics.join('\n')}`;
  const hinted = [];
  for (const [needle, method] of TOPIC_METHOD_HINTS) {
    if (haystack.includes(needle) && allowed.includes(method) && !hinted.includes(method)) hinted.push(method);
  }
  for (const method of allowed) {
    if (!hinted.includes(method)) hinted.push(method);
  }
  return hinted.slice(0, 3);
}

function inferTopicFromQuestionStem(questionText) {
  const stem = questionText || '';
  if (/水库|水闸|降雨|警戒水位/.test(stem)) return '牛吃草问题';
  if (/共同完成.*工程|工程.*完成|效率|合作.*完成|单独完成|拼图|生产线|修路|制作.*工艺品/.test(stem)) return '工程问题';
  if (/年龄|岁|年长者|最年长/.test(stem) && /等差数列|年龄总和|年龄恰好成等差/.test(stem)) return '年龄问题';
  if (/门店.*选择|至少选择|不同的选择方式|不同的派法|安排方式|分配方法/.test(stem)) return '排列组合问题';
  if (/星期|周[一二三四五六日]/.test(stem) && /连续|包含|不包含|优惠/.test(stem)) return '日期星期问题';
  if (/促销|优惠|价格|定价|成本|利润|售价|销售额|停车费|门票|运价|托运|支付/.test(stem)) return '经济利润问题';
  if (/后一排比前一排多|等差数列|站成.*排/.test(stem)) return '数列问题';
  if (/编号.*倍数|奖券.*倍数|兑换.*奖品|倍数的奖券/.test(stem)) return '余数倍数问题';
  if (/植树|相邻点位|预设点位/.test(stem)) return '植树问题';
  if (/随机分配|概率|分配在一组/.test(stem)) return '概率问题';
  if (/浓度|溶液|混合后浓度/.test(stem)) return '浓度问题';
  return null;
}

function inferTopicFromText(questionText, analysisText, topics) {
  const haystack = `${questionText}\n${analysisText}`;
  const stemTopic = inferTopicFromQuestionStem(questionText);
  if (stemTopic) return stemTopic;
  const cleanTopics = topics
    .filter(topic => !isSuspiciousTopic(topic))
    .map(normalizeTopicLabel)
    .filter(topic => !isSuspiciousTopic(topic));
  if (cleanTopics[0]) return cleanTopics[0];
  if (/社团|选修|报名|订阅|体检项目|至少参加|至少选|都参加|既.*又/.test(haystack)) return '容斥问题';
  if (/起飞方式|相邻|不相邻|分配方法|不同的拿法|安排方式|选法|任选|随机预测|至少猜对/.test(haystack)) return '排列组合问题';
  if (/球衣号码|后一排比前一排多|等差|数列/.test(haystack)) return '数列问题';
  if (/比赛.*积分.*最多|最多可能比/.test(haystack)) return '最值问题';
  if (/工号|编号|倍数|整除|连乘之积|空啤酒瓶|换.*啤酒/.test(haystack)) return '余数倍数问题';
  if (/教材.*其余|其余三种|人数之比|比例|赋值/.test(haystack)) return '和差倍比问题';
  if (/预算|利润|收入|销售|盈利|亏损|成本|售价|价格|电脑|投影机/.test(haystack)) return '经济利润问题';
  if (/水库|水闸|草场|牛吃草/.test(haystack)) return '牛吃草问题';
  if (/男女|人数之比|比例|赋值/.test(haystack)) return '和差倍比问题';
  if (/工程|效率|完结|合作|单独|拼图|完成同一幅|工作效率|单独进行/.test(haystack)) return '工程问题';
  if (/相遇|追及|速度|行程|匀速|加速/.test(haystack)) return '行程问题';
  if (/概率/.test(haystack)) return '概率问题';
  if (/排列|组合|选法|方法有多少种/.test(haystack)) return '排列组合问题';
  if (/利润|售价|进价|折扣|获利/.test(haystack)) return '经济利润问题';
  if (/浓度|盐水|溶液|混合/.test(haystack)) return '浓度问题';
  if (/余数|整除|倍数/.test(haystack)) return '余数倍数问题';
  if (/植树|间隔/.test(haystack)) return '植树问题';
  if (/方阵|空心方阵|实心方阵/.test(haystack)) return '方阵问题';
  if (/几何|面积|梯形|正方形|三角形|圆/.test(haystack)) return '几何问题';
  return null;
}

function inferStrongTopicSignals(questionText, analysisText) {
  const haystack = `${questionText}\n${analysisText}`;
  const signals = [];
  const rules = [
    ['方阵问题', /方阵|空心方阵|实心方阵/],
    ['植树问题', /植树|栽种|间距|相邻.*树|预设点位/],
    ['容斥问题', /容斥|至少参加|都参加|会骑|会打|四项运动|选择了甲|选择了乙|选择了丙|均为优|两年.*优秀/],
    ['和差倍比问题', /比.*多|比.*少|倍|比例|之比|平均分|总和|差为/],
    ['日期星期问题', /星期|周一|周二|周三|周四|周五|周六|周日|月份|日期|几月|日是周/],
    ['周期循环问题', /周期|循环|交替|轮流|轮替|第一天.*第二天|怀表|显示标准时间/],
    ['工程问题', /工程|效率|完工|合作|单独完成|生产线|工作总量|工作量|加工|零件|任务|拼图|完成同一幅|工作效率|单独进行/],
    ['行程问题', /相遇|追及|速度|行程|匀速|顺流|逆流|港口|跑道|出发|到达/],
    ['经济利润问题', /利润|售价|进价|折扣|盈利|亏损|成本|单价|销售|批发/],
    ['概率问题', /概率|随机|至少|至多|任选|抽取|命中率/],
    ['排列组合问题', /排列|组合|选法|分配方法|多少种|安排方案/],
    ['浓度问题', /浓度|溶液|混合|盐水|质量分数/],
    ['几何问题', /面积|三角形|正方形|长方形|正方体|小正方体|圆|半径|直径|扇形|几何|如图|下图/],
    ['不定方程问题', /不定方程|整数解|正整数|方程组/],
    ['容斥问题', /容斥|至少参加|都参加|会骑|会打|四项运动/],
    ['年龄问题', /年龄|岁|爷爷|孙子/],
    ['比赛问题', /比赛|选手|棋迷|得分|积分/],
    ['最值问题', /最多|最少|至少|至多|最大|最小/]
  ];
  for (const [topic, pattern] of rules) {
    if (pattern.test(haystack)) signals.push(topic);
  }
  return signals;
}

function broadTopic(topic) {
  if (!topic) return '';
  for (const prefix of [
    '方阵问题',
    '植树问题',
    '容斥问题',
    '和差倍比问题',
    '日期星期问题',
    '工程问题',
    '行程问题',
    '经济利润问题',
    '概率问题',
    '排列组合问题',
    '浓度问题',
    '几何问题',
    '不定方程问题',
    '容斥问题',
    '年龄问题',
    '最值问题',
    '比赛问题',
    '数列问题',
    '统筹规划问题',
    '余数倍数问题',
    '牛吃草问题',
    '周期循环问题',
    '整除问题',
    '溶液问题'
  ]) {
    if (topic.includes(prefix.replace('问题', '')) || topic.includes(prefix)) return prefix;
  }
  if (topic.includes('溶液')) return '浓度问题';
  return topic;
}

function chineseChars(text) {
  return [...(text || '').replace(/[^\u4e00-\u9fa5]/g, '')];
}

function textSimilarity(left, right) {
  const leftSet = new Set(chineseChars(left).filter(char => !'的一是在和有为多少问则已知如果其中'.includes(char)));
  const rightSet = new Set(chineseChars(right).filter(char => !'的一是在和有为多少问则已知如果其中'.includes(char)));
  if (leftSet.size < 12 || rightSet.size < 12) return 1;
  let overlap = 0;
  for (const char of leftSet) {
    if (rightSet.has(char)) overlap += 1;
  }
  return overlap / Math.min(leftSet.size, rightSet.size);
}

function hasAnalysisStemMismatch(questionText, analysisText) {
  const stem = (questionText || '').slice(0, 220);
  const analysisHead = ((analysisText || '').split(/【参考答案|参考答案|【题型分类|题型分类|【实战解析|实战解析/)[0] || '').slice(0, 260);
  if (stem.replace(/\s/g, '').length < 45 || analysisHead.replace(/\s/g, '').length < 45) return false;
  return textSimilarity(stem, analysisHead) < 0.42;
}

function selectAnalysisBlock(questionBlock, analysisBlocks, preferredQuestionNo) {
  const questionStem = extractStemOnly(trimNoise(questionBlock || ''));
  const currentText = (analysisBlocks.get(preferredQuestionNo) || []).join('\n');
  const currentAnalysis = trimNoise(currentText);
  if (!hasAnalysisStemMismatch(questionStem, currentAnalysis)) {
    return {
      text: currentText,
      rematched_from_question_no: null,
      rematch_score: null
    };
  }

  const scored = [];
  for (let questionNo = 1; questionNo <= 10; questionNo += 1) {
    const candidateText = (analysisBlocks.get(questionNo) || []).join('\n');
    if (!candidateText.trim()) continue;
    const candidateAnalysis = trimNoise(candidateText);
    const candidateHead = (candidateAnalysis.split(/【参考答案|参考答案|【题型分类|题型分类|【实战解析|实战解析/)[0] || '').slice(0, 280);
    if (candidateHead.replace(/\s/g, '').length < 45) continue;
    scored.push({
      questionNo,
      text: candidateText,
      score: textSimilarity(questionStem, candidateHead)
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const currentScore = scored.find(item => item.questionNo === preferredQuestionNo)?.score || 0;
  if (best && best.questionNo !== preferredQuestionNo && best.score >= 0.54 && best.score - currentScore >= 0.14) {
    return {
      text: best.text,
      rematched_from_question_no: best.questionNo,
      rematch_score: Number(best.score.toFixed(3))
    };
  }
  return {
    text: currentText,
    rematched_from_question_no: null,
    rematch_score: Number(currentScore.toFixed(3))
  };
}

function hasTopicConflict(questionText, analysisText, primaryTopic) {
  if (!primaryTopic) return false;
  const primary = broadTopic(primaryTopic);
  const question = questionText || '';
  if (primary === '行程问题' && /步长|脚印|圆形鱼塘|一圈/.test(question)) return false;
  if (primary === '行程问题' && /拼图|完成同一幅/.test(question)) return true;
  if (primary === '统筹规划问题' && /原油|苯乙烯|废气|提炼/.test(question) && /至少|不超过|最低费用/.test(question)) return false;
  const signals = inferStrongTopicSignals(questionText, analysisText);
  if (!signals.length) return false;
  if (signals.includes(primary)) return false;
  const conflictSignals = signals.filter(signal => {
    if (signal === '最值问题') return false;
    if (primary === '最值问题') return false;
    if (primary === '统筹规划问题' && /大货车|小货车|驾驶员|派车|装载率/.test(question)) return false;
    if (primary === '统筹规划问题' && ['工程问题', '经济利润问题'].includes(signal)) return false;
    if (primary === '统筹规划问题' && ['最值问题', '概率问题'].includes(signal) && /原油|苯乙烯|废气|提炼/.test(question) && /至少|不超过|最低费用/.test(question)) return false;
    if (primary === '统筹规划问题' && signal === '和差倍比问题' && /大货车|小货车|驾驶员|派车|装载率/.test(question)) return false;
    if (primary === '统筹规划问题' && signal === '排列组合问题' && /大货车|小货车|驾驶员|派车|装载率/.test(question)) return false;
    if (primary === '经济利润问题' && signal === '和差倍比问题') return false;
    if (primary === '统筹规划问题' && signal === '行程问题' && /运价|运费|运输任务|运送|运往|工厂|吨/.test(question)) return false;
    if (primary === '统筹规划问题' && signal === '行程问题' && /电梯|楼梯|最节约时间|办公楼/.test(question)) return false;
    if (primary === '牛吃草问题' && ['和差倍比问题', '行程问题', '概率问题'].includes(signal) && /水库|水闸|降雨|警戒水位|泳池|进水口|出水口|排水口/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '和差倍比问题' && /奖券|编号.*倍数|数字倍数编号|该数字倍数|兑换.*奖品/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '容斥问题' && /编号.*倍数|标签号|重复领奖|玫瑰/.test(question)) return false;
    if (primary === '容斥问题' && signal === '余数倍数问题' && /编号.*倍数|标签号|重复领奖|玫瑰/.test(question)) return false;
    if (primary === '容斥问题' && signal === '和差倍比问题' && /编号.*倍数|标签号|重复领奖|玫瑰|领 \d+ 枝/.test(question)) return false;
    if (primary === '容斥问题' && signal === '和差倍比问题' && /投票|赞成.*反对|方案/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '和差倍比问题' && /编号.*奇数|奇数.*拿掉|重新.*编号|每箱.*整数箱|整数箱/.test(question)) return false;
    if (primary === '余数倍数问题' && ['工程问题', '数列问题', '最值问题'].includes(signal) && /每\s*\d+\s*个装一箱|整数箱|前 X 天|第 1 天生产|每天都比前一天多/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '工程问题' && /编号.*奇数|奇数.*拿掉|重新.*编号|2 因子|2因子/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '方阵问题' && /倍数编号|该数字倍数|向后转|面向自己|喊了数字|方阵训练.*倍数|数字后.*倍数/.test(question)) return false;
    if (primary === '整除问题' && ['和差倍比问题', '概率问题'].includes(signal) && /篮球比赛|篮球赛|球衣号码|命中率|最终得分|罚球/.test(question)) return false;
    if (primary === '整除问题' && signal === '比赛问题' && /球衣号码|号码之和|最大和是最小和/.test(question)) return false;
    if (primary === '牛吃草问题' && signal === '工程问题') return false;
    if (primary === '钟表问题' && signal === '行程问题' && /钟|显示时间|北京时间|上班|下班/.test(question)) return false;
    if (primary === '余数倍数问题' && signal === '排列组合问题') return false;
    if (primary === '余数倍数问题' && signal === '数列问题' && /编号.*奇数|奇数.*拿掉|重新.*编号|2 因子|2因子/.test(question)) return false;
    if (primary === '数列问题' && signal === '最值问题') return false;
    if (primary === '数列问题' && signal === '余数倍数问题' && /编号.*奇数|奇数.*拿掉|重新.*编号|2 因子|2因子/.test(question)) return false;
    if (primary === '数列问题' && signal === '和差倍比问题' && /后一排比前一排多|公差|等差数列|每行比前一行/.test(question)) return false;
    if (primary === '数列问题' && signal === '和差倍比问题' && /斐波那契|第 n 个数|第 n-1 个数|第 n\+1 个数|递推/.test(question)) return false;
    if (primary === '数列问题' && signal === '和差倍比问题' && /营业额|五年规划|十二五|十三五|十四五|每年的营业额增量/.test(question)) return false;
    if (primary === '数列问题' && signal === '和差倍比问题' && /每个?月.*比上个?月|第一季度|全年.*销量|等差数列/.test(`${question}\n${analysisText || ''}`)) return false;
    if (primary === '数列问题' && signal === '经济利润问题' && /每个?月.*销量|第一季度.*销量|全年.*销量|等差数列/.test(`${question}\n${analysisText || ''}`)) return false;
    if (primary === '数列问题' && signal === '工程问题' && /每个?月.*销量|第一季度.*销量|全年.*销量|等差数列/.test(`${question}\n${analysisText || ''}`)) return false;
    if (primary === '植树问题' && ['工程问题', '最值问题'].includes(signal) && /木桩|栅栏|顶点|每两根.*距离|间距/.test(question)) return false;
    if (primary === '年龄问题' && ['数列问题', '和差倍比问题'].includes(signal)) return false;
    if (primary === '几何问题' && signal === '概率问题') return false;
    if (primary === '几何问题' && signal === '行程问题' && /正东方|正北方|距离分别为|中点位置|千米处/.test(question)) return false;
    if (primary === '行程问题' && signal === '几何问题' && /步长|脚印|周长|圆形.*一圈/.test(question)) return false;
    if (primary === '概率问题' && signal === '排列组合问题') return false;
    if (primary === '排列组合问题' && signal === '概率问题') return false;
    if (primary === '排列组合问题' && signal === '工程问题' && /相同的.*件产品|每个人至少分到|完成所有工作所需时长/.test(question)) return false;
    if (primary === '周期循环问题' && signal === '工程问题' && /交替|轮流|轮替|第一天|第二天/.test(question)) return false;
    if (primary === '数列问题' && signal === '周期循环问题' && /第\s*\d+\s*排|周期|循环/.test(question)) return false;
    if (primary === '数列问题' && signal === '几何问题' && /正三角形.*花阵|第\s*\d+\s*排/.test(question)) return false;
    if (primary === '统筹规划问题' && signal === '概率问题' && /天平|至少需要称|称.*次|3\^/.test(`${question}\n${analysisText || ''}`)) return false;
    if (primary === '统筹规划问题' && signal === '最值问题' && /天平|至少需要称|称.*次/.test(question)) return false;
    if (primary === '工程问题' && signal === '和差倍比问题' && /容器|水龙头|注水|漏水|漏洞/.test(question)) return false;
    if (primary === '工程问题' && signal === '几何问题' && /容器|水龙头|注水|漏水|漏洞/.test(question)) return false;
    if (primary === '工程问题' && signal === '行程问题' && /容器|水龙头|注水|漏水|漏洞|流速/.test(question)) return false;
    if (primary === '和差倍比问题' && signal === '概率问题' && /至少增加|才够每个/.test(question)) return false;
    if (primary === '和差倍比问题' && signal === '经济利润问题' && /促销品.*数量|配送.*促销品|每个超市分/.test(question)) return false;
    return true;
  });
  return conflictSignals.length > 0 && !signals.includes(primary);
}

function decideExamStrategy(questionText, analysisText, topics, methods) {
  const length = questionText.replace(/\s/g, '').length;
  const joined = `${topics.join(' ')} ${methods.join(' ')}`;
  const reasons = [];
  let decision = 'can_do';
  let seconds = 100;

  if (/排列组合|概率|几何|统筹|多条件|最值/.test(joined) || length > 260) {
    decision = 'skip_first';
    seconds = 150;
    reasons.push('限制条件或建模步骤较多');
  }
  if (/工程|利润|浓度|和差倍比|余数|倍数|植树|方阵/.test(joined) && length <= 230) {
    decision = 'must_do';
    seconds = 80;
    reasons.push('模型相对明显且计算量可控');
  }
  if (/图|如图|几何/.test(questionText)) {
    decision = decision === 'must_do' ? 'can_do' : decision;
    reasons.push('含图形信息, OCR 后需要保留原图或人工复核');
  }
  if (!reasons.length) reasons.push('需要结合用户熟练度判断');
  return { decision, estimated_seconds: seconds, reasons };
}

function qualityFor(question, analysis, options, answerMeta, primaryTopic, extraIssues = []) {
  const issues = [];
  if (question.replace(/\s/g, '').length < 40) issues.push('question_too_short');
  if (options.length < 4) issues.push('options_incomplete');
  if (isSuspiciousStem(question)) issues.push('question_suspicious_ocr');
  if (options.some(isSuspiciousOption)) issues.push('option_suspicious_ocr');
  if (!analysis || analysis.replace(/\s/g, '').length < 80) issues.push('analysis_missing_or_short');
  if (!answerMeta.value) issues.push('answer_missing');
  if (answerMeta.value && answerMeta.confidence !== 'high') issues.push('answer_low_confidence');
  if (!primaryTopic) issues.push('topic_missing');
  if (isSuspiciousTopic(primaryTopic)) issues.push('topic_suspicious_ocr');
  if (hasAnalysisStemMismatch(question, analysis)) issues.push('analysis_stem_mismatch');
  if (hasTopicConflict(question, analysis, primaryTopic)) issues.push('topic_conflicts_with_stem');
  if (hasExplicitFigureDependency(question, analysis)) issues.push('image_dependent_question');
  if (hasGraphicalOptionDependency(question, analysis)) issues.push('image_dependent_question');
  for (const issue of extraIssues) {
    if (!issues.includes(issue)) issues.push(issue);
  }
  return {
    status: issues.length ? 'needs_review' : 'candidate_ok',
    issues
  };
}

function hasExplicitFigureDependency(question, analysis) {
  return /如图|如下图|下图|右图|左图|图中|图所示|示意图|下表|表格|根据下表/.test(question || '');
}

function hasGraphicalOptionDependency(question, analysis) {
  const text = question || '';
  return /函数图[像象]|坐标轴|曲线图|图像最符合|图象最符合|反映\s*x\s*与\s*y\s*关系/.test(text);
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

function hasSupportedVisualOptions(candidate) {
  const options = candidate.content.options;
  if (!Array.isArray(options) || options.length < 4 || options.length > 8) return false;
  if (options.length !== 4 && candidate.source.verified_repair?.type !== 'full_visual_set_audit') return false;
  const expectedKeys = Array.from({ length: options.length }, (_, index) => String.fromCharCode(65 + index));
  return options.every((option, index) => option?.key === expectedKeys[index] && option.text?.trim())
    && expectedKeys.includes(candidate.content.answer);
}

function canAcceptVerifiedShortQuestion(candidate) {
  const compactLength = candidate.content.stem.replace(/\s/g, '').length;
  return candidate.source.verified_repair?.type === 'original_question_page_visual_review'
    && compactLength >= 25
    && candidate.content.options.length === 4
    && candidate.content.answer
    && candidate.learning_tags.answer_confidence === 'high'
    && candidate.learning_tags.primary_topic
    && !isSuspiciousTopic(candidate.learning_tags.primary_topic)
    && !isSuspiciousStem(candidate.content.stem)
    && !candidate.content.options.some(isSuspiciousOption);
}

function canAcceptManualVisualRepair(candidate, issues) {
  const bypassable = new Set([
    'question_too_short',
    'question_suspicious_ocr',
    'option_suspicious_ocr',
    'analysis_missing_or_short',
    'analysis_stem_mismatch',
    'topic_conflicts_with_stem'
  ]);
  return candidate.source.verified_repair?.type === 'manual_visual_original_page_recovery'
    && issues.length > 0
    && issues.every(issue => bypassable.has(issue))
    && candidate.content.stem.replace(/\s/g, '').length >= 25
    && hasSupportedVisualOptions(candidate)
    && candidate.learning_tags.answer_confidence === 'high'
    && candidate.learning_tags.answer_source === 'verified_original_analysis_page'
    && candidate.learning_tags.primary_topic
    && Array.isArray(candidate.learning_tags.methods)
    && candidate.learning_tags.methods.length >= 1
    && candidate.learning_tags.methods.length <= 3
    && hasUsableQuestionMedia(candidate.content.media);
}

function canAcceptFullVisualSetAudit(candidate, issues) {
  const bypassable = new Set([
    'question_too_short',
    'question_suspicious_ocr',
    'option_suspicious_ocr',
    'analysis_stem_mismatch',
    'topic_conflicts_with_stem'
  ]);
  const source = candidate.source.verified_repair || {};
  const requiresImage = hasExplicitFigureDependency(candidate.content.stem, candidate.content.analysis)
    || hasGraphicalOptionDependency(candidate.content.stem, candidate.content.analysis);
  return source.type === 'full_visual_set_audit'
    && issues.length > 0
    && issues.every(issue => bypassable.has(issue))
    && candidate.content.stem.replace(/\s/g, '').length >= 25
    && candidate.content.options.length === 4
    && ['A', 'B', 'C', 'D'].includes(candidate.content.answer)
    && candidate.content.analysis.replace(/\s/g, '').length >= 80
    && candidate.learning_tags.primary_topic
    && Array.isArray(candidate.learning_tags.methods)
    && candidate.learning_tags.methods.length >= 1
    && (source.question_pages?.length || source.question_page)
    && (source.analysis_pages?.length || source.analysis_evidence_page)
    && (!requiresImage || hasUsableQuestionMedia(candidate.content.media));
}

function makeCandidate(setNo, questionNo, questionBlock, analysisBlock) {
  const fullQuestionText = trimNoise(questionBlock || '');
  const analysisText = trimNoise(analysisBlock || '');
  const analysisHeaderText = extractAnalysisHeader(analysisText);
  const isAnalysisOnlyQuestion = !fullQuestionText && analysisHeaderText;
  const questionSourceText = isAnalysisOnlyQuestion ? analysisHeaderText : fullQuestionText;
  let questionText = extractStemOnly(questionSourceText);
  const analysisHeaderStem = !isAnalysisOnlyQuestion ? chooseAnalysisHeaderStem(questionText, analysisHeaderText) : null;
  if (analysisHeaderStem) questionText = analysisHeaderStem;
  const options = mergeOptions(extractOptions(fullQuestionText), extractOptionsFromAnalysisHeader(analysisText));
  const answerMeta = extractAnswer(analysisText);
  const sourceTopics = extractTopicLabels(analysisText);
  const primaryTopic = inferTopicFromText(questionText, analysisText, sourceTopics);
  const secondaryTopics = [...new Set(sourceTopics.slice(1)
    .map(broadTopic)
    .filter(topic => CANONICAL_BROAD_TOPICS.has(topic))
    .filter(topic => topic !== broadTopic(primaryTopic)))];
  const methods = inferMethods(analysisText, sourceTopics, primaryTopic);
  const exam = decideExamStrategy(questionText, analysisText, [primaryTopic, ...secondaryTopics].filter(Boolean), methods);
  const candidate = {
    id: `quantity_hs13_set${String(setNo).padStart(2, '0')}_q${String(questionNo).padStart(2, '0')}`,
    set_no: setNo,
    question_no: questionNo,
    review_status: 'needs_review',
    source: {
      name: '数量关系600题',
      processing_stage: isAnalysisOnlyQuestion
        ? 'clean_candidate_from_analysis_header_missing_question_page'
        : 'clean_candidate_from_ocr',
      auto_stem_from_analysis_header: Boolean(analysisHeaderStem)
    },
    content: {
      stem: questionText,
      options,
      answer: answerMeta.value,
      analysis: analysisText,
      raw_ocr_kept: true
    },
    learning_tags: {
      primary_topic: primaryTopic,
      secondary_topics: secondaryTopics,
      source_topic_labels: sourceTopics,
      methods,
      difficulty_text: extractDifficulty(analysisText),
      answer_confidence: answerMeta.confidence,
      answer_source: answerMeta.source,
      exam_decision: exam.decision,
      estimated_seconds: exam.estimated_seconds,
      decision_reason: exam.reasons,
      weak_steps: ['题型识别', '取舍判断', '设量建模', '列式关系', '计算速度', '审题遗漏']
    },
    quality: {
      status: 'needs_review',
      issues: []
    }
  };

  applyVerifiedRepair(candidate);
  const repairedAnswerMeta = {
    value: candidate.content.answer,
    confidence: candidate.learning_tags.answer_confidence,
    source: candidate.learning_tags.answer_source
  };
  const extraIssues = [];
  if (isAnalysisOnlyQuestion && !candidate.source.verified_repair) {
    candidate.source.question_from_analysis_only = true;
    extraIssues.push('question_block_missing_needs_original_check');
  }
  if (KNOWN_IMAGE_DEPENDENT_IDS.has(candidate.id)) extraIssues.push('image_dependent_question');
  const repairedQuality = qualityFor(
    candidate.content.stem,
    candidate.content.analysis,
    candidate.content.options,
    repairedAnswerMeta,
    candidate.learning_tags.primary_topic,
    extraIssues
  );
  if (
    repairedQuality.issues.includes('image_dependent_question')
    && hasUsableQuestionMedia(candidate.content.media)
  ) {
    repairedQuality.issues = repairedQuality.issues.filter(issue => issue !== 'image_dependent_question');
    repairedQuality.status = repairedQuality.issues.length ? 'needs_review' : 'candidate_ok';
  }
  if (canAcceptManualVisualRepair(candidate, repairedQuality.issues)) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  if (canAcceptFullVisualSetAudit(candidate, repairedQuality.issues)) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  if (
    candidate.source.verified_repair?.type === 'manual_original_page_recovery'
    && repairedQuality.issues.length === 1
    && repairedQuality.issues[0] === 'question_suspicious_ocr'
  ) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  if (
    candidate.source.verified_repair?.type === 'manual_original_page_recovery'
    && repairedQuality.issues.length === 1
    && repairedQuality.issues[0] === 'topic_conflicts_with_stem'
  ) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  if (
    candidate.source.verified_repair?.type === 'manual_original_page_recovery'
    && repairedQuality.issues.length === 1
    && repairedQuality.issues[0] === 'analysis_stem_mismatch'
  ) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  if (
    repairedQuality.issues.length === 1
    && repairedQuality.issues[0] === 'question_too_short'
    && canAcceptVerifiedShortQuestion(candidate)
  ) {
    repairedQuality.issues = [];
    repairedQuality.status = 'candidate_ok';
  }
  candidate.review_status = repairedQuality.status;
  candidate.quality = repairedQuality;
  return candidate;
}

function applyVerifiedRepair(candidate) {
  const repair = verifiedRepairs.get(candidate.id);
  if (!repair) return;
  const fields = repair.fields || {};
  if (typeof fields.stem === 'string') candidate.content.stem = fields.stem;
  if (Array.isArray(fields.options)) candidate.content.options = fields.options;
  if (typeof fields.answer === 'string') {
    candidate.content.answer = fields.answer;
    candidate.learning_tags.answer_confidence = 'high';
    candidate.learning_tags.answer_source = fields.answer_source || 'verified_original_page';
  }
  if (typeof fields.analysis === 'string') candidate.content.analysis = fields.analysis;
  if (Array.isArray(fields.media)) candidate.content.media = fields.media;
  if (typeof fields.primary_topic === 'string') candidate.learning_tags.primary_topic = normalizeTopicLabel(fields.primary_topic);
  if (Array.isArray(fields.secondary_topics)) candidate.learning_tags.secondary_topics = fields.secondary_topics.map(normalizeTopicLabel);
  if (Array.isArray(fields.methods)) candidate.learning_tags.methods = fields.methods;
  candidate.source.verified_repair = {
    type: repair.source?.type || 'verified_repair',
    question_pages: repair.source?.question_pages || [],
    analysis_pages: repair.source?.analysis_pages || [],
    question_page: repair.source?.question_page || null,
    analysis_evidence_page: repair.source?.analysis_evidence_page || null,
    answer_audit_file: repair.source?.answer_audit_file || null,
    stem_anchor: repair.source?.stem_anchor || null,
    hold_reason: repair.source?.hold_reason || null,
    visual_audit_original: repair.source?.visual_audit_original || null
  };
}

mkdirSync(outDir, { recursive: true });

const setSummaries = [];
const allQuestions = [];

for (let setNo = 1; setNo <= 60; setNo += 1) {
  const raw = JSON.parse(readFileSync(join(rawDir, `set_${String(setNo).padStart(2, '0')}.json`), 'utf8'));
  const questionBlocks = splitNumberedBlocks(raw.raw_text.questions);
  const analysisBlocks = splitNumberedBlocks(raw.raw_text.analysis);
  const questions = [];
  for (let questionNo = 1; questionNo <= 10; questionNo += 1) {
    const questionBlock = (questionBlocks.get(questionNo) || []).join('\n');
    const selectedAnalysis = selectAnalysisBlock(questionBlock, analysisBlocks, questionNo);
    const candidate = makeCandidate(setNo, questionNo, questionBlock, selectedAnalysis.text);
    if (selectedAnalysis.rematched_from_question_no && !candidate.source.verified_repair) {
      candidate.source.analysis_block_rematch = {
        from_question_no: selectedAnalysis.rematched_from_question_no,
        score: selectedAnalysis.rematch_score
      };
      candidate.review_status = 'needs_review';
      if (!candidate.quality.issues.includes('analysis_auto_rematched_needs_review')) {
        candidate.quality.issues.push('analysis_auto_rematched_needs_review');
      }
    }
    questions.push(candidate);
    allQuestions.push(candidate);
  }

  const setPayload = {
    set_id: `quantity_hs13_set${String(setNo).padStart(2, '0')}`,
    set_no: setNo,
    status: 'clean_candidate_needs_review',
    source_pages: {
      question_pages: raw.question_pages,
      analysis_pages: raw.analysis_pages
    },
    questions
  };
  writeFileSync(join(outDir, `set_${String(setNo).padStart(2, '0')}.json`), `${JSON.stringify(setPayload, null, 2)}\n`);
  setSummaries.push({
    set_no: setNo,
    questions: questions.length,
    candidate_ok: questions.filter(item => item.review_status === 'candidate_ok').length,
    needs_review: questions.filter(item => item.review_status === 'needs_review').length,
    missing_answer: questions.filter(item => !item.content.answer).length,
    missing_topic: questions.filter(item => !item.learning_tags.primary_topic).length,
    incomplete_options: questions.filter(item => item.content.options.length < 4).length
  });
}

const topicCounts = new Map();
const decisionCounts = new Map();
for (const item of allQuestions) {
  const topic = item.learning_tags.primary_topic || '未识别';
  topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  const decision = item.learning_tags.exam_decision;
  decisionCounts.set(decision, (decisionCounts.get(decision) || 0) + 1);
}

const report = {
  status: 'clean_candidates_generated_needs_human_review',
  totals: {
    sets: 60,
    questions: allQuestions.length,
    candidate_ok: allQuestions.filter(item => item.review_status === 'candidate_ok').length,
    needs_review: allQuestions.filter(item => item.review_status === 'needs_review').length,
    missing_answer: allQuestions.filter(item => !item.content.answer).length,
    missing_topic: allQuestions.filter(item => !item.learning_tags.primary_topic).length,
    incomplete_options: allQuestions.filter(item => item.content.options.length < 4).length
  },
  decision_counts: Object.fromEntries(decisionCounts),
  top_topics: [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([topic, count]) => ({ topic, count })),
  sets: setSummaries
};

writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, 'all_questions.json'), `${JSON.stringify(allQuestions, null, 2)}\n`);
console.log(JSON.stringify(report.totals, null, 2));
console.log(JSON.stringify(report.decision_counts, null, 2));
