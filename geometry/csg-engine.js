/**
 * CSG Engine — Manifold WASM 包装层
 *
 * 提供基本体构造、布尔运算、Three.js BufferGeometry 转换。
 * 模块自动延迟初始化 Manifold WASM，首次调用时加载。
 *
 * 依赖: manifold-3d (npm), three (importmap: "three")
 *
 * V2: 15 个考公题型模板 + createCSGMesh() 集成函数
 */

import Module from '/node_modules/manifold-3d/manifold.js';

let wasm = null;
let MF = null;
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
// Mesh 数据提取
// ---------------------------------------------------------------------------

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

  const idx = new Uint32Array(mesh.triVerts);
  return { positions: pos, indices: idx };
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 旋转 Manifold 对象
 * @param {Manifold} mf
 * @param {[number,number,number]} deg [xDeg, yDeg, zDeg]
 */
function rotateManifold(mf, deg) {
  return mf.rotate(deg);
}

/**
 * 平移 Manifold 对象
 * @param {Manifold} mf
 * @param {[number,number,number]} offset
 */
function translateManifold(mf, offset) {
  return mf.translate(offset);
}

// ============================================================================
// CSG 模板库 — 15 种考公图推立体截面题型
// ============================================================================

export const CSG_TEMPLATES = {

  // ─── 挖切类 (8) ─────────────────────────────────────────

  'cube-minus-cone': {
    name: '立方体挖圆锥',
    category: '挖切',
    tags: ['经典', '高频'],
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.85;
      const h = params.height ?? s + 0.2;
      const seg = params.segments ?? 64;
      const box  = cube([s, s, s], true);
      const hole = cone(h, r, seg, true);
      const result = subtract(box, hole);
      box.delete(); hole.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2,   label: '边长' },
      radius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.85, label: '圆锥半径' },
      height: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.2, label: '圆锥高' },
    },
  },

  'cube-minus-cylinder': {
    name: '立方体挖圆柱',
    category: '挖切',
    tags: ['经典', '高频'],
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.7;
      const h = params.height ?? s + 0.2;
      const seg = params.segments ?? 64;
      const box  = cube([s, s, s], true);
      const hole = cylinder(h, r, r, seg, true);
      const result = subtract(box, hole);
      box.delete(); hole.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '边长' },
      radius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.7, label: '圆柱半径' },
      height: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.2, label: '圆柱高' },
    },
  },

  'cube-minus-sphere': {
    name: '立方体挖球',
    category: '挖切',
    tags: ['经典'],
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.9;
      const seg = params.segments ?? 64;
      const box  = cube([s, s, s], true);
      const hole = sphere(r, seg);
      const result = subtract(box, hole);
      box.delete(); hole.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '边长' },
      radius: { type: 'range', min: 0.3, max: 1.8, step: 0.05, default: 0.9, label: '球半径' },
    },
  },

  'cylinder-minus-cone': {
    name: '圆柱挖圆锥',
    category: '挖切',
    tags: ['经典', '高频'],
    build(params = {}) {
      const h  = params.height ?? 2.5;
      const r  = params.radius ?? 1;
      const hr = params.holeRadius ?? 0.85;
      const seg = params.segments ?? 64;
      const outer = cylinder(h, r, r, seg, true);
      const inner = cone(h + 0.1, hr, seg, true);
      const result = subtract(outer, inner);
      outer.delete(); inner.delete();
      return result;
    },
    params: {
      height:     { type: 'range', min: 1, max: 5, step: 0.1, default: 2.5, label: '高度' },
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '圆柱半径' },
      holeRadius: { type: 'range', min: 0.2, max: 1.8, step: 0.05, default: 0.85, label: '圆锥半径' },
    },
  },

  'cylinder-minus-sphere': {
    name: '圆柱挖球',
    category: '挖切',
    tags: ['冷门'],
    build(params = {}) {
      const h  = params.height ?? 2.5;
      const r  = params.radius ?? 1;
      const sr = params.sphereRadius ?? 0.85;
      const seg = params.segments ?? 64;
      const outer = cylinder(h, r, r, seg, true);
      const inner = sphere(sr, seg);
      const result = subtract(outer, inner);
      outer.delete(); inner.delete();
      return result;
    },
    params: {
      height:       { type: 'range', min: 1, max: 5, step: 0.1, default: 2.5, label: '柱高' },
      radius:       { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '柱半径' },
      sphereRadius: { type: 'range', min: 0.3, max: 1.8, step: 0.05, default: 0.85, label: '球半径' },
    },
  },

  'sphere-minus-cylinder': {
    name: '球挖圆柱',
    category: '挖切',
    tags: ['经典'],
    build(params = {}) {
      const r  = params.radius ?? 1;
      const hr = params.holeRadius ?? 0.35;
      const seg = params.segments ?? 64;
      const ball = sphere(r, seg);
      const hole = cylinder(r * 2.5, hr, hr, seg, true);
      const result = subtract(ball, hole);
      ball.delete(); hole.delete();
      return result;
    },
    params: {
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '球半径' },
      holeRadius: { type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.35, label: '孔半径' },
    },
  },

  'sphere-minus-cone': {
    name: '球挖圆锥',
    category: '挖切',
    tags: ['冷门'],
    build(params = {}) {
      const r  = params.radius ?? 1;
      const cr = params.coneRadius ?? 0.6;
      const seg = params.segments ?? 64;
      const ball = sphere(r, seg);
      const hole = cone(r * 2.2, cr, seg, true);
      const result = subtract(ball, hole);
      ball.delete(); hole.delete();
      return result;
    },
    params: {
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '球半径' },
      coneRadius: { type: 'range', min: 0.2, max: 1.2, step: 0.05, default: 0.6, label: '锥半径' },
    },
  },

  'cube-diagonal-hole': {
    name: '立方体斜穿孔',
    category: '挖切',
    tags: ['技巧'],
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.3;
      const seg = params.segments ?? 64;
      const box  = cube([s, s, s], true);
      // 沿对角线方向 (1,1,1)/√3 穿孔 — 旋转圆柱
      const hole = cylinder(s * 2.5, r, r, seg, true);
      // 绕 Y 轴旋转 45°，再绕 X 轴旋转 atan(1/√2) ≈ 35.264°
      const rotated = rotateManifold(hole, [35.264, 45, 0]);
      const result = subtract(box, rotated);
      box.delete(); hole.delete(); rotated.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '边长' },
      radius: { type: 'range', min: 0.1, max: 0.8, step: 0.05, default: 0.3, label: '孔半径' },
    },
  },

  // ─── 相贯/正交类 (3) ────────────────────────────────────

  'cylinder-x-cylinder': {
    name: '两圆柱正交',
    category: '相贯',
    tags: ['经典', '高频'],
    build(params = {}) {
      const r = params.radius ?? 0.5;
      const len = params.length ?? 2.5;
      const seg = params.segments ?? 64;
      const h = cylinder(len * 2, r, r, seg, true);
      const v = cylinder(len * 2, r, r, seg, true);
      const rotated = rotateManifold(v, [0, 90, 0]);
      const result = add(h, rotated);
      h.delete(); v.delete(); rotated.delete();
      return result;
    },
    params: {
      radius: { type: 'range', min: 0.2, max: 1.5, step: 0.05, default: 0.5, label: '管半径' },
      length: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.5, label: '管半长' },
    },
  },

  'three-cylinders': {
    name: '三圆柱正交',
    category: '相贯',
    tags: ['进阶'],
    build(params = {}) {
      const r = params.radius ?? 0.45;
      const len = params.length ?? 2.5;
      const seg = params.segments ?? 64;
      const zCyl = cylinder(len * 2, r, r, seg, true);
      const xCylRaw = cylinder(len * 2, r, r, seg, true);
      const xCyl = rotateManifold(xCylRaw, [0, 90, 0]);
      const yCylRaw = cylinder(len * 2, r, r, seg, true);
      const yCyl = rotateManifold(yCylRaw, [90, 0, 0]);
      const result = add(zCyl, add(xCyl, yCyl));
      zCyl.delete(); xCylRaw.delete(); xCyl.delete();
      yCylRaw.delete(); yCyl.delete();
      return result;
    },
    params: {
      radius: { type: 'range', min: 0.2, max: 1.2, step: 0.05, default: 0.45, label: '管半径' },
      length: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.5, label: '管半长' },
    },
  },

  'cube-intersect-cylinder': {
    name: '立方体交圆柱',
    category: '相贯',
    tags: ['进阶'],
    build(params = {}) {
      const s = params.size ?? 2;
      const r = params.radius ?? 0.85;
      const h = params.height ?? s + 0.2;
      const seg = params.segments ?? 64;
      const box  = cube([s, s, s], true);
      const cyl  = cylinder(h, r, r, seg, true);
      const result = intersect(box, cyl);
      box.delete(); cyl.delete();
      return result;
    },
    params: {
      size:   { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '边长' },
      radius: { type: 'range', min: 0.3, max: 1.5, step: 0.05, default: 0.85, label: '圆柱半径' },
      height: { type: 'range', min: 1, max: 4, step: 0.1, default: 2.2, label: '圆柱高' },
    },
  },

  // ─── 锥台类 (3) ──────────────────────────────────────────

  'cone-minus-cylinder': {
    name: '圆锥挖圆柱',
    category: '锥台',
    tags: ['经典'],
    build(params = {}) {
      const h  = params.height ?? 2.5;
      const r  = params.radius ?? 1;
      const hr = params.holeRadius ?? 0.35;
      const seg = params.segments ?? 64;
      const outer = cone(h, r, seg, true);
      const inner = cylinder(h + 0.2, hr, hr, seg, true);
      const result = subtract(outer, inner);
      outer.delete(); inner.delete();
      return result;
    },
    params: {
      height:     { type: 'range', min: 1, max: 5, step: 0.1, default: 2.5, label: '锥高' },
      radius:     { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, label: '底半径' },
      holeRadius: { type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.35, label: '孔半径' },
    },
  },

  'truncated-cone': {
    name: '圆台（截头圆锥）',
    category: '锥台',
    tags: ['经典'],
    build(params = {}) {
      const h = params.height ?? 2;
      const rb = params.radiusBottom ?? 1;
      const rt = params.radiusTop ?? 0.5;
      const seg = params.segments ?? 64;
      // cylinder with different top/bottom radii = 圆台
      return cylinder(h, rb, rt, seg, true);
    },
    params: {
      height:       { type: 'range', min: 0.5, max: 4, step: 0.1, default: 2, label: '高' },
      radiusBottom: { type: 'range', min: 0.3, max: 2, step: 0.05, default: 1, label: '下底半径' },
      radiusTop:    { type: 'range', min: 0.1, max: 1.8, step: 0.05, default: 0.5, label: '上底半径' },
    },
  },

  'truncated-cone-minus-cylinder': {
    name: '圆台挖圆柱',
    category: '锥台',
    tags: ['进阶'],
    build(params = {}) {
      const h  = params.height ?? 2;
      const rb = params.radiusBottom ?? 1;
      const rt = params.radiusTop ?? 0.5;
      const hr = params.holeRadius ?? 0.3;
      const seg = params.segments ?? 64;
      const outer = cylinder(h, rb, rt, seg, true);
      const inner = cylinder(h + 0.2, hr, hr, seg, true);
      const result = subtract(outer, inner);
      outer.delete(); inner.delete();
      return result;
    },
    params: {
      height:       { type: 'range', min: 0.5, max: 4, step: 0.1, default: 2, label: '高' },
      radiusBottom: { type: 'range', min: 0.3, max: 2, step: 0.05, default: 1, label: '下底半径' },
      radiusTop:    { type: 'range', min: 0.1, max: 1.8, step: 0.05, default: 0.5, label: '上底半径' },
      holeRadius:   { type: 'range', min: 0.1, max: 0.9, step: 0.05, default: 0.3, label: '孔半径' },
    },
  },

  // ─── 组合类 (1) ──────────────────────────────────────────

  'cube-minus-cube-offset': {
    name: '立方体偏置挖方',
    category: '组合',
    tags: ['经典'],
    build(params = {}) {
      const s = params.size ?? 2;
      const is = params.innerSize ?? 1;
      const dx = params.offsetX ?? 0;
      const dy = params.offsetY ?? 0;
      const dz = params.offsetZ ?? 0;
      const outer = cube([s, s, s], true);
      const inner = translateManifold(cube([is, is, is], true), [dx, dy, dz]);
      // 确保 inner 完全在 outer 内 — 裁剪到 outer
      const clipped = intersect(outer, inner);
      const result = subtract(outer, clipped);
      outer.delete(); inner.delete(); clipped.delete();
      return result;
    },
    params: {
      size:      { type: 'range', min: 1, max: 4, step: 0.1, default: 2, label: '外边长' },
      innerSize: { type: 'range', min: 0.3, max: 1.8, step: 0.1, default: 1, label: '内边长' },
      offsetX:   { type: 'range', min: -0.8, max: 0.8, step: 0.1, default: 0, label: '偏移X' },
      offsetY:   { type: 'range', min: -0.8, max: 0.8, step: 0.1, default: 0, label: '偏移Y' },
      offsetZ:   { type: 'range', min: -0.8, max: 0.8, step: 0.1, default: 0, label: '偏移Z' },
    },
  },

};

