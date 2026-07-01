/**
 * CSG Engine — Manifold WASM 包装层
 *
 * 提供基本体构造、布尔运算、Three.js BufferGeometry 转换。
 * 模块自动延迟初始化 Manifold WASM，首次调用时加载。
 *
 * 依赖: manifold-3d (npm), three (importmap: "three")
 */

import Module from '/node_modules/manifold-3d/manifold.js';

let wasm = null;
let MF = null;     // Manifold 命名空间
let initPromise = null;

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export async function initManifold() {
  if (MF) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    wasm = await Module();
    wasm.setup();
    MF = wasm.Manifold;
    // 设置默认圆滑精度 — 64 段在视觉上足够圆
    wasm.setCircularSegments(64);
    return MF;
  })();

  return initPromise;
}

export function isReady() {
  return MF !== null;
}

// ---------------------------------------------------------------------------
// 基本体
// ---------------------------------------------------------------------------

export function cube(size = [1, 1, 1], center = true) {
  return MF.cube(size, center);
}

/**
 * 圆柱/圆锥
 * @param {number} height
 * @param {number} radiusLow  底部半径
 * @param {number} [radiusHigh] 顶部半径(0=圆锥)，默认 = radiusLow
 * @param {number} [segments]  默认 64
 * @param {boolean} [center]   默认 true(居中)
 */
export function cylinder(height, radiusLow, radiusHigh, segments, center = true) {
  return MF.cylinder(height, radiusLow, radiusHigh, segments, center);
}

export function cone(height, radiusBottom, segments, center = true) {
  return MF.cylinder(height, radiusBottom, 0, segments, center);
}

export function sphere(radius, segments) {
  return MF.sphere(radius, segments);
}

// ---------------------------------------------------------------------------
// 布尔运算
// ---------------------------------------------------------------------------

export function subtract(a, b) { return a.subtract(b); }
export function add(a, b)       { return a.add(b); }
export function intersect(a, b) { return a.intersect(b); }

// ---------------------------------------------------------------------------
// Mesh 数据提取 — 返回裸数组，由调用方创建 Three.js 几何体
// ---------------------------------------------------------------------------

/**
 * 从 Manifold 对象提取顶点和索引数据
 *
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 *   positions: [x0,y0,z0, x1,y1,z1, ...]
 *   indices:   [t0a,t0b,t0c, t1a,t1b,t1c, ...]
 */
export function getMeshData(mfManifold) {
  const mesh = mfManifold.getMesh(0);
  const numVerts = mesh.numVert;
  const numProp  = mesh.numProp;

  const pos = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    const base = i * numProp;
    pos[i * 3]     = mesh.vertProperties[base];
    pos[i * 3 + 1] = mesh.vertProperties[base + 1];
    pos[i * 3 + 2] = mesh.vertProperties[base + 2];
  }

  // 复制 triVerts（Uint32Array → 新数组，因为 WASM 内存可能在 manifold.delete() 后释放）
  const idx = new Uint32Array(mesh.triVerts);

  return { positions: pos, indices: idx };
}

// ---------------------------------------------------------------------------
// CSG 模板库
// ---------------------------------------------------------------------------

export const CSG_TEMPLATES = {

  /** 立方体挖圆锥 — 考公图推最常见题型 */
  'cube-minus-cone': {
    name: '立方体挖圆锥',
    category: '挖切',
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.85;
      const h = params.height ?? s + 0.2;
      const seg = params.segments ?? 64;

      const box  = cube([s, s, s], true);
      const hole = cone(h, r, seg, true);
      const result = subtract(box, hole);

      // 释放中间体
      box.delete();
      hole.delete();

      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '立方体边长' },
      radius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.85, label: '圆锥半径' },
      height: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.2, label: '圆锥高度' },
    },
  },

  /** 立方体挖圆柱 */
  'cube-minus-cylinder': {
    name: '立方体挖圆柱',
    category: '挖切',
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.7;
      const h = params.height ?? s + 0.2;
      const seg = params.segments ?? 64;

      const box  = cube([s, s, s], true);
      const hole = cylinder(h, r, r, seg, true);
      const result = subtract(box, hole);
      box.delete();
      hole.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '立方体边长' },
      radius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.7, label: '圆柱半径' },
      height: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.2, label: '圆柱高度' },
    },
  },

  /** 圆柱挖圆锥 */
  'cylinder-minus-cone': {
    name: '圆柱挖圆锥',
    category: '挖切',
    build(params = {}) {
      const h  = params.height ?? 2.5;
      const r  = params.radius ?? 1;
      const hr = params.holeRadius ?? 0.85;
      const seg = params.segments ?? 64;

      const outer = cylinder(h, r, r, seg, true);
      const inner = cone(h + 0.1, hr, seg, true);
      const result = subtract(outer, inner);
      outer.delete();
      inner.delete();
      return result;
    },
    params: {
      height:     { type: 'range', min: 1, max: 5, step: 0.1, default: 2.5, label: '高度' },
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '圆柱半径' },
      holeRadius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.85, label: '圆锥半径' },
    },
  },

  /** 两圆柱正交 — 十字管道 */
  'cylinder-x-cylinder': {
    name: '两圆柱正交',
    category: '组合',
    build(params = {}) {
      const r = params.radius ?? 0.5;
      const len = params.length ?? 2.5;
      const seg = params.segments ?? 64;

      const h = cylinder(len * 2, r, r, seg, true);
      // 第二个圆柱: 沿X轴 → 旋转90°绕Y轴 然后沿Z轴延伸
      // 直接用 cylinder(height=along Z): 沿Z轴
      // 要沿X轴: 需要旋转，Manifold 有 rotate 方法
      const v = cylinder(len * 2, r, r, seg, true);
      const rotated = v.rotate([0, 90, 0]);
      const result = add(h, rotated);
      h.delete();
      v.delete();
      rotated.delete();
      return result;
    },
    params: {
      radius: { type: 'range', min: 0.2, max: 1.5, step: 0.05, default: 0.5, label: '管道半径' },
      length: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.5, label: '管道半长' },
    },
  },

  /** 球挖圆柱 — 穿孔球 */
  'sphere-minus-cylinder': {
    name: '球挖圆柱',
    category: '挖切',
    build(params = {}) {
      const r  = params.radius ?? 1;
      const hr = params.holeRadius ?? 0.35;
      const seg = params.segments ?? 64;

      const ball = sphere(r, seg);
      const hole = cylinder(r * 2.5, hr, hr, seg, true);
      const result = subtract(ball, hole);
      ball.delete();
      hole.delete();
      return result;
    },
    params: {
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '球半径' },
      holeRadius: { type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.35, label: '孔半径' },
    },
  },

};

/** 获取所有模板 ID */
export function getTemplateIds() {
  return Object.keys(CSG_TEMPLATES);
}

/** 构建模板并返回 { name, manifold, params } */
export function buildTemplate(templateId, params = {}) {
  const tpl = CSG_TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  const mf = tpl.build(params);
  return { name: tpl.name, category: tpl.category, manifold: mf, params };
}
