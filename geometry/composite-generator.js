/**
 * 组合体模型生成器。
 *
 * 将基础几何体（圆柱、圆锥、长方体等）拼接或排列成
 * 空间几何考题中常见的组合柱体造型。
 */

import * as THREE from "three";

const DEFAULT_APPEARANCE = {
  color: 0xd4a76a,
  opacity: 1.0,
  wireframeColor: 0x5c4033,
};

// ============================================================
// 通用工具
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

/**
 * 为一个 Group 添加实体 mesh 和棱线 wireframe。
 */
function addSolidAndWireframe(
  group,
  geometry,
  colorHex,
  opacity,
  wfColorHex,
  solidName = "CompositeSolid",
  wireName = "CompositeWireframe",
) {
  const mesh = new THREE.Mesh(geometry, solidMaterial(colorHex, opacity));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = solidName;
  group.add(mesh);

  const edgesGeo = new THREE.EdgesGeometry(geometry);
  const wf = new THREE.LineSegments(edgesGeo, wireframeMaterial(wfColorHex, opacity));
  wf.name = wireName;
  wf.renderOrder = 1;
  wf.material.depthTest = true;
  wf.material.depthWrite = false;
  group.add(wf);
}

/**
 * 均匀调色板 — 按索引循环取色。
 * @param {number[]} palette
 * @param {number} index
 * @param {number} fallback
 * @returns {number}
 */
function pickColor(palette, index, fallback) {
  if (!palette || palette.length === 0) return fallback;
  return palette[index % palette.length];
}

// ============================================================
// 1. 层叠圆柱（多段半径/高度不同的圆柱上下叠放）
// ============================================================

/**
 * @typedef {{ radius: number, height: number, yOffset?: number }} StackSegment
 */

/**
 * 创建层叠圆柱体。
 *
 * 每段是一个独立的圆柱 Group（含实体+棱线），按底部到顶部顺序。
 * yOffset 为段底面的绝对 Y 坐标；省略时自动紧贴前一段顶面计算。
 *
 * @param {StackSegment[]} segments - 从底到顶的段描述
 * @param {Object} [options]
 * @param {number|string} [options.color=0xd4a76a]           - 统一样式颜色
 * @param {number}        [options.opacity=1.0]               - 不透明度
 * @param {number|string} [options.wireframeColor=0x5c4033]    - 棱线颜色
 * @param {number[]}      [options.colorPalette]              - 按段分段配色
 * @returns {THREE.Group}
 */
export function createStackedCylinder(segments, options = {}) {
  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
    colorPalette,
  } = options;

  const group = new THREE.Group();
  group.name = `StackedCylinder_${segments.length}seg`;

  if (!Array.isArray(segments) || segments.length === 0) {
    group.userData = { type: "stackedCylinder", segmentCount: 0, segments: [] };
    return group;
  }

  let cumulativeY = 0;
  const usedSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const radius = Math.max(0.01, seg.radius ?? 1);
    const height = Math.max(0.01, seg.height ?? 1);
    const yOffset = seg.yOffset ?? cumulativeY;

    const segColor = colorPalette ? pickColor(colorPalette, i, color) : color;
    const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 48);

    const segGroup = new THREE.Group();
    segGroup.name = `StackSegment_${i}`;
    segGroup.position.set(0, yOffset + height / 2, 0);

    addSolidAndWireframe(segGroup, cylGeo, segColor, opacity, wireframeColor);

    // 段顶面的接缝环（当上下半径不同时可见）
    if (i < segments.length - 1) {
      const nextRadius = Math.max(0.01, segments[i + 1].radius ?? 1);
      if (Math.abs(radius - nextRadius) > 1e-9) {
        const ringGeo = new THREE.RingGeometry(
          Math.min(radius, nextRadius),
          Math.max(radius, nextRadius),
          64,
        );
        ringGeo.rotateX(-Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, solidMaterial(segColor, opacity));
        ringMesh.position.y = -height / 2;
        ringMesh.name = `StackRing_${i}`;
        ringMesh.castShadow = true;
        ringMesh.receiveShadow = true;
        segGroup.add(ringMesh);
      }
    }

    group.add(segGroup);
    cumulativeY = yOffset + height;
    usedSegments.push({ radius, height, yOffset, color: segColor });
  }

  // 包围盒
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;
  for (const s of usedSegments) {
    minY = Math.min(minY, s.yOffset);
    maxY = Math.max(maxY, s.yOffset + s.height);
    maxR = Math.max(maxR, s.radius);
  }

  group.userData = {
    type: "stackedCylinder",
    segmentCount: segments.length,
    segments: usedSegments,
    bbox: { minX: -maxR, maxX: maxR, minY, maxY, minZ: -maxR, maxZ: maxR },
  };

  return group;
}