// ---------------------------------------------------------------------------
// 模板工具
// ---------------------------------------------------------------------------

export function getTemplateIds() {
  return Object.keys(CSG_TEMPLATES);
}

/** 按分类分组返回模板 */
export function getTemplatesByCategory() {
  const cats = {};
  for (const [id, tpl] of Object.entries(CSG_TEMPLATES)) {
    if (!cats[tpl.category]) cats[tpl.category] = [];
    cats[tpl.category].push({ id, ...tpl });
  }
  return cats;
}

export function buildTemplate(templateId, params = {}) {
  const tpl = CSG_TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  const mf = tpl.build(params);
  return { name: tpl.name, category: tpl.category, tags: tpl.tags, manifold: mf, params };
}

// ---------------------------------------------------------------------------
// Three.js 集成 — 创建可直接投入截面引擎的 Mesh
// ---------------------------------------------------------------------------

/**
 * 从模板构建 CSG 模型并返回 THREE.Mesh
 *
 * @param {string} templateId
 * @param {object} params
 * @param {object} [THREE] — THREE 命名空间（调用方从 importmap 传入）
 * @param {object} [material] — 可选材质，默认半透明蓝色 MeshPhongMaterial
 * @returns {{ mesh: THREE.Mesh, manifoldResult: object, triangleCount: number }}
 */
export function createCSGMesh(templateId, params = {}, THREE, material) {
  if (!THREE?.BufferGeometry || !THREE?.BufferAttribute) {
    throw new Error('THREE namespace required. Pass the THREE importmap object.');
  }

  const { name, manifold, tags } = buildTemplate(templateId, params);
  const { positions, indices } = getMeshData(manifold);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const mat = material || new THREE.MeshPhongMaterial({
    color: 0x4488cc,
    specular: 0x111111,
    shininess: 30,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const triangleCount = Math.floor(indices.length / 3);

  return { mesh, manifoldResult: { name, tags, manifold }, triangleCount };
}
