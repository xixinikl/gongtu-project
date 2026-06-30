import * as THREE from "/node_modules/three/build/three.module.js";

export const DEFAULT_NORMAL = new THREE.Vector3(0, 1, 0);
const LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);

/**
 * 根据模型包围盒和切面法向量计算视觉刀面的自适应尺寸。
 * 将包围盒八个顶点投影到切面局部二维坐标系（u,v）中，
 * 取投影轴向最大跨度 × scaleFactor 作为视觉刀面边长。
 * 这样可以正确处理倾斜切面下高窄模型的 Y 分量。
 * @param {THREE.Box3|null} bounds 模型世界包围盒
 * @param {THREE.Vector3}  planeNormal 当前切面法向量（世界坐标）
 * @param {number}          scaleFactor 缩放系数，推荐 1.15–1.35
 * @returns {number} 视觉刀面的边长
 */
export function computeCutPlaneVisualSize(bounds, planeNormal, scaleFactor = 1.25) {
  if (!bounds || !bounds.isBox3) return 7;

  const normal = (planeNormal?.isVector3 && planeNormal.lengthSq() > 1e-9)
    ? planeNormal.clone().normalize()
    : this?.DEFAULT_NORMAL?.clone?.() ?? new THREE.Vector3(0, 1, 0);

  // 构建切面局部二维正交基 (u, v)
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(normal.dot(u)) > 0.99) {
    u.set(0, 0, 1);
  }
  u.sub(normal.clone().multiplyScalar(normal.dot(u))).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  // 包围盒八个顶点投影到切面局部坐标 (u·corner, v·corner)
  const { min, max } = bounds;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const corner of corners) {
    const uCoord = corner.dot(u);
    const vCoord = corner.dot(v);
    if (uCoord < minU) minU = uCoord;
    if (uCoord > maxU) maxU = uCoord;
    if (vCoord < minV) minV = vCoord;
    if (vCoord > maxV) maxV = vCoord;
  }

  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const maxSpan = Math.max(spanU, spanV);
  if (!Number.isFinite(maxSpan) || maxSpan < 0.01) return 7;
  return +(maxSpan * scaleFactor).toFixed(2);
}

/**
 * 根据模型包围盒、切面法向量和当前切面偏移计算视觉刀面中心（世界坐标）。
 * 先将包围盒八个顶点投影到切面局部二维坐标系 (u,v)，取轴向范围中点；
 * 转换回世界坐标后，加上法向位移 normal * (-planeConstant)，
 * 确保视觉刀面跟随滑块位移而非停留在原点平面。
 * @param {THREE.Box3|null} bounds 模型世界包围盒
 * @param {THREE.Vector3}  planeNormal 当前切面法向量（世界坐标）
 * @param {THREE.Plane|number} planeOrConstant THREE.Plane 实例或 plane.constant 值
 * @returns {THREE.Vector3|null} 世界空间中的投影中心（含法向位移），或 null
 */
export function computeCutPlaneVisualCenter(bounds, planeNormal, planeOrConstant) {
  if (!bounds || !bounds.isBox3) return null;

  const normal = (planeNormal?.isVector3 && planeNormal.lengthSq() > 1e-9)
    ? planeNormal.clone().normalize()
    : DEFAULT_NORMAL.clone();

  // 构建切面局部二维正交基 (u, v) —— 与 computeCutPlaneVisualSize 一致
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(normal.dot(u)) > 0.99) {
    u.set(0, 0, 1);
  }
  u.sub(normal.clone().multiplyScalar(normal.dot(u))).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  const { min, max } = bounds;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const corner of corners) {
    const uCoord = corner.dot(u);
    const vCoord = corner.dot(v);
    if (uCoord < minU) minU = uCoord;
    if (uCoord > maxU) maxU = uCoord;
    if (vCoord < minV) minV = vCoord;
    if (vCoord > maxV) maxV = vCoord;
  }

  const centerU = (minU + maxU) / 2;
  const centerV = (minV + maxV) / 2;
  const inPlaneCenter = u.multiplyScalar(centerU).add(v.multiplyScalar(centerV));

  // 提取 plane.constant：支持传入 THREE.Plane 实例或直接传入数值
  const planeConstant = (planeOrConstant?.isPlane)
    ? planeOrConstant.constant
    : (Number.isFinite(planeOrConstant) ? planeOrConstant : 0);

  // 加上法向位移 normal * (-planeConstant)，使视觉刀面跟随切面偏移
  return inPlaneCenter.add(normal.multiplyScalar(-planeConstant));
}

