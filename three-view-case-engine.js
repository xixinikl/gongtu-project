import { BlockArray } from "./geometry/block-array.js";

export const VIEW_RULES = {
  main: {
    label: "主视图",
    horizontalAxis: "x",
    verticalAxis: "y",
    depthAxis: "z",
    horizontalOrder: "low-to-high",
    verticalOrder: "high-to-low",
    depthOrder: "low-to-high",
  },
  left: {
    label: "左视图",
    horizontalAxis: "z",
    verticalAxis: "y",
    depthAxis: "x",
    horizontalOrder: "high-to-low",
    verticalOrder: "high-to-low",
    depthOrder: "low-to-high",
  },
  right: {
    label: "右视图",
    horizontalAxis: "z",
    verticalAxis: "y",
    depthAxis: "x",
    horizontalOrder: "low-to-high",
    verticalOrder: "high-to-low",
    depthOrder: "high-to-low",
  },
  top: {
    label: "俯视图",
    horizontalAxis: "x",
    verticalAxis: "z",
    depthAxis: "y",
    horizontalOrder: "low-to-high",
    verticalOrder: "high-to-low",
    depthOrder: "high-to-low",
  },
};

export const VIEW_CAMERA_POSES = {
  free: {
    position: [5.4, 4.5, 6.2],
    up: [0, 1, 0],
  },
  main: {
    position: [0, 0, -7.2],
    up: [0, 1, 0],
  },
  left: {
    position: [7.2, 0, 0],
    up: [0, 1, 0],
  },
  right: {
    position: [-7.2, 0, 0],
    up: [0, 1, 0],
  },
  top: {
    position: [0, 7.2, 0],
    up: [0, 0, 1],
  },
};

export const VIEW_LABELS = Object.fromEntries(
  Object.entries(VIEW_RULES).map(([key, rule]) => [key, rule.label]),
);

export const AXIS_INDEX = { x: 0, y: 1, z: 2 };

export function orderedValues(order) {
  if (order === "low-to-high") return [0, 1, 2];
  if (order === "high-to-low") return [2, 1, 0];
  throw new RangeError(`unknown order "${order}"`);
}

export function axisValue(block, axis) {
  const index = AXIS_INDEX[axis];
  if (index == null) throw new RangeError(`unknown axis "${axis}"`);
  return block.position[index];
}

export function projectView(blocks, rule) {
  const horizontalValues = orderedValues(rule.horizontalOrder);
  const verticalValues = orderedValues(rule.verticalOrder);
  const depthValues = orderedValues(rule.depthOrder);

  return verticalValues.map((verticalValue) => (
    horizontalValues.map((horizontalValue) => {
      for (const depthValue of depthValues) {
        const visible = blocks.find((block) => (
          axisValue(block, rule.horizontalAxis) === horizontalValue
          && axisValue(block, rule.verticalAxis) === verticalValue
          && axisValue(block, rule.depthAxis) === depthValue
        ));
        if (visible) return visible.color;
      }
      return null;
    })
  ));
}

export function gridsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function gridKey(grid) {
  return JSON.stringify(grid);
}

export function countBlocks(blocks) {
  return blocks.reduce((acc, block) => {
    acc.total += 1;
    acc[block.color] += 1;
    return acc;
  }, { total: 0, white: 0, black: 0 });
}

export function getViewRules(caseData) {
  return caseData.viewRules || VIEW_RULES;
}

export function projectAllViews(caseData) {
  const rules = getViewRules(caseData);
  return Object.fromEntries(
    Object.entries(rules).map(([viewKey, rule]) => [
      viewKey,
      projectView(caseData.blocks, rule),
    ]),
  );
}

export function normalizeThreeViewCase(caseData) {
  const viewRules = getViewRules(caseData);
  const targetViewKey = caseData.targetViewKey || "main";
  const givenViewKeys = caseData.givenViewKeys
    || Object.keys(caseData.givenViews || {}).filter((key) => key !== targetViewKey);
  const allProjected = projectAllViews({ ...caseData, viewRules });
  const targetViews = {
    ...allProjected,
    ...(caseData.targetViews || {}),
  };

  return {
    ...caseData,
    viewRules,
    givenViewKeys,
    targetViewKey,
    targetViews,
  };
}

