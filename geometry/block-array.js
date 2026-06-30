/**
 * 积木坐标阵列 — 单位立方体网格数据结构。
 *
 * 每个积木为边长 1 的单位立方体，由其最小角点坐标在整数网格上定位。
 * 这是 Geometry JSON 中 "unitCubeArray" 类型的核心数据模型：
 *
 *   {
 *     "type": "unitCubeArray",
 *     "positions": [[0,0,0], [1,0,0], [0,1,0]]
 *   }
 *
 * 坐标系：右手系（X 右、Y 上、Z 前），遵循 THREE.js 约定。
 */

const INDEX_KEY_SEPARATOR = ",";

/**
 * 将坐标数组转换为内部键字符串。
 * 要求坐标为整数。
 *
 * @param {number[]} position - [x, y, z]
 * @returns {string}
 */
function positionKey(position) {
  if (!Array.isArray(position) || position.length !== 3) {
    throw new TypeError("position must be [x, y, z]");
  }
  const [x, y, z] = position;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    throw new RangeError(`position [${x},${y},${z}] must be integer`);
  }
  return `${x}${INDEX_KEY_SEPARATOR}${y}${INDEX_KEY_SEPARATOR}${z}`;
}

/**
 * 从内部键字符串解析出坐标。
 *
 * @param {string} key
 * @returns {number[]} - [x, y, z]
 */
function parseKey(key) {
  const parts = key.split(INDEX_KEY_SEPARATOR);
  return [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
}

/**
 * @typedef {Object} BlockArrayBounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minY
 * @property {number} maxY
 * @property {number} minZ
 * @property {number} maxZ
 * @property {number} sizeX - maxX - minX + 1
 * @property {number} sizeY - maxY - minY + 1
 * @property {number} sizeZ - maxZ - minZ + 1
 */

/**
 * 积木坐标阵列。
 *
 * 内部使用 Map<string, true> 存储已占用的整数坐标点。
 * 每个键代表一个单位立方体的最小角点（即立方体占据 [x, x+1] × [y, y+1] × [z, z+1]）。
 */
export class BlockArray {
  /** @type {Map<string, true>} */
  #cells;

  /**
   * @param {Array<number[]>} [positions=[]] - 初始积木坐标列表
   */
  constructor(positions = []) {
    this.#cells = new Map();
    for (const pos of positions) {
      this.add(pos);
    }
  }

  /**
   * 在指定坐标添加一个单位立方体。
   *
   * @param {number[]} position - [x, y, z]，必须为整数
   * @returns {boolean} 该位置之前是否不存在（true 表示新增，false 表示已存在）
   */
  add(position) {
    const key = positionKey(position);
    if (this.#cells.has(key)) return false;
    this.#cells.set(key, true);
    return true;
  }

  /**
   * 移除指定坐标的单位立方体。
   *
   * @param {number[]} position - [x, y, z]
   * @returns {boolean} 该位置之前是否存在（true 表示成功移除，false 表示本来不存在）
   */
  remove(position) {
    const key = positionKey(position);
    return this.#cells.delete(key);
  }

  /**
   * 查询指定坐标是否被占用。
   *
   * @param {number[]} position - [x, y, z]
   * @returns {boolean}
   */
  has(position) {
    return this.#cells.has(positionKey(position));
  }

  /**
   * 积木总数。
   *
   * @returns {number}
   */
  get size() {
    return this.#cells.size;
  }

  /**
   * 是否为空。
   *
   * @returns {boolean}
   */
  get isEmpty() {
    return this.#cells.size === 0;
  }

  /**
   * 所有积木坐标的数组副本（[x, y, z] 三元组）。
   *
   * @returns {Array<number[]>}
   */
  toPositions() {
    return Array.from(this.#cells.keys(), (key) => parseKey(key));
  }

  /**
   * 计算包围盒。
   *
   * 空数组返回 null。
   *
   * @returns {BlockArrayBounds|null}
   */
  getBounds() {
    if (this.#cells.size === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const key of this.#cells.keys()) {
      const [x, y, z] = parseKey(key);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    return {
      minX, maxX, sizeX: maxX - minX + 1,
      minY, maxY, sizeY: maxY - minY + 1,
      minZ, maxZ, sizeZ: maxZ - minZ + 1,
    };
  }

  /**
   * 迭代所有积木。
   *
   * @param {(position: number[], index: number) => void} callback
   */
  forEach(callback) {
    let index = 0;
    for (const key of this.#cells.keys()) {
      callback(parseKey(key), index);
      index += 1;
    }
  }

  /**
   * 按 Y 层分组（用于底面视图 / 俯视图等）。
   *
   * @returns {Map<number, Array<number[]>>} y → positions 列表
   */
  layersByY() {
    /** @type {Map<number, Array<number[]>>} */
    const layers = new Map();
    for (const key of this.#cells.keys()) {
      const [x, y, z] = parseKey(key);
      if (!layers.has(y)) layers.set(y, []);
      layers.get(y).push([x, y, z]);
    }
    return layers;
  }

  /**
   * 从指定平面上的投影提取占用格点（用于正投影视图）。
   *
   * @param {"xy"|"xz"|"yz"} plane - 投影平面
   * @returns {Array<number[]>} 投影后的 2D 坐标 [[u, v], ...]
   */
  project(plane) {
    const projected = new Set();
    for (const key of this.#cells.keys()) {
      const [x, y, z] = parseKey(key);
      /** @type {string} */
      let key2d;
      if (plane === "xy") {
        key2d = `${x},${y}`;
      } else if (plane === "xz") {
        key2d = `${x},${z}`;
      } else if (plane === "yz") {
        key2d = `${y},${z}`;
      } else {
        throw new RangeError(`unknown projection plane "${plane}", use "xy"|"xz"|"yz"`);
      }
      projected.add(key2d);
    }
    return Array.from(projected, (k) => k.split(",").map(Number));
  }

  /**
   * 清空所有积木。
   */
  clear() {
    this.#cells.clear();
  }

  // ---------- 序列化 ----------

  /**
   * 序列化为 JSON 数组。
   *
   * @returns {Array<number[]>}
   */
  toJSON() {
    return this.toPositions();
  }

  /**
   * 从 JSON 数组反序列化。
   *
   * @param {Array<number[]>} positions
   * @returns {BlockArray}
   */
  static fromJSON(positions) {
    return new BlockArray(positions);
  }
}
