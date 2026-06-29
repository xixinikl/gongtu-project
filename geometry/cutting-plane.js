import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_NORMAL = new THREE.Vector3(1, 0, 0);
const LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);

function createPlaneTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  const glow = context.createRadialGradient(256, 256, 30, 256, 256, 256);
  glow.addColorStop(0, "rgba(193, 82, 59, 0.28)");
  glow.addColorStop(0.65, "rgba(193, 82, 59, 0.13)");
  glow.addColorStop(1, "rgba(193, 82, 59, 0.015)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 512, 512);

  context.strokeStyle = "rgba(193, 82, 59, 0.2)";
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

  context.strokeStyle = "rgba(153, 55, 37, 0.65)";
  context.lineWidth = 3;
  context.strokeRect(2, 2, 508, 508);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCuttingPlane({ size = 7 } = {}) {
  const safeSize = Math.max(1, Number.isFinite(size) ? size : 7);
  const plane = new THREE.Plane(DEFAULT_NORMAL.clone(), 0);
  const texture = createPlaneTexture();
  const geometry = new THREE.PlaneGeometry(safeSize, safeSize);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const visual = new THREE.Mesh(geometry, material);
  visual.name = "InfiniteCuttingPlaneVisual";
  visual.renderOrder = 3;
  visual.userData = {
    mathematicalExtent: "infinite",
    visualSize: safeSize,
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