/**
 * 根据目标尺寸更新视觉刀面的缩放。
 * 保持几何体不变，仅调整 mesh.scale 使视觉刀面包围模型附近。
 * @param {THREE.Mesh} visual 视觉刀面 Mesh
 * @param {number} targetSize 目标边长
 */
export function resizeCutPlaneVisual(visual, targetSize) {
  if (!visual || !Number.isFinite(targetSize) || targetSize <= 0) return;
  const unitSize = visual.userData?.unitSize ?? 7;
  visual.scale.setScalar(targetSize / unitSize);
  visual.userData.visualSize = targetSize;
}

/**
 * 根据模型 Y 轴包围盒计算切面滑块范围。
 * @param {number} boxMinY 模型世界 Y 最小值
 * @param {number} boxMaxY 模型世界 Y 最大值
 * @param {number} pad 模型外延 padding
 * @returns {{ min: number, max: number, initial: number }|null}
 */
export function calculateCutSliderRange(boxMinY, boxMaxY, pad = 1.0) {
  if (!Number.isFinite(boxMinY) || !Number.isFinite(boxMaxY)) return null;
  if (boxMinY > boxMaxY) return null;
  const min = +(boxMinY - pad).toFixed(2);
  const max = +(boxMaxY + pad).toFixed(2);
  const initial = +boxMaxY.toFixed(2);
  return { min, max, initial };
}

function createPlaneTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  const glow = context.createRadialGradient(256, 256, 30, 256, 256, 256);
  glow.addColorStop(0, "rgba(193, 82, 59, 0.08)");
  glow.addColorStop(0.65, "rgba(193, 82, 59, 0.04)");
  glow.addColorStop(1, "rgba(193, 82, 59, 0.005)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 512, 512);

  context.strokeStyle = "rgba(193, 82, 59, 0.22)";
  context.lineWidth = 1;
  for (let coordinate = 32; coordinate < 512; coordinate += 32) {
    context.beginPath();
    context.moveTo(coordinate, 0);
    context.lineTo(coordinate, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, coordinate);
    context.lineTo(512, coordinate);
    context.stroke();
  }

  context.strokeStyle = "rgba(153, 55, 37, 0.25)";
  context.lineWidth = 3;
  context.strokeRect(2, 2, 508, 508);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCuttingPlane({ size = 5 } = {}) {
  const safeSize = Math.max(1, Number.isFinite(size) ? size : 5);
  const plane = new THREE.Plane(DEFAULT_NORMAL.clone(), 0);
  const texture = createPlaneTexture();
  const geometry = new THREE.PlaneGeometry(safeSize, safeSize);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const visual = new THREE.Mesh(geometry, material);
  visual.name = "InfiniteCuttingPlaneVisual";
  visual.renderOrder = 3;
  visual.userData = {
    mathematicalExtent: "infinite",
    visualSize: safeSize,
    unitSize: safeSize,
  };

  function syncVisual() {
    visual.quaternion.setFromUnitVectors(LOCAL_NORMAL, plane.normal);
    visual.position.copy(plane.normal).multiplyScalar(-plane.constant);
  }

  function setPlane(normal, offset = 0) {
    const safeNormal = normal?.isVector3 ? normal.clone() : DEFAULT_NORMAL.clone();
    if (safeNormal.lengthSq() < Number.EPSILON) {
      safeNormal.copy(DEFAULT_NORMAL);
    }
    safeNormal.normalize();
    plane.set(safeNormal, Number.isFinite(offset) ? -offset : 0);
    syncVisual();
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  syncVisual();

  return Object.freeze({
    plane,
    visual,
    setPlane,
    dispose,
  });
}
