/**
 * Geometry JSON v1.0 校验器。
 *
 * 基于 JSON Schema Draft-07 校验 Geometry JSON 文档的合法性。
 * 业务逻辑约束（如网格范围）在此层统一处理。
 */

import { readFileSync } from "node:fs";

// ── 延迟加载 ajv ──
let _ajv = null;
let _validate = null;

function getAjv() {
  if (!_ajv) {
    // 动态 import（ESM 兼容）
    throw new Error("ajv not initialized — call initValidator() first");
  }
  return _ajv;
}

function getValidate() {
  if (!_validate) {
    throw new Error("validator not initialized — call initValidator() first");
  }
  return _validate;
}

/**
 * 初始化校验器（加载 Schema 并编译）。
 *
 * @returns {Promise<void>}
 */
export async function initValidator() {
  const { default: Ajv } = await import("ajv");
  _ajv = new Ajv({ allErrors: true, strict: false });

  // 加载 Schema
  const schemaPath = new URL("../spec/geometry-json-v1.schema.json", import.meta.url);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  _validate = _ajv.compile(schema);
}

/**
 * 校验 Geometry JSON 文档。
 *
 * @param {object} geometryJson
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validateGeometryJson(geometryJson) {
  const validate = getValidate();
  const valid = validate(geometryJson);
  const errors = (validate.errors || []).map((e) => ({
    path: e.instancePath || "(root)",
    message: e.message || "unknown error",
    keyword: e.keyword,
    params: e.params,
  }));
  return { valid, errors };
}

/**
 * 校验并返回详细错误列表（如有），否则返回 null。
 *
 * @param {object} geometryJson
 * @returns {string[]|null}
 */
export function validateAndListErrors(geometryJson) {
  const result = validateGeometryJson(geometryJson);
  if (result.valid) return null;
  return result.errors.map((e) => `${e.path}: ${e.message}`);
}

/**
 * 业务逻辑校验：坐标是否在网格范围内。
 *
 * @param {object} geometryJson - 必须含 grid 和 positions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGridRange(geometryJson) {
  const { positions, grid } = geometryJson;
  const errors = [];

  if (!grid) return { valid: true, errors: [] };

  const { size, origin } = grid;

  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i];
    if (x < origin[0] || x >= origin[0] + size) {
      errors.push(`positions[${i}]: x=${x} 超出网格范围 [${origin[0]}, ${origin[0] + size})`);
    }
    if (y < origin[1] || y >= origin[1] + size) {
      errors.push(`positions[${i}]: y=${y} 超出网格范围 [${origin[1]}, ${origin[1] + size})`);
    }
    if (z < origin[2] || z >= origin[2] + size) {
      errors.push(`positions[${i}]: z=${z} 超出网格范围 [${origin[2]}, ${origin[2] + size})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 从文件路径加载并校验 Geometry JSON。
 *
 * @param {string} filePath - JSON 文件路径
 * @returns {{ valid: boolean, data: object|null, errors: string[] }}
 */
export function validateGeometryJsonFile(filePath) {
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    return { valid: false, data: null, errors: [`JSON 解析失败: ${e.message}`] };
  }

  const result = validateGeometryJson(data);
  const errors = result.errors.map((e) => `${e.path}: ${e.message}`);

  if (result.valid && data.grid) {
    const gridResult = validateGridRange(data);
    if (!gridResult.valid) {
      errors.push(...gridResult.errors);
      return { valid: false, data, errors };
    }
  }

  return { valid: errors.length === 0, data, errors };
}
