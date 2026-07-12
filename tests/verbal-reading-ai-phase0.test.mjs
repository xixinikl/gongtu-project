import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("diagnosis schema accepts grounded output and rejects incomplete output", () => {
  const schema = JSON.parse(read("spec/verbal-reading-ai-diagnosis-v1.schema.json"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = {
    schema_version: 1,
    status: "completed",
    summary: "本套主要暴露了对策主体保留风险。",
    primary_weakness: {
      skill: "对策主体保留",
      evidence_question_ids: ["verbal_hs13_set28_q01"],
      confidence: 0.55,
      reason: "用户选择扩大到文化资源，未保留农民主体。"
    },
    mistake_patterns: [{
      label: "主体丢失",
      question_ids: ["verbal_hs13_set28_q01"],
      explanation: "选项落地时丢掉文段核心主体。"
    }],
    question_feedback: [{
      question_id: "verbal_hs13_set28_q01",
      user_answer: "C",
      correct_answer: "B",
      why_user_missed: "找到了重点，但比较选项时扩大了范围。",
      better_path: ["识别对策", "保留农民主体", "排除范围扩大项"],
      next_signal: "看到对策句时同时圈出动作和执行主体。"
    }],
    next_training: {
      focus: "对策主体保留",
      recommended_question_ids: ["verbal_hs13_set29_q01"],
      reason: "题型和主体陷阱匹配。",
      practice_instruction: "每题写出对策动作和主体后再看选项。"
    },
    limitations: ["当前只有一道直接证据，因此只判断为本套风险。"]
  };
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));
  assert.equal(validate({ schema_version: 1, status: "completed" }), false);
});

test("insufficient evidence contract cannot invent weakness or recommendations", () => {
  const schema = JSON.parse(read("spec/verbal-reading-ai-diagnosis-v1.schema.json"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const fallback = {
    schema_version: 1,
    status: "insufficient_evidence",
    summary: "无法形成可靠诊断",
    primary_weakness: null,
    mistake_patterns: [],
    question_feedback: [],
    next_training: null,
    limitations: ["缺少用户最终选择"]
  };
  assert.equal(validate(fallback), true, JSON.stringify(validate.errors));
  fallback.primary_weakness = {
    skill: "凭空弱项",
    evidence_question_ids: ["missing"],
    confidence: 1,
    reason: "无证据"
  };
  assert.equal(validate(fallback), false);
});

test("skill is versioned, reading-specific, and keeps official facts immutable", () => {
  const skill = read("backend/data/verbal-reading-skill/SKILL.md");
  assert.match(skill, /Skill version: `1\.1\.0`/);
  assert.match(skill, /禁止覆盖官方答案/);
  assert.match(skill, /推荐题只引用输入候选池中的真实题目ID/);
  assert.doesNotMatch(skill, /申论作答|飞扬老师/);
  assert.ok(fs.existsSync(path.join(root, "backend/data/verbal-reading-skill/references/methodology.md")));
  assert.ok(fs.existsSync(path.join(root, "backend/data/verbal-reading-skill/references/response-contract.md")));
});

test("current static AI surfaces are explicitly inventoried as prototype", () => {
  const html = read("verbal-reading-pilot.html");
  const contract = read("doc/VERBAL_READING_AI_CONTRACT.md");
  for (const marker of ["ai_brief_example", "getCoachDiagnosis", "getDrillBlueprint", "renderReport"]) {
    assert.ok(html.includes(marker), `page marker missing: ${marker}`);
    assert.ok(contract.includes(marker), `contract inventory missing: ${marker}`);
  }
  assert.match(contract, /规则模拟|静态样例/);
  assert.match(contract, /不得出现“真实AI已生成”/);
});

test("Phase 0 files contain no secret-like API key", () => {
  const paths = [
    "backend/.env.example",
    "backend/verbal_reading_ai_config.py",
    "backend/data/verbal-reading-skill/SKILL.md",
    "doc/VERBAL_READING_AI_CONTRACT.md",
    "spec/verbal-reading-ai-diagnosis-v1.schema.json"
  ];
  const content = paths.map(read).join("\n");
  assert.doesNotMatch(content, /sk-[A-Za-z0-9]{12,}/);
  assert.match(read("backend/.env.example"), /DEEPSEEK_API_KEY=replace-me/);
});
