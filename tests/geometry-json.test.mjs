/**
 * QDB-002 + QDB-003: Geometry JSON Schema 校验测试。
 *
 * 覆盖：
 * - Schema 加载与编译
 * - 合法模型（5 个）
 * - 非法模型（9 个）
 * - 网格范围业务校验
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  initValidator,
  validateGeometryJson,
  validateAndListErrors,
  validateGridRange,
} from "../geometry/geometry-json-validator.js";

// ── 初始化 ──
await initValidator();

const FIXTURES_DIR = new URL("fixtures/geometry-json", import.meta.url).pathname;

// ── QDB-002: Schema 校验基础 ──

describe("QDB-002 Schema 校验", () => {
  it("最小合法模型通过校验", () => {
    const json = {
      version: "1.0",
      id: "minimal-cube",
      name: "单方块",
      type: "unitCubeArray",
      positions: [[2, 2, 2]],
    };
    const result = validateGeometryJson(json);
    assert.equal(result.valid, true, `错误: ${JSON.stringify(result.errors)}`);
  });

  it("完整字段模型通过校验", () => {
    const json = {
      version: "1.0",
      id: "full-model",
      name: "完整模型",
      description: "测试所有可选字段",
      type: "unitCubeArray",
      source: "user",
      tags: ["测试", "完整"],
      positions: [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
      appearance: {
        colorScheme: "layered",
        color: "#d4a76a",
        opacity: 0.8,
        wireframeColor: "#5c4033",
        layerPalette: ["#6baed6", "#fd8d3c"],
      },
      grid: { size: 5, origin: [0, 0, 0] },
      cutPlane: { axis: "y", defaultOffset: 0.5, range: [-2.5, 2.5] },
      question: {
        type: "block-count",
        difficulty: 1,
        answer: { count: 3 },
        explanation: "简单计数题",
      },
    };
    const result = validateGeometryJson(json);
    assert.equal(result.valid, true, `错误: ${JSON.stringify(result.errors)}`);
  });

  it("缺少必填字段 version 被拒绝", () => {
    const json = {
      id: "no-version",
      name: "无版本",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("缺少必填字段 id 被拒绝", () => {
    const json = {
      version: "1.0",
      name: "无ID",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("缺少必填字段 type 被拒绝", () => {
    const json = {
      version: "1.0",
      id: "no-type",
      name: "无类型",
      positions: [[0, 0, 0]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("空 positions 被拒绝", () => {
    const json = {
      version: "1.0",
      id: "empty",
      name: "空",
      type: "unitCubeArray",
      positions: [],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("版本号不匹配被拒绝", () => {
    const json = {
      version: "2.0",
      id: "v2",
      name: "v2",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("type 不是 unitCubeArray 被拒绝", () => {
    const json = {
      version: "1.0",
      id: "bad-type",
      name: "错误类型",
      type: "parametric",
      positions: [[0, 0, 0]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("非整数坐标被拒绝", () => {
    const json = {
      version: "1.0",
      id: "float-pos",
      name: "浮点坐标",
      type: "unitCubeArray",
      positions: [[0, 0, 0], [1.5, 2, 3]],
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("非法 colorScheme 被拒绝", () => {
    const json = {
      version: "1.0",
      id: "bad-color",
      name: "坏配色",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
      appearance: { colorScheme: "rainbow" },
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("未知额外字段被拒绝 (additionalProperties)", () => {
    const json = {
      version: "1.0",
      id: "extra",
      name: "额外",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
      unknownField: true,
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });

  it("difficulty 超出范围被拒绝", () => {
    const json = {
      version: "1.0",
      id: "bad-diff",
      name: "难度越界",
      type: "unitCubeArray",
      positions: [[0, 0, 0]],
      question: { type: "block-count", difficulty: 99 },
    };
    assert.equal(validateGeometryJson(json).valid, false);
  });
});

// ── QDB-003: 合法 / 非法模型文件校验 ──

describe("QDB-003 文件级合法模型", () => {
  const validDir = join(FIXTURES_DIR, "valid");
  const files = readdirSync(validDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    it(`${file} 通过 Schema 校验`, () => {
      const data = JSON.parse(readFileSync(join(validDir, file), "utf-8"));
      const result = validateGeometryJson(data);
      assert.equal(result.valid, true,
        `${file}: ${result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    });
  }

  it("合法模型均满足网格范围（如有 grid）", () => {
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(validDir, file), "utf-8"));
      if (data.grid) {
        const gridResult = validateGridRange(data);
        assert.equal(gridResult.valid, true,
          `${file} 网格越界: ${gridResult.errors.join("; ")}`);
      }
    }
  });
});

describe("QDB-003 文件级非法模型", () => {
  const invalidDir = join(FIXTURES_DIR, "invalid");
  const files = readdirSync(invalidDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    it(`${file} 被拒绝`, () => {
      const data = JSON.parse(readFileSync(join(invalidDir, file), "utf-8"));
      const schemaResult = validateGeometryJson(data);
      const gridResult = data.grid ? validateGridRange(data) : { valid: true };

      // out-of-range 坐标通过 Schema 但业务校验拒绝
      const rejected = !schemaResult.valid || !gridResult.valid;
      assert.equal(rejected, true,
        `${file} 应该被拒绝但通过了全部校验 (schema=${schemaResult.valid}, grid=${gridResult.valid})`);
    });
  }
});

// ── 业务逻辑校验 ──

describe("QDB-003 网格范围业务校验", () => {
  it("超出网格上界被拒绝", () => {
    const json = {
      version: "1.0",
      id: "out",
      name: "越界",
      type: "unitCubeArray",
      positions: [[0, 0, 0], [5, 0, 0]],
      grid: { size: 5, origin: [0, 0, 0] },
    };
    const gridResult = validateGridRange(json);
    assert.equal(gridResult.valid, false);
    assert.ok(gridResult.errors.length > 0);
  });

  it("超出网格下界被拒绝", () => {
    const json = {
      version: "1.0",
      id: "out-neg",
      name: "负坐标",
      type: "unitCubeArray",
      positions: [[0, 0, 0], [-1, 0, 0]],
      grid: { size: 5, origin: [0, 0, 0] },
    };
    const gridResult = validateGridRange(json);
    assert.equal(gridResult.valid, false);
  });

  it("无 grid 时不校验范围", () => {
    const json = {
      version: "1.0",
      id: "no-grid-range",
      name: "无网格",
      type: "unitCubeArray",
      positions: [[100, 100, 100]],
    };
    // Schema 校验通过
    const result = validateGeometryJson(json);
    assert.equal(result.valid, true);
    // 无 grid，范围校验跳过
    const gridResult = validateGridRange(json);
    assert.equal(gridResult.valid, true);
  });
});