export function validateThreeViewCase(rawCaseData) {
  const caseData = normalizeThreeViewCase(rawCaseData);
  const positions = caseData.blocks.map((block) => block.position);
  const blockArray = new BlockArray(positions);
  const counts = countBlocks(caseData.blocks);
  const projected = projectAllViews(caseData);
  const errors = [];

  if (blockArray.size !== caseData.blocks.length) {
    errors.push("存在重复方块坐标");
  }
  for (const key of ["total", "white", "black"]) {
    if (counts[key] !== caseData.counts[key]) {
      errors.push(`${key} 数量不一致`);
    }
  }

  for (const block of caseData.blocks) {
    const [x, y, z] = block.position;
    if (![x, y, z].every((value) => Number.isInteger(value) && value >= 0 && value <= 2)) {
      errors.push(`方块坐标越界：${block.position.join(",")}`);
    }
    if (block.color !== "white" && block.color !== "black") {
      errors.push(`未知颜色：${block.color}`);
    }
  }

  for (const viewKey of caseData.givenViewKeys) {
    if (!caseData.givenViews?.[viewKey]) {
      errors.push(`缺少题面${VIEW_LABELS[viewKey] || viewKey}`);
    } else if (!gridsEqual(projected[viewKey], caseData.givenViews[viewKey])) {
      errors.push(`模型${VIEW_LABELS[viewKey] || viewKey}与题面不一致`);
    }
  }

  const targetGrid = caseData.targetViews?.[caseData.targetViewKey];
  if (!targetGrid) {
    errors.push(`缺少目标${VIEW_LABELS[caseData.targetViewKey] || caseData.targetViewKey}`);
  } else if (!gridsEqual(projected[caseData.targetViewKey], targetGrid)) {
    errors.push(`模型${VIEW_LABELS[caseData.targetViewKey] || caseData.targetViewKey}与正确答案不一致`);
  }

  const answerOption = caseData.options.find((option) => option.id === caseData.answer);
  if (!answerOption) {
    errors.push("正确答案不在选项中");
  } else if (targetGrid && !gridsEqual(answerOption.grid, targetGrid)) {
    errors.push("正确选项图形与目标视图不一致");
  }

  const matchingOptions = caseData.options.filter((option) => (
    targetGrid && gridsEqual(option.grid, targetGrid)
  ));
  if (matchingOptions.length !== 1) {
    errors.push(`目标视图匹配选项数量应为 1，实际为 ${matchingOptions.length}`);
  }

  if (!caseData.teaching?.short || !Array.isArray(caseData.teaching.steps) || caseData.teaching.steps.length < 3) {
    errors.push("缺少做题技巧讲解");
  }
  if (!Array.isArray(caseData.teaching?.optionFocus) || caseData.teaching.optionFocus.length < 4) {
    errors.push("缺少选项差异讲解");
  }

  return {
    ok: errors.length === 0,
    errors,
    counts,
    projected,
    normalized: caseData,
  };
}

export function validateThreeViewBank(bank) {
  const errors = [];
  const ids = new Set();
  const caseResults = new Map();

  if (!Array.isArray(bank.cases)) {
    errors.push("题库缺少 cases 数组");
  }
  if (!Array.isArray(bank.groups)) {
    errors.push("题库缺少 groups 数组");
  }
  if (!Array.isArray(bank.sourceSamples) || bank.sourceSamples.length < 15) {
    errors.push("题源截图记录不足 15 张");
  }

  for (const caseData of bank.cases || []) {
    if (ids.has(caseData.id)) errors.push(`题目 ID 重复：${caseData.id}`);
    ids.add(caseData.id);
    const result = validateThreeViewCase(caseData);
    caseResults.set(caseData.id, result);
    if (!result.ok) {
      errors.push(`${caseData.id}: ${result.errors.join("；")}`);
    }
  }

  const officialCases = (bank.cases || []).filter((caseData) => caseData.status === "verified");
  if (officialCases.length !== 50) {
    errors.push(`正式题应为 50 道，实际为 ${officialCases.length}`);
  }

  const groupedIds = new Set();
  for (const group of bank.groups || []) {
    if (!Array.isArray(group.caseIds) || group.caseIds.length !== 5) {
      errors.push(`${group.id} 不是 5 题一组`);
      continue;
    }
    for (const caseId of group.caseIds) {
      groupedIds.add(caseId);
      if (!ids.has(caseId)) errors.push(`${group.id} 引用了不存在的题目 ${caseId}`);
    }
  }
  for (const caseData of officialCases) {
    if (!groupedIds.has(caseData.id)) errors.push(`正式题未进入训练分组：${caseData.id}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    caseResults,
    officialCount: officialCases.length,
  };
}