// ============================================================
// 2. 锥柱组合体（圆柱上方衔接圆锥）
// ============================================================

/**
 * 创建圆锥顶圆柱体（火箭/锥形瓶造型）。
 *
 * @param {Object} body - 圆柱体参数
 * @param {number} body.radius - 圆柱半径
 * @param {number} body.height - 圆柱高度
 * @param {Object} cap - 圆锥体参数
 * @param {number} cap.radius - 锥底半径（默认等于 body.radius）
 * @param {number} cap.height - 锥高
 * @param {Object} [options]
 * @param {number|string} [options.bodyColor=0xd4a76a]       - 柱体颜色
 * @param {number|string} [options.capColor=0xd4a76a]        - 锥体颜色
 * @param {number}        [options.opacity=1.0]
 * @param {number|string} [options.wireframeColor=0x5c4033]
 * @returns {THREE.Group}
 */
export function createConeTopCylinder(body, cap, options = {}) {
  const {
    bodyColor = DEFAULT_APPEARANCE.color,
    capColor = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
  } = options;

  const bodyRadius = Math.max(0.01, body.radius ?? 1);
  const bodyHeight = Math.max(0.01, body.height ?? 1);
  const capRadius = Math.max(0.01, cap.radius ?? bodyRadius);
  const capHeight = Math.max(0.01, cap.height ?? 1);

  const group = new THREE.Group();
  group.name = "ConeTopCylinder";

  // 圆柱 — 底面在 y=0
  const cylGroup = new THREE.Group();
  cylGroup.name = "ConeTopBody";
  const cylGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 48);
  cylGroup.position.y = bodyHeight / 2;
  addSolidAndWireframe(cylGroup, cylGeo, bodyColor, opacity, wireframeColor);
  group.add(cylGroup);

  // 圆锥 — 底面紧贴圆柱顶面
  const coneGroup = new THREE.Group();
  coneGroup.name = "ConeTopCap";
  const coneGeo = new THREE.ConeGeometry(capRadius, capHeight, 48);
  coneGroup.position.y = bodyHeight + capHeight / 2;
  addSolidAndWireframe(coneGroup, coneGeo, capColor, opacity, wireframeColor);
  group.add(coneGroup);

  // 交界环（当锥底半径与柱顶半径不同时）
  if (Math.abs(bodyRadius - capRadius) > 1e-9) {
    const ringGeo = new THREE.RingGeometry(
      Math.min(bodyRadius, capRadius),
      Math.max(bodyRadius, capRadius),
      64,
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, solidMaterial(bodyColor, opacity));
    ring.name = "ConeTopRing";
    ring.position.y = bodyHeight;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
  }

  const maxR = Math.max(bodyRadius, capRadius);
  const totalH = bodyHeight + capHeight;

  group.userData = {
    type: "coneTopCylinder",
    body: { radius: bodyRadius, height: bodyHeight },
    cap: { radius: capRadius, height: capHeight },
    bbox: { minX: -maxR, maxX: maxR, minY: 0, maxY: totalH, minZ: -maxR, maxZ: maxR },
  };

  return group;
}

// ============================================================
// 3. 双锥组合体（两个圆锥底对底）
// ============================================================

/**
 * 创建双锥体（沙漏型 / 菱形截面旋转体）。
 *
 * @param {number} bottomRadius  - 下方圆锥底半径
 * @param {number} bottomHeight  - 下方圆锥高度
 * @param {number} topRadius     - 上方圆锥底半径
 * @param {number} topHeight     - 上方圆锥高度
 * @param {Object} [options]
 * @returns {THREE.Group}
 */
