import * as THREE from "/node_modules/three/build/three.module.js";
import earcut from "/node_modules/earcut/src/earcut.js";

/**
 * 创建可重复更新的截面封口与轮廓。
 *
 * 渲染管线（最小改动原则）：
 *   原始 3D 顶点 → 沿法向偏移(z-fighting防护)
 *     → 投影到平面局部 2D(仅用于耳切法输入)
 *       → earcut 三角化(支持凹多边形)
 *         → 用三角索引回写原始 3D 顶点
 *           → BufferGeometry
 *
 * 关键不变量：3D 顶点坐标全程不变，仅改变三角化索引。
 */
export function createSectionVisual({
  fillColor = 0xf2b84b,
  outlineColor = 0xc1523b,
  fillOpacity = 0.58,
  surfaceOffset = 0.001, // 恢复原始值（之前改成 0.0001 导致 z-fighting）
} = {}) {
  const group = new THREE.Group();
  group.name = "LiveSectionVisual";
  group.visible = false;

  const fillMaterial = new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity: fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: outlineColor,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(emptyGeometry(), fillMaterial);
  const outline = new THREE.Line(emptyGeometry(), outlineMaterial);
  fill.name = "SectionFill";
  outline.name = "SectionOutline";
  fill.renderOrder = 4;
  outline.renderOrder = 5;
  group.add(fill, outline);

  function clear() {
    fill.geometry.dispose();
    outline.geometry.dispose();
    fill.geometry = emptyGeometry();
    outline.geometry = emptyGeometry();
    group.visible = false;
    group.userData = {
      status: "empty",
      vertexCount: 0,
      area: 0,
    };
  }

  /**
   * 核心更新函数 — 仅替换三角化方式为 earcut（支持凹多边形）。
   *
   * 与原始代码的唯一区别：
   *   原始：扇形三角化 indices=[0,1,2],[0,2,3],...  （仅凸形正确）
   *   现在：earcut 耳切法                               （任意简单多边形正确）
   *
   * 3D 坐标、偏移量、材质等全部保持与原始代码一致。
   */
  function update(polygon) {
    if (polygon?.status !== "polygon" || polygon.points.length < 3) {
      clear();
      return false;
    }

    // ── 1. 沿法向偏移（z-fighting 防护）—— 与原始代码完全一致 ──
    const offset = Number.isFinite(surfaceOffset) ? surfaceOffset : 0.001;
    const displayPoints = polygon.points.map((point) =>
      point.clone().addScaledVector(polygon.normal, offset)
    );

    // ── 2. 构造局部 2D 基（仅用于 earcut 投影） ──
    const { u, v } = polygon.basis || makeOrthoBasis(polygon.normal);

    // ── 3. 投影到 2D（纯数值投影，不改坐标） ──
    const flatCoords = displayPoints.map((p) => [p.dot(u), p.dot(v)]);

    // ── 4. earcut 三角化（Mapbox 出品，稳定支持凹/凸多边形） ──
    let nextFillGeometry;
    try {
      const triangles = earcut(flatCoords);

      if (!triangles || triangles.length < 3) {
        throw new Error("earcut 未产出有效三角形");
      }

      // 用 earcat 索引 + 原始 3D 坐标构建 BufferGeometry
      const positions = new Float32Array(triangles.length * 3);
      for (let ti = 0; ti < triangles.length; ti++) {
        const vi = triangles[ti];
        const vec = displayPoints[vi];
        positions[ti * 3] = vec.x;
        positions[ti * 3 + 1] = vec.y;
        positions[ti * 3 + 2] = vec.z;
      }

      nextFillGeometry = new THREE.BufferGeometry();
      nextFillGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      nextFillGeometry.computeVertexNormals();
    } catch (triErr) {
      // earcut 失败时降级为原始扇形三角化（保证不白屏）
      console.warn("earcut 三角化失败，降级为扇形:", triErr.message);
      const indices = [];
      for (let i = 1; i < displayPoints.length - 1; i++) {
        indices.push(0, i, i + 1);
      }
      nextFillGeometry = new THREE.BufferGeometry().setFromPoints(displayPoints);
      nextFillGeometry.setIndex(indices);
      nextFillGeometry.computeVertexNormals();
    }

    // ── 5. 轮廓线 —— 与原始代码完全一致 ──
    const closedDisplayPoints = [...displayPoints, displayPoints[0].clone()];
    const nextOutlineGeometry = new THREE.BufferGeometry().setFromPoints(closedDisplayPoints);

    // ── 6. 应用到 mesh ──
    fill.geometry.dispose();
    outline.geometry.dispose();
    fill.geometry = nextFillGeometry;
    outline.geometry = nextOutlineGeometry;
    group.visible = true;
    group.userData = {
      status: "visible",
      vertexCount: displayPoints.length,
      area: polygon.signedArea,
    };
    return true;
  }

  function dispose() {
    fill.geometry.dispose();
    outline.geometry.dispose();
    fillMaterial.dispose();
    outlineMaterial.dispose();
  }

  clear();

  return Object.freeze({
    group,
    fill,
    outline,
    update,
    clear,
    dispose,
  });
}

// ── 辅助函数 ──

function emptyGeometry() {
  return new THREE.BufferGeometry();
}

/** 从法向量构造正交基（polygon.basis 缺失时的 fallback） */
function makeOrthoBasis(normal) {
  const ref = Math.abs(normal.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const u = ref.clone().cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  return { u, v };
}
