import { readFileSync } from "node:fs";

let validateSchema = null;

export async function initReasoningCaseValidator() {
  if (validateSchema) return;
  const { default: Ajv } = await import("ajv");
  const schemaUrl = new URL(
    "../spec/reasoning-case-v1.schema.json",
    import.meta.url,
  );
  const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  validateSchema = ajv.compile(schema);
}

function semanticErrors(reasoningCase) {
  const errors = [];
  const optionIds = new Set();
  const constraintIds = new Set();

  for (const constraint of reasoningCase.constraints ?? []) {
    if (constraintIds.has(constraint.id)) {
      errors.push({
        path: "/constraints",
        message: `约束 ID 重复: ${constraint.id}`,
      });
    }
    constraintIds.add(constraint.id);
  }

  for (const option of reasoningCase.options ?? []) {
    if (optionIds.has(option.id)) {
      errors.push({
        path: "/options",
        message: `选项 ID 重复: ${option.id}`,
      });
    }
    optionIds.add(option.id);
    for (const id of [...(option.satisfies ?? []), ...(option.violates ?? [])]) {
      if (!constraintIds.has(id)) {
        errors.push({
          path: `/options/${option.id}`,
          message: `引用了不存在的约束: ${id}`,
        });
      }
    }
  }

  const sourceOrder = reasoningCase.source?.optionOrder ?? [];
  if (
    sourceOrder.length !== optionIds.size ||
    sourceOrder.some((id) => !optionIds.has(id))
  ) {
    errors.push({
      path: "/source/optionOrder",
      message: "选项顺序必须与 options 完全一致",
    });
  }

  const answerId = reasoningCase.answer?.correctOptionId;
  if (!optionIds.has(answerId)) {
    errors.push({
      path: "/answer/correctOptionId",
      message: "标准答案必须引用现有选项",
    });
  }

  for (const [index, note] of (reasoningCase.answerReviewNotes ?? []).entries()) {
    if (!optionIds.has(note.userProvidedOptionId)) {
      errors.push({
        path: `/answerReviewNotes/${index}/userProvidedOptionId`,
        message: `复核答案引用了不存在的选项: ${note.userProvidedOptionId}`,
      });
    }
    if (
      note.existingCorrectOptionId
      && !optionIds.has(note.existingCorrectOptionId)
    ) {
      errors.push({
        path: `/answerReviewNotes/${index}/existingCorrectOptionId`,
        message: `复核记录里的原答案不存在: ${note.existingCorrectOptionId}`,
      });
    }
  }

  const coveredOptions = new Set(
    (reasoningCase.keyframes ?? [])
      .map((keyframe) => keyframe.optionId)
      .filter(Boolean),
  );
  for (const optionId of optionIds) {
    if (!coveredOptions.has(optionId)) {
      errors.push({
        path: "/keyframes",
        message: `缺少选项 ${optionId} 的讲解关键帧`,
      });
    }
  }

  let previousTime = -Infinity;
  for (const keyframe of reasoningCase.keyframes ?? []) {
    if (keyframe.timeSeconds <= previousTime) {
      errors.push({
        path: "/keyframes",
        message: "关键帧时间必须严格递增",
      });
      break;
    }
    previousTime = keyframe.timeSeconds;
    if (keyframe.optionId && !optionIds.has(keyframe.optionId)) {
      errors.push({
        path: `/keyframes/${keyframe.id}`,
        message: `引用了不存在的选项: ${keyframe.optionId}`,
      });
    }
  }

  if (reasoningCase.answer?.aiGenerated !== false) {
    errors.push({
      path: "/answer/aiGenerated",
      message: "正式答案禁止由 AI 生成",
    });
  }

  return errors;
}

export function validateReasoningCase(reasoningCase) {
  if (!validateSchema) {
    throw new Error(
      "ReasoningCase validator not initialized — call initReasoningCaseValidator() first",
    );
  }
  const schemaValid = validateSchema(reasoningCase);
  const errors = (validateSchema.errors ?? []).map((error) => ({
    path: error.instancePath || "(root)",
    message: error.message || "协议校验失败",
  }));
  if (schemaValid) errors.push(...semanticErrors(reasoningCase));
  return { valid: schemaValid && errors.length === 0, errors };
}

export function validateReasoningCaseFile(filePath) {
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      valid: false,
      data: null,
      errors: [{ path: "(root)", message: `JSON 解析失败: ${error.message}` }],
    };
  }
  const result = validateReasoningCase(data);
  return { ...result, data };
}
