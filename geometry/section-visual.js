import * as THREE from "/node_modules/three/build/three.module.js";

function emptyGeometry() {
  return new THREE.BufferGeometry();
}

/**
 * 创建可重复更新的截面封口与轮廓。
 * 输入顶点使用世界坐标，因此该组应直接加入主场景且保持单位变换。
 */
export function createSectionVisual({
  fillColor = 0xf2b84b,
  outlineColor = 0xc1523b,
  fillOpacity = 0.58,
  surfaceOffset = 0.001,
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

  function update(polygon) {
    if (polygon?.status !== "polygon" || polygon.points.length < 3) {
      clear();
      return false;
    }

    const offset = Number.isFinite(surfaceOffset) ? surfaceOffset : 0.001;
    const displayPoints = polygon.points.map((point) => (
      point.clone().addScaledVector(polygon.normal, offset)
    ));
    const closedDisplayPoints = [...displayPoints, displayPoints[0].clone()];
    const indices = [];
    for (let index = 1; index < displayPoints.length - 1; index += 1) {
      indices.push(0, index, index + 1);
    }

    const nextFillGeometry = new THREE.BufferGeometry().setFromPoints(displayPoints);
    nextFillGeometry.setIndex(indices);
    nextFillGeometry.computeVertexNormals();
    const nextOutlineGeometry = new THREE.BufferGeometry().setFromPoints(closedDisplayPoints);
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