export function createDoubleCone(bottomRadius, bottomHeight, topRadius, topHeight, options = {}) {
  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
  } = options;

  const bR = Math.max(0.01, bottomRadius ?? 1);
  const bH = Math.max(0.01, bottomHeight ?? 1);
  const tR = Math.max(0.01, topRadius ?? 1);
  const tH = Math.max(0.01, topHeight ?? 1);

  const group = new THREE.Group();
  group.name = "DoubleCone";

  // 下锥（锥顶在下）
  const bottomGroup = new THREE.Group();
  bottomGroup.name = "DoubleConeBottom";
  const bottomGeo = new THREE.ConeGeometry(bR, bH, 48);
  bottomGroup.position.y = bH / 2;
  addSolidAndWireframe(bottomGroup, bottomGeo, color, opacity, wireframeColor);
  group.add(bottomGroup);

  // 上锥（锥顶在上）
  const topGroup = new THREE.Group();
  topGroup.name = "DoubleConeTop";
  const topGeo = new THREE.ConeGeometry(tR, tH, 48);
  topGroup.position.y = bH + tH / 2;
  addSolidAndWireframe(topGroup, topGeo, color, opacity, wireframeColor);
  group.add(topGroup);

  // 交界环
  if (Math.abs(bR - tR) > 1e-9) {
    const ringGeo = new THREE.RingGeometry(Math.min(bR, tR), Math.max(bR, tR), 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, solidMaterial(color, opacity));
    ring.name = "DoubleConeRing";
    ring.position.y = bH;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
  }

  const maxR = Math.max(bR, tR);
  const totalH = bH + tH;

  group.userData = {
    type: "doubleCone",
    bottom: { radius: bR, height: bH },
    top: { radius: tR, height: tH },
    bbox: { minX: -maxR, maxX: maxR, minY: 0, maxY: totalH, minZ: -maxR, maxZ: maxR },
  };

  return group;
}

// ============================================================
// 4. 圆台体（截头圆锥）
// ============================================================

/**
 * 创建圆台体（截头圆锥 frustum）。
 *
 * @param {number} bottomRadius - 底面半径
 * @param {number} topRadius    - 顶面半径
 * @param {number} height       - 高度
 * @param {Object} [options]
 * @returns {THREE.Group}
 */
export function createFrustum(bottomRadius, topRadius, height, options = {}) {
  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
  } = options;

  const bR = Math.max(0.01, bottomRadius ?? 1);
  const tR = Math.max(0.01, topRadius ?? 1);
  const h = Math.max(0.01, height ?? 1);

  const geo = new THREE.CylinderGeometry(tR, bR, h, 48);

  const group = new THREE.Group();
  group.name = "Frustum";
  group.position.y = h / 2;

  addSolidAndWireframe(group, geo, color, opacity, wireframeColor);

  const maxR = Math.max(bR, tR);

  group.userData = {
    type: "frustum",
    bottomRadius: bR,
    topRadius: tR,
    height: h,
    bbox: { minX: -maxR, maxX: maxR, minY: 0, maxY: h, minZ: -maxR, maxZ: maxR },
  };

  return group;
}

// ============================================================
// 5. 半圆柱 + 长方体底座
// ============================================================

/**
 * 创建半圆柱长方体底座组合体。
 *
 * 半圆柱的矩形面贴合在长方体顶部中心。
 *
 * @param {number} cylRadius   - 半圆柱半径
 * @param {number} cylLength   - 半圆柱长度（Z 方向）
 * @param {number} boxWidth    - 底座宽（X）
 * @param {number} boxHeight   - 底座高（Y）
 * @param {number} boxDepth    - 底座深（Z）
 * @param {Object} [options]
 * @returns {THREE.Group}
 */
