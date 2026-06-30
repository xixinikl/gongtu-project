/**
 * view-controller — 预设视角切换（前后左右俯仰）
 * 依赖 geometryLab (scene.js 暴露的全局单例)
 */

const VIEW_PRESETS = Object.freeze({
  perspective: {
    label: "透视",
    position: [5.4, 4.2, 6.8],
    target: [0, 0.35, 0],
  },
  front: {
    label: "正视",
    position: [0, 0.35, 5.5],
    target: [0, 0.35, 0],
  },
  back: {
    label: "后视",
    position: [0, 0.35, -5.5],
    target: [0, 0.35, 0],
  },
  left: {
    label: "左视",
    position: [-5.5, 0.35, 0],
    target: [0, 0.35, 0],
  },
  right: {
    label: "右视",
    position: [5.5, 0.35, 0],
    target: [0, 0.35, 0],
  },
  top: {
    label: "俯视",
    position: [0, 5.5, 0.01],
    target: [0, 0.35, 0],
  },
  bottom: {
    label: "仰视",
    position: [0, -4.8, 0.01],
    target: [0, 0.35, 0],
  },
});

const ANIMATION_DURATION = 420; // ms
const EASING = (t) => 1 - (1 - t) * (1 - t); // ease-out quad

let currentView = "perspective";
let animationId = null;

/**
 * 平滑过渡摄像机到预设视角
 * @param {"perspective"|"front"|"back"|"left"|"right"|"top"|"bottom"} viewKey
 * @param {object} lab   geometryLab 实例
 */
export function switchToView(viewKey, lab) {
  const preset = VIEW_PRESETS[viewKey];
  if (!preset) return;
  if (!lab || !lab.camera || !lab.controls || !lab.THREE) return;

  cancelAnimation(animationId);

  const { camera, controls } = lab;
  const THREE = lab.THREE;

  const startPos = camera.position.clone();
  const startTgt = controls.target.clone();
  const endPos = new THREE.Vector3(...preset.position);
  const endTgt = new THREE.Vector3(...preset.target);

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / ANIMATION_DURATION, 1);
    const e = EASING(t);

    camera.position.lerpVectors(startPos, endPos, e);
    controls.target.lerpVectors(startTgt, endTgt, e);
    controls.update();

    if (t < 1) {
      animationId = requestAnimationFrame(step);
    } else {
      animationId = null;
      updateButtonState(viewKey);
    }
  }

  animationId = requestAnimationFrame(step);
}

/**
 * 切换至预设视角，并返回对应 key（供按钮事件分发）
 */
export function switchToLabel(label, lab) {
  const entry = Object.entries(VIEW_PRESETS).find(([, v]) => v.label === label);
  if (entry) {
    switchToView(entry[0], lab);
    return entry[0];
  }
  return null;
}

/** 更新按钮 aria-pressed 状态 */
function updateButtonState(viewKey) {
  const label = VIEW_PRESETS[viewKey]?.label;
  if (!label) return;
  document.querySelectorAll(".view-button").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.textContent.trim() === label ? "true" : "false");
  });
  currentView = viewKey;
}

/** 获取当前活跃视角 key */
export function getCurrentView() {
  return currentView;
}

/** 取消正在进行的动画 */
function cancelAnimation(id) {
  if (id != null) {
    cancelAnimationFrame(id);
  }
}
