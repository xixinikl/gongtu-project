/**
 * 布尔组合几何运算模块。
 *
 * 基于 three-bvh-csg 提供 UNION / SUBTRACTION / INTERSECTION
 * 三种布尔运算，将多个基础几何体或积木组件合并、裁切或取交。
 */

import * as THREE from "three";
import {
  Brush,
  Evaluator,
  ADDITION,
  SUBTRACTION,
  INTERSECTION,
} from "three-bvh-csg";

// ============================================================
// Evaluator 缓存：复用单例避免重复创建
// ============================================================
let _evaluator = null;

function getEvaluator() {
  if (!_evaluator) {
    _evaluator = new Evaluator();
  }
  return _evaluator;
}

// ============================================================
// 外观工具
// ============================================================

function resolveColor(val) {
  return new THREE.Color(val);
}

function solidMaterial(colorHex, opacity) {
  return new THREE.MeshStandardMaterial({
    color: resolveColor(colorHex),
    roughness: 0.55,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity: Math.min(1, Math.max(0, opacity)),
    side: THREE.FrontSide,
  });
}

function wireframeMaterial(colorHex, opacity) {
  return new THREE.LineBasicMaterial({
    color: resolveColor(colorHex),
    transparent: opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, opacity < 0.5 ? opacity + 0.3 : 1)),
  });
}

const DEFAULT_APPEARANCE = {
  color: 0xd4a76a,
  opacity: 1.0,
  wireframeColor: 0x5c4033,
};

// ============================================================
// Brush 工厂
// ============================================================

/**
 * 从 BufferGeometry 创建 Brush。
 * 也接受 Mesh / Group，自动提取 geometry。
 */
export function csgFromGeometry(geometryOrMesh) {
  let geom;
  if (geometryOrMesh.isMesh) {
    geom = geometryOrMesh.geometry;
  } else if (geometryOrMesh.isBufferGeometry) {
    geom = geometryOrMesh;
  } else if (geometryOrMesh.isGroup) {
    // Group: 合并所有子 Mesh 的 geometry 为一个统一 Brush
    const merged = new THREE.BufferGeometry();
    let vertexCount = 0;

    // 统计总顶点数（indexed 用索引数，非 indexed 用 position 数）
    geometryOrMesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const idx = child.geometry.index;
        vertexCount += idx
          ? idx.count
          : child.geometry.attributes.position.count;
      }
    });

    const positions = new Float32Array(vertexCount * 3);
    let offset = 0;
    geometryOrMesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.updateMatrixWorld();
        const childGeom = child.geometry;
        const pos = childGeom.attributes.position;
        const idx = childGeom.index;
        const matrix = child.matrixWorld.clone();
        const v = new THREE.Vector3();

        if (idx) {
          const triCount = idx.count;
          for (let i = 0; i < triCount; i++) {
            v.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(matrix);
            positions[(offset + i) * 3] = v.x;
            positions[(offset + i) * 3 + 1] = v.y;
            positions[(offset + i) * 3 + 2] = v.z;
          }
          offset += triCount;
        } else {
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
            positions[(offset + i) * 3] = v.x;
            positions[(offset + i) * 3 + 1] = v.y;
            positions[(offset + i) * 3 + 2] = v.z;
          }
          offset += pos.count;
        }
      }
    });

    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged.computeVertexNormals();
    return new Brush(merged);
  } else {
    throw new Error(
      "csgFromGeometry: 期望 BufferGeometry / Mesh / Group，实际收到 " +
        geometryOrMesh.type,
    );
  }
  return new Brush(geom);
}

// ============================================================
// 核心布尔运算
// ============================================================

/**
 * 低级布尔运算：对两个 Brush 执行给定操作。
 * @param {Brush} a - 操作数 A
 * @param {Brush} b - 操作数 B
 * @param {number} operation - ADDITION / SUBTRACTION / INTERSECTION
 * @param {object} [options]
 * @param {boolean} [options.preserveTransform=true] - 保持 A 的世界变换
 * @returns {Brush} 结果 Brush，其 geometry 为布尔运算结果
 */
export function csgEvaluate(a, b, operation, options = {}) {
  const { preserveTransform = true } = options;
  const evaluator = getEvaluator();
  const target = new Brush();

  if (preserveTransform) {
    // 确保世界矩阵为最新
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
  }

  evaluator.evaluate(a, b, [operation], target);

  return target;
}