export function createHalfCylinderOnBox(
  cylRadius, cylLength, boxWidth, boxHeight, boxDepth,
  options = {},
) {
  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
  } = options;

  const r = Math.max(0.01, cylRadius ?? 1);
  const cl = Math.max(0.01, cylLength ?? 2);
  const bw = Math.max(0.01, boxWidth ?? 2);
  const bh = Math.max(0.01, boxHeight ?? 1);
  const bd = Math.max(0.01, boxDepth ?? 2);

  const group = new THREE.Group();
  group.name = "HalfCylinderOnBox";

  // 长方体底座
  const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
  const boxGroup = new THREE.Group();
  boxGroup.name = "HalfCylBox";
  boxGroup.position.y = bh / 2;
  addSolidAndWireframe(boxGroup, boxGeo, color, opacity, wireframeColor);
  group.add(boxGroup);

  // 半圆柱 — 使用完整的圆柱 + 上半裁剪（clipPlanes）
  const cylGeo = new THREE.CylinderGeometry(r, r, cl, 48, 1, false, 0, Math.PI);
  // CylinderGeometry 默认绕 Y 轴，底面在 -height/2。旋转使圆柱横放（Z 轴）
  cylGeo.rotateX(Math.PI / 2);

  const cylGroup = new THREE.Group();
  cylGroup.name = "HalfCyl";
  // 平放在底座顶面，中心对齐
  cylGroup.position.set(0, bh + r, 0);

  addSolidAndWireframe(cylGroup, cylGeo, color, opacity, wireframeColor);
  group.add(cylGroup);

  const maxR = Math.max(r, bw / 2, bd / 2);
  const totalH = bh + r * 2;

  group.userData = {
    type: "halfCylinderOnBox",
    cylinder: { radius: r, length: cl },
    box: { width: bw, height: bh, depth: bd },
    bbox: { minX: -maxR, maxX: maxR, minY: 0, maxY: totalH, minZ: -maxR, maxZ: maxR },
  };

  return group;
}

// ============================================================
// 6. 等距排列的柱阵列
// ============================================================

/**
 * 创建等距排列的圆柱阵列（如管束、柱群）。
 *
 * @param {number} radius  - 每个圆柱半径
 * @param {number} height  - 每个圆柱高度
 * @param {number} rows    - 行数（X 方向）
 * @param {number} cols    - 列数（Z 方向）
 * @param {number} spacing - 中心距
 * @param {Object} [options]
 * @returns {THREE.Group}
 */
export function createCylinderArray(radius, height, rows, cols, spacing, options = {}) {
  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
  } = options;

  const r = Math.max(0.01, radius ?? 0.5);
  const h = Math.max(0.01, height ?? 2);
  const nRows = Math.max(1, rows ?? 2);
  const nCols = Math.max(1, cols ?? 2);
  const sp = Math.max(2 * r + 0.01, spacing ?? 2);

  const group = new THREE.Group();
  group.name = `CylinderArray_${nRows}x${nCols}`;

  const cylGeo = new THREE.CylinderGeometry(r, r, h, 32);
  const offsetX = (nRows - 1) * sp / 2;
  const offsetZ = (nCols - 1) * sp / 2;

  for (let ri = 0; ri < nRows; ri++) {
    for (let ci = 0; ci < nCols; ci++) {
      const cylGroup = new THREE.Group();
      cylGroup.name = `ArrayCyl_${ri}_${ci}`;
      cylGroup.position.set(ri * sp - offsetX, h / 2, ci * sp - offsetZ);
      addSolidAndWireframe(cylGroup, cylGeo.clone(), color, opacity, wireframeColor);
      group.add(cylGroup);
    }
  }

  const halfW = (nRows - 1) * sp / 2 + r;
  const halfD = (nCols - 1) * sp / 2 + r;

  group.userData = {
    type: "cylinderArray",
    radius: r,
    height: h,
    rows: nRows,
    cols: nCols,
    spacing: sp,
    bbox: {
      minX: -halfW, maxX: halfW,
      minY: 0, maxY: h,
      minZ: -halfD, maxZ: halfD,
    },
  };

  return group;
}

// ============================================================
// 7. 通用外观工具
// ============================================================

/**
 * 递归遍历 Group，替换所有 MeshStandardMaterial 的颜色。
 * 用于对已构建的组合体统一改色。
 *
 * @param {THREE.Group} group
 * @param {number|string} colorHex
 */
export function recolorAssembly(group, colorHex) {
  group.traverse((child) => {
    if (child.isMesh && child.material?.isMeshStandardMaterial) {
      child.material.color.set(colorHex);
    }
  });
}

/**
 * 计算组合体的包围盒，对齐地面 y=0。
 *
 * @param {THREE.Group} group
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }}
 */
export function computeAssemblyBBox(group) {
  group.updateMatrixWorld(true);
  const bbox = new THREE.Box3();
  group.traverse((child) => {
    if (child.isMesh) {
      bbox.expandByObject(child);
    }
  });

  if (bbox.isEmpty()) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }

  return {
    minX: bbox.min.x, maxX: bbox.max.x,
    minY: bbox.min.y, maxY: bbox.max.y,
    minZ: bbox.min.z, maxZ: bbox.max.z,
  };
}
