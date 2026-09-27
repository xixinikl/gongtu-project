import * as THREE from "/node_modules/three/build/three.module.js";

const VALID_MODES = new Set(["hidden", "transparent"]);

/**
 * 使用源模型的共享几何和独立材质，显示被切除一侧的半透明镜像。
 * 几何由源模型拥有，本模块只释放自己克隆的材质。
 */
export function createCutawayVisual({ opacity = 0.16 } = {}) {
  const group = new THREE.Group();
  group.name = "CutawayGhostVisual";
  group.visible = false;
  const reversePlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const ownedMaterials = new Set();
  let source = null;
  let ghost = null;
  let mode = "hidden";

  function disposeOwnedMaterials() {
    ownedMaterials.forEach((material) => material.dispose());
    ownedMaterials.clear();
  }

  function clear() {
    if (ghost) group.remove(ghost);
    ghost = null;
    source = null;
    group.visible = false;
    disposeOwnedMaterials();
    group.userData = { mode, visible: false };
  }

  function cloneMaterial(material) {
    const cloned = material.clone();
    cloned.transparent = true;
    cloned.opacity = Math.min(
      Number.isFinite(opacity) ? Math.max(0.02, opacity) : 0.16,
      material.opacity,
    );
    cloned.depthWrite = false;
    cloned.clippingPlanes = [reversePlane];
    cloned.clipShadows = false;
    cloned.needsUpdate = true;
    ownedMaterials.add(cloned);
    return cloned;
  }

  function setSource(nextSource) {
    if (source === nextSource) return;
    clear();
    if (!nextSource?.isObject3D) return;
    source = nextSource;
    ghost = nextSource.clone(true);
    ghost.name = `${nextSource.name || "Model"}_CutawayGhost`;
    ghost.traverse((object) => {
      object.castShadow = false;
      object.receiveShadow = false;
      if (!object.material) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    });
    group.add(ghost);
    group.visible = mode === "transparent";
    group.userData = { mode, visible: group.visible };
  }

  function setPlane(plane) {
    if (!plane?.isPlane || plane.normal.lengthSq() === 0) {
      throw new TypeError("plane must be a THREE.Plane with a non-zero normal");
    }
    reversePlane.copy(plane).negate();
  }

  function setMode(nextMode) {
    if (!VALID_MODES.has(nextMode)) {
      throw new RangeError(`unsupported cutaway mode: ${nextMode}`);
    }
    mode = nextMode;
    group.visible = mode === "transparent" && Boolean(ghost);
    group.userData = { mode, visible: group.visible };
  }

  function dispose() {
    clear();
  }

  return Object.freeze({
    group,
    reversePlane,
    setSource,
    setPlane,
    setMode,
    clear,
    dispose,
    get source() {
      return source;
    },
    get ghost() {
      return ghost;
    },
    get mode() {
      return mode;
    },
  });
}