/** A ∪ B */
export function csgUnion(a, b, options) {
  return csgEvaluate(a, b, ADDITION, options);
}

/** A - B */
export function csgSubtract(a, b, options) {
  return csgEvaluate(a, b, SUBTRACTION, options);
}

/** A ∩ B */
export function csgIntersect(a, b, options) {
  return csgEvaluate(a, b, INTERSECTION, options);
}

/**
 * 链式多次布尔运算。
 *
 * @example
 *   // (a ∪ b) - c
 *   csgChain(a, [
 *     { brush: b, operation: ADDITION },
 *     { brush: c, operation: SUBTRACTION },
 *   ]);
 *
 * @param {Brush} initial - 初始 Brush
 * @param {Array<{brush: Brush, operation: number}>} steps - 操作序列
 * @returns {Brush}
 */
export function csgChain(initial, steps) {
  let current = initial;
  for (const step of steps) {
    current = csgEvaluate(current, step.brush, step.operation);
  }
  return current;
}

// ============================================================
// 结果包装：将 Brush 转回项目标准的 Group (solid + wireframe)
// ============================================================

/**
 * 将布尔运算结果 Brush 包装为项目标准的 Group，
 * 包含 solid mesh 和 wireframe mesh。
 *
 * @param {Brush} brush - 布尔运算结果
 * @param {object} [appearance]
 * @param {number} [appearance.color=0xd4a76a] - 实体颜色
 * @param {number} [appearance.opacity=1.0]
 * @param {number} [appearance.wireframeColor=0x5c4033] - 线框颜色
 * @param {string} [appearance.name] - Group 名称
 * @returns {THREE.Group}
 */
export function csgToShape(brush, appearance = {}) {
  const ap = { ...DEFAULT_APPEARANCE, ...appearance };
  const group = new THREE.Group();
  group.name = ap.name || "csgResult";

  const geom = brush.geometry;

  const solid = new THREE.Mesh(geom, solidMaterial(ap.color, ap.opacity));
  solid.name = "csgSolid";
  solid.castShadow = true;
  solid.receiveShadow = true;

  const edges = new THREE.EdgesGeometry(geom, 30);
  const wireframe = new THREE.LineSegments(
    edges,
    wireframeMaterial(ap.wireframeColor, ap.opacity),
  );
  wireframe.name = "csgWireframe";

  group.add(solid);
  group.add(wireframe);

  // 包围盒
  const bbox = new THREE.Box3().setFromObject(group);
  group.userData.bbox = {
    minX: bbox.min.x,
    maxX: bbox.max.x,
    minY: bbox.min.y,
    maxY: bbox.max.y,
    minZ: bbox.min.z,
    maxZ: bbox.max.z,
  };
  group.userData.type = "csgResult";
  group.userData.volume = csgComputeVolume(brush);

  return group;
}

// ============================================================
// 几何度量
// ============================================================

/**
 * 近似计算 Brush 体积（通过三角面片累加）。
 * 假设 geometry 为闭合流形、顶点顺序为 CCW outside。
 */
export function csgComputeVolume(brush) {
  const geom = brush.geometry;
  if (!geom) return 0;

  const pos = geom.attributes.position;
  const idx = geom.index;
  if (!pos || pos.count < 3) return 0;

  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      volume += a.dot(b.clone().cross(c));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      volume += a.dot(b.clone().cross(c));
    }
  }

  return Math.abs(volume / 6);
}

// ============================================================
// 运算审计：判断布尔结果是否退化为空 / 退化体
// ============================================================

/**
 * 判断布尔结果的几何体是否为空（顶点数为 0 或面数为 0）。
 */
export function csgIsEmpty(brush) {
  const geom = brush.geometry;
  if (!geom) return true;
  const pos = geom.attributes.position;
  if (!pos || pos.count === 0) return true;
  if (geom.index && geom.index.count === 0) return true;
  if (!geom.index && pos.count < 3) return true;
  return false;
}

/** 返回布尔结果的面数（三角形数量） */
export function csgFaceCount(brush) {
  const geom = brush.geometry;
  if (!geom) return 0;
  if (geom.index) return geom.index.count / 3;
  const pos = geom.attributes.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}
