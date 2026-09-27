import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ADDITION, Brush, Evaluator } from "three-bvh-csg";
import {
  computeSectionV2,
  toSectionVisualV2Data,
} from "./geometry/section-engine-v2.js";
import { createSectionVisualV2 } from "./geometry/section-visual-v2.js";
import {
  createLessonState,
  publicLessonState,
  transitionLesson,
} from "./geometry/lesson-state-machine.js";
import {
  interpolateTeachingFrame,
  transitionProgress,
} from "./geometry/lesson-timeline.js";

const CASE_URLS = {
  "cone-box-001": "/data/reasoning-cases/cone-box-001.json",
  "pyramid-cylinder-001":
    "/data/reasoning-cases/pyramid-cylinder-001.json",
};

const DRAFT_CASE_INDEX_URL =
  "/data/reasoning-cases/draft-video-questions.json";

const MODEL_APPEARANCE = {
  color: 0xe0b36f,
  opacity: 0.38,
  wireframe: 0x263746,
};

const elements = {
  answer: document.querySelector("#answer-display"),
  canvas: document.querySelector("#lesson-canvas"),
  caseSelect: document.querySelector("#case-select"),
  candidatePreview: document.querySelector(".candidate-preview"),
  candidatePreviewDrawing: document.querySelector("#candidate-preview-drawing"),
  candidatePreviewMeta: document.querySelector("#candidate-preview-meta"),
  candidatePreviewStatus: document.querySelector("#candidate-preview-status"),
  candidatePreviewTitle: document.querySelector("#candidate-preview-title"),
  constraints: document.querySelector("#constraint-list"),
  engineStatus: document.querySelector("#engine-status"),
  explore: document.querySelector("#explore-toggle"),
  foundationNote: document.querySelector("#foundation-note"),
  foundationNoteCopy: document.querySelector("#foundation-note-copy"),
  loading: document.querySelector("#viewport-loading"),
  next: document.querySelector("#next-step"),
  optionList: document.querySelector("#option-list"),
  planeAngleOutput: document.querySelector("#plane-angle-output"),
  planeArrows: [...document.querySelectorAll("[data-plane-direction]")],
  planeLiveStatus: document.querySelector("#plane-live-status"),
  planeLiveSummary: document.querySelector("#plane-live-summary"),
  planePosition: document.querySelector("#plane-position"),
  planePositionOutput: document.querySelector("#plane-position-output"),
  play: document.querySelector("#play-lesson"),
  previous: document.querySelector("#previous-step"),
  prompt: document.querySelector("#question-prompt"),
  questionHeading: document.querySelector("#question-heading"),
  reasoningCaption: document.querySelector("#reasoning-caption"),
  reasoningHeading: document.querySelector("#reasoning-heading"),
  resetView: document.querySelector("#reset-view"),
  shapeComparison: document.querySelector("#shape-comparison"),
  shapeComparisonActual: document.querySelector("#comparison-actual"),
  shapeComparisonCandidate: document.querySelector("#comparison-candidate"),
  shapeComparisonCopy: document.querySelector("#shape-comparison-copy"),
  shapeComparisonResult: document.querySelector("#shape-comparison-result"),
  sectionPreviewMeta: document.querySelector("#section-preview-meta"),
  sectionPreviewStatus: document.querySelector("#section-preview-status"),
  sectionPreviewSvg: document.querySelector("#section-preview-svg"),
  sourceFigure: document.querySelector("#source-figure"),
  sourceNote: document.querySelector("#case-source-note"),
  stepCounter: document.querySelector("#step-counter"),
  timelineProgress: document.querySelector("#timeline-progress"),
  verdictCard: document.querySelector("#verdict-card"),
  verdictLabel: document.querySelector("#verdict-label"),
  verdictReason: document.querySelector("#verdict-reason"),
  verdictTitle: document.querySelector("#verdict-title"),
};

const state = {
  caseData: null,
  currentKeyframe: 0,
  selectedOptionId: null,
  exploring: false,
  playing: false,
  playTimer: null,
  machine: null,
  transitionFrame: null,
  explorationPlane: null,
  planeOffsetPercent: 0,
  planeRotationRadians: 0,
  planeGesture: null,
  selectedComparisonOption: null,
  latestSectionResult: null,
  lastSectionProjectionKey: "",
};

const SHAPE_COMPARISONS = {
  "box-stem-plus-axial-cone": "实际截面就是“上方矩形直杆 + 下方直角边三角形”，候选图的直边、尖角和连接位置都能对上。",
  "convex-hexagon": "先让切面尽量贴近候选六边形：上方方体确实能形成六边形趋势，但同一个平面会继续切进下方倒圆锥，实际图会带出圆锥曲线和连接转折，所以不是候选里的干净六边形。",
  "box-stem-plus-curved-shield": "实际过轴截面下方是两条直母线组成的三角形；候选图把直边画成了向外鼓的曲边。",
  "rectangle-with-full-ellipse": "实际边界会把方体直边和圆锥截痕连成一个外轮廓，不会出现“矩形里面悬着一条完整椭圆”。",
  "narrow-triangle": "实际切面可以只经过棱锥相邻平面，得到一个很窄的三角形，三条边都能对应。",
  "pyramid-quadrilateral": "实际切到棱锥四个侧面时就是四条直边围成的不规则四边形，候选图可以出现。",
  "conic-plus-triangle": "这类截面可以出现：圆柱贡献曲边，棱锥贡献直边。但看题时还要继续核对曲边朝向、连接位置和外轮廓比例；如果当前真实截面和候选简图方向不一致，就不能说完全对上。",
  "ellipse-plus-full-rectangle": "圆柱要出现椭圆，切面必须倾斜；同一斜面会削掉棱锥矩形的一个角，所以实际图最接近“椭圆 + 缺角四边形”。",
};

const FOUNDATION_NOTES = {
  "convex-hexagon": "单独的正方体或长方体确实可以截出六边形，常见做法是让切面同时穿过六个面或六条相关棱；所以不能说“六边形不可能”。本题要排除的是：圆锥 + 方体组合体不会截出这种脱离接触关系的纯凸六边形。",
  "rectangle-with-full-ellipse": "圆锥和圆柱都可能截出椭圆；但在组合体里，椭圆不能无视旁边已经占据空间的方体或棱锥。判断时要看同一切面是否同时解释所有部件。",
  "ellipse-plus-full-rectangle": "圆柱斜切能得到椭圆，棱锥或方体斜切会留下直边和缺角。选项如果只保留好看的椭圆，却让另一部分仍保持完整矩形，就要警惕。",
};

function dispatch(event) {
  state.machine = transitionLesson(state.machine, event);
  state.currentKeyframe = state.machine.currentKeyframe;
  state.selectedOptionId = state.machine.selectedOptionId;
  state.exploring = state.machine.phase === "exploring";
  state.playing = state.machine.phase === "playing";
  return state.machine;
}

function assertRequiredElements() {
  for (const [name, element] of Object.entries(elements)) {
    if (!element) throw new Error(`页面缺少必要元素: ${name}`);
  }
}

assertRequiredElements();

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(5.2, 3.8, 6.5);

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 20;
controls.target.set(0, -0.5, 0);

const TEACHING_CAMERA_PULLBACK = 1.16;

scene.add(new THREE.HemisphereLight(0xfff9eb, 0x64746f, 2.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9ec5ff, 1.4);
rimLight.position.set(-5, 2, -4);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4.2, 64),
  new THREE.MeshBasicMaterial({
    color: 0xcfd8d2,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -3.08;
scene.add(ground);

const modelRoot = new THREE.Group();
modelRoot.name = "ReasoningCaseModel";
scene.add(modelRoot);

const sectionVisual = createSectionVisualV2({
  fillColor: 0xf28a3c,
  outlineColor: 0xc94d16,
  fillOpacity: 0.78,
});
sectionVisual.fill.material.depthTest = false;
sectionVisual.fill.renderOrder = 8;
sectionVisual.outline.renderOrder = 9;
scene.add(sectionVisual.group);

const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
const planeHelperGeometry = new THREE.PlaneGeometry(6.4, 6.4);
const planeHelper = new THREE.Mesh(
  planeHelperGeometry,
  new THREE.MeshBasicMaterial({
    color: 0x5b95ef,
    transparent: true,
    opacity: 0.025,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
planeHelper.name = "TeachingCutPlane";
scene.add(planeHelper);

let frameRequest = null;
let resizeObserver = null;
let sectionSource = null;
let draftCaseIndex = {
  draftItems: [],
  formalVideoCases: [],
};

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose?.());
    } else {
      object.material?.dispose?.();
    }
  });
}

function clearModel() {
  sectionSource = null;
  while (modelRoot.children.length) {
    const child = modelRoot.children.pop();
    disposeObject(child);
  }
}

function setModelCutaway(active) {
  const solid = modelRoot.getObjectByName("lesson-union-solid");
  const ghost = modelRoot.getObjectByName("lesson-cutaway-ghost");
  if (solid?.material) {
    solid.material.clippingPlanes = active ? [sectionPlane] : [];
    solid.material.needsUpdate = true;
  }
  if (ghost) ghost.visible = active;
}

function squarePyramidGeometry(width, depth, height) {
  const hx = width / 2;
  const hz = depth / 2;
  const y = -height / 2;
  const positions = new Float32Array([
    -hx, y, -hz, hx, y, hz, hx, y, -hz,
    -hx, y, -hz, -hx, y, hz, hx, y, hz,
    -hx, y, -hz, hx, y, -hz, 0, height / 2, 0,
    hx, y, -hz, hx, y, hz, 0, height / 2, 0,
    hx, y, hz, -hx, y, hz, 0, height / 2, 0,
    -hx, y, hz, -hx, y, -hz, 0, height / 2, 0,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function geometryForObject(object) {
  const dimensions = object.dimensions;
  switch (object.type) {
    case "box":
      return new THREE.BoxGeometry(
        dimensions.width,
        dimensions.height,
        dimensions.depth,
      );
    case "cone":
      return new THREE.ConeGeometry(
        dimensions.radiusBottom,
        dimensions.height,
        dimensions.radialSegments ?? 64,
      );
    case "cylinder":
      return new THREE.CylinderGeometry(
        dimensions.radius,
        dimensions.radius,
        dimensions.height,
        dimensions.radialSegments ?? 64,
      );
    case "square-pyramid":
      return squarePyramidGeometry(
        dimensions.baseWidth,
        dimensions.baseDepth,
        dimensions.height,
      );
    default:
      throw new RangeError(`暂不支持模型类型: ${object.type}`);
  }
}

function buildModel(caseData) {
  clearModel();
  const brushes = [];
  const sourceEdges = new THREE.Group();
  sourceEdges.name = "lesson-source-edges";
  for (const object of caseData.model.objects) {
    const geometry = geometryForObject(object);
    const brush = new Brush(geometry);
    brush.name = object.id;
    const transform = object.transform;
    brush.position.fromArray(transform.position);
    brush.rotation.set(
      THREE.MathUtils.degToRad(transform.rotationDegrees[0]),
      THREE.MathUtils.degToRad(transform.rotationDegrees[1]),
      THREE.MathUtils.degToRad(transform.rotationDegrees[2]),
    );
    brush.scale.fromArray(transform.scale);
    brush.updateMatrixWorld(true);
    brushes.push(brush);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 32),
      new THREE.LineBasicMaterial({
        color: MODEL_APPEARANCE.wireframe,
        transparent: true,
        opacity: 0.72,
        depthTest: true,
        depthWrite: false,
      }),
    );
    edge.position.copy(brush.position);
    edge.quaternion.copy(brush.quaternion);
    edge.scale.copy(brush.scale);
    edge.renderOrder = 3;
    sourceEdges.add(edge);
  }

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];
  evaluator.useGroups = false;
  let result = brushes[0];
  for (let index = 1; index < brushes.length; index += 1) {
    const next = new Brush();
    evaluator.evaluate(result, brushes[index], ADDITION, next);
    if (result !== brushes[0]) result.geometry.dispose();
    result = next;
  }

  result.name = "lesson-union-solid";
  result.material = new THREE.MeshStandardMaterial({
    color: MODEL_APPEARANCE.color,
    roughness: 0.52,
    metalness: 0.03,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    clippingPlanes: [],
  });
  result.castShadow = true;
  result.receiveShadow = true;
  modelRoot.add(result);
  sectionSource = result;

  const ghost = new THREE.Mesh(
    result.geometry,
    new THREE.MeshBasicMaterial({
      color: 0x9fb6b0,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ghost.name = "lesson-cutaway-ghost";
  ghost.visible = false;
  ghost.renderOrder = 1;
  modelRoot.add(ghost, sourceEdges);

  for (const brush of brushes) {
    if (brush !== result) brush.geometry.dispose();
  }
  modelRoot.updateMatrixWorld(true);
}

function normalizedPlane(normal, constant) {
  const vector = new THREE.Vector3().fromArray(normal);
  if (vector.lengthSq() === 0) vector.set(1, 0, 0);
  const length = vector.length();
  return new THREE.Plane(vector.divideScalar(length), constant / length);
}

function currentTeachingFrame() {
  const target = controls.target.clone();
  const position = camera.position.clone()
    .sub(target)
    .divideScalar(TEACHING_CAMERA_PULLBACK)
    .add(target);
  return {
    camera: {
      position: position.toArray(),
      target: target.toArray(),
    },
    plane: planeHelper.visible
      ? {
          normal: sectionPlane.normal.toArray(),
          constant: sectionPlane.constant,
        }
      : null,
  };
}

function setPlaneControlsEnabled(enabled) {
  elements.planePosition.disabled = !enabled;
  for (const button of elements.planeArrows) button.disabled = !enabled;
  elements.canvas.parentElement.dataset.planeReady = String(enabled);
}

function setTimelineControlsEnabled(enabled) {
  elements.previous.disabled = !enabled;
  elements.play.disabled = !enabled;
  elements.next.disabled = !enabled;
}

function formatSignedPercent(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function formatSignedDegrees(radians) {
  const degrees = Math.round(THREE.MathUtils.radToDeg(radians));
  return `${degrees > 0 ? "+" : ""}${degrees}°`;
}

function normalizeAngleRadians(radians) {
  let next = radians;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function resetPlaneOutputs() {
  state.planeOffsetPercent = 0;
  state.planeRotationRadians = 0;
  elements.planePosition.value = "0";
  elements.planePositionOutput.textContent = "0%";
  elements.planeAngleOutput.textContent = "0°";
  updatePlaneReadout();
}

function sectionStatusText(result) {
  if (result?.status === "locked") return "等待选择";
  if (!planeHelper.visible) return "等待切面";
  if (!result) return "切面已就位";
  if (result.status === "error") return "切到模型边界";
  if (result.status !== "ok" || !result.topology?.groups?.length) {
    return "还没碰到模型";
  }
  return `${result.contourCount} 个真实截面`;
}

function updatePlaneReadout(result = null) {
  elements.planeLiveStatus.textContent = sectionStatusText(result);
  elements.planeLiveSummary.textContent =
    `偏移 ${formatSignedPercent(state.planeOffsetPercent)} · 旋转 ${formatSignedDegrees(state.planeRotationRadians)}`;
}

function hasExplorablePlane() {
  return Boolean(
    sectionSource && state.caseData?.keyframes?.some((frame) => frame.plane),
  );
}

function explorableTeachingFrame() {
  const current = state.caseData?.keyframes?.[state.currentKeyframe];
  if (current?.plane) return current;
  return state.caseData?.keyframes?.find((frame) => frame.plane) ?? null;
}

function prepareExplorationPlane() {
  if (!hasExplorablePlane()) return false;
  if (!planeHelper.visible) {
    const frame = explorableTeachingFrame();
    if (!frame) return false;
    renderTeachingFrame(frame);
  }
  setPlaneControlsEnabled(true);
  return true;
}

function setCameraFrame(cameraFrame) {
  const target = new THREE.Vector3().fromArray(cameraFrame.target);
  const position = new THREE.Vector3().fromArray(cameraFrame.position);
  position.sub(target).multiplyScalar(TEACHING_CAMERA_PULLBACK).add(target);
  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
}

function cameraFrameForFrontSection(frame) {
  if (!frame.plane) return { camera: frame.camera, plane: null };
  const target = new THREE.Vector3().fromArray(frame.camera.target);
  const original = new THREE.Vector3()
    .fromArray(frame.camera.position)
    .sub(target);
  const distance = Math.max(original.length(), 5.2);
  const plane = normalizedPlane(frame.plane.normal, frame.plane.constant);
  const viewNormal = plane.normal.clone();
  if (viewNormal.dot(original) < 0) viewNormal.negate();
  const sectionTarget = plane.projectPoint(target, new THREE.Vector3());
  const position = sectionTarget.clone().addScaledVector(viewNormal, distance);
  return {
    camera: {
      position: position.toArray(),
      target: sectionTarget.toArray(),
    },
    plane: frame.plane,
  };
}

function sectionCenterFromResult(result) {
  const points = result.contours.flatMap((contour) => contour.points);
  const center = new THREE.Vector3();
  for (const point of points) center.add(point);
  return center.divideScalar(Math.max(points.length, 1));
}

function focusCameraOnSection(result) {
  if (state.exploring || result?.status !== "ok" || !result.contours?.length) {
    return;
  }
  const center = sectionCenterFromResult(result);
  const points = result.contours.flatMap((contour) => contour.points);
  const radius = Math.max(
    ...points.map((point) => point.distanceTo(center)),
    0.85,
  );
  const normal = sectionPlane.normal.clone().normalize();
  if (normal.dot(camera.position.clone().sub(center)) < 0) normal.negate();
  const fitDistance =
    radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  const distance = THREE.MathUtils.clamp(fitDistance * 2.6, 8.8, 18);
  camera.position.copy(center).addScaledVector(normal, distance);
  controls.target.copy(center);
  controls.update();
}

function renderTeachingFrame(frame) {
  setCameraFrame(cameraFrameForFrontSection(frame).camera);
  if (!state.exploring) resetPlaneOutputs();
  if (frame.plane) {
    sectionPlane.copy(
      normalizedPlane(frame.plane.normal, frame.plane.constant),
    );
    planeHelper.visible = true;
    setModelCutaway(true);
  } else {
    sectionPlane.set(new THREE.Vector3(1, 0, 0), 99);
    planeHelper.visible = false;
    setModelCutaway(false);
  }
  setPlaneControlsEnabled(Boolean(frame.plane));
  updateSection({ focusSection: Boolean(frame.plane) });
}

function cancelTeachingTransition() {
  if (state.transitionFrame !== null) {
    cancelAnimationFrame(state.transitionFrame);
    state.transitionFrame = null;
  }
}

function animateTeachingFrame(target, durationMs = 760) {
  cancelTeachingTransition();
  const start = currentTeachingFrame();
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const tick = (now) => {
      const progress = transitionProgress(startedAt, now, durationMs);
      renderTeachingFrame(
        interpolateTeachingFrame(start, target, progress),
      );
      if (progress < 1 && !state.exploring) {
        state.transitionFrame = requestAnimationFrame(tick);
      } else {
        state.transitionFrame = null;
        resolve();
      }
    };
    state.transitionFrame = requestAnimationFrame(tick);
  });
}

function syncPlaneHelper() {
  const normal = sectionPlane.normal;
  const point = normal.clone().multiplyScalar(-sectionPlane.constant);
  planeHelper.position.copy(point);
  planeHelper.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal,
  );
}

function syncSectionFacingMetric() {
  if (!planeHelper.visible) {
    elements.canvas.dataset.sectionFacing = "none";
    return;
  }
  const toCamera = camera.position.clone()
    .sub(controls.target)
    .normalize();
  const planeNormal = sectionPlane.normal.clone().normalize();
  const facing = Math.abs(toCamera.dot(planeNormal));
  elements.canvas.dataset.sectionFacing = facing.toFixed(3);
}

function svgNumber(value) {
  return Number(value.toFixed(3));
}

function markLatestSectionResult(result) {
  state.latestSectionResult = result;
  state.lastSectionProjectionKey = "";
}

function sectionProjectionKey(result) {
  if (result?.status !== "ok") return `status:${result?.status ?? "none"}`;
  const values = [
    state.selectedOptionId ?? "none",
    result.contourCount,
    result.area.toFixed(4),
    sectionPlane.normal.x,
    sectionPlane.normal.y,
    sectionPlane.normal.z,
    sectionPlane.constant,
    camera.position.x,
    camera.position.y,
    camera.position.z,
    camera.quaternion.x,
    camera.quaternion.y,
    camera.quaternion.z,
    camera.quaternion.w,
    controls.target.x,
    controls.target.y,
    controls.target.z,
  ];
  return values.map((value) => (
    typeof value === "number" ? value.toFixed(4) : value
  )).join("|");
}

function cameraProjectedSectionSvg(result) {
  const groups3D = result.topology.groups.map((group) => [
    group.outerPoints3D,
    ...group.holes3D,
  ]);
  const allPoints = groups3D.flat(2);
  const center = new THREE.Vector3();
  for (const point of allPoints) center.add(point);
  center.divideScalar(Math.max(allPoints.length, 1));

  const cameraRight = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .normalize();
  const cameraUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(camera.quaternion)
    .normalize();
  const projectedGroups = groups3D.map((rings) => rings.map((ring) => (
    ring.map((point) => {
      const relative = point.clone().sub(center);
      return {
        x: relative.dot(cameraRight),
        y: relative.dot(cameraUp),
      };
    })
  )));
  const projectedPoints = projectedGroups.flat(2);
  const minX = Math.min(...projectedPoints.map((point) => point.x));
  const maxX = Math.max(...projectedPoints.map((point) => point.x));
  const minY = Math.min(...projectedPoints.map((point) => point.y));
  const maxY = Math.max(...projectedPoints.map((point) => point.y));
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(270 / width, 126 / height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const project = (point) => [
    svgNumber(160 + (point.x - centerX) * scale),
    svgNumber(85 - (point.y - centerY) * scale),
  ];
  const ringPath = (ring) => ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ") + " Z";

  const paths = projectedGroups.map((rings) => {
    const path = rings.map(ringPath).join(" ");
    return `<path class="section-shape" d="${path}" fill="#f5a15f" fill-opacity="0.32" fill-rule="evenodd" stroke="#d85418" stroke-width="4" stroke-linejoin="round"/>`;
  }).join("");
  const markers = projectedGroups.flatMap((rings) => rings.flatMap((ring) => (
    ring.map((point) => {
      const [cx, cy] = project(point);
      return `<circle class="section-point" cx="${cx}" cy="${cy}" r="3.2" fill="#fffdf9" stroke="#d85418" stroke-width="2"/>`;
    })
  ))).join("");

  return `${paths}${markers}`;
}

function renderLockedSectionPreview(result) {
  const message = result?.status === "ok"
    ? "先选一个选项"
    : "等待有效切面";
  elements.sectionPreviewSvg.dataset.projection = "locked";
  elements.sectionPreviewSvg.innerHTML =
    `<text x="160" y="88" text-anchor="middle">${message}</text>`;
  elements.sectionPreviewMeta.textContent = "等待选择";
  elements.sectionPreviewStatus.textContent =
    "点 A/B/C/D 后，再按当前 3D 方向显示真实截面。";
  syncShapeComparisonActual();
}

function renderSectionPreview(result) {
  if (!state.selectedOptionId) {
    renderLockedSectionPreview(result);
    return;
  }
  if (result?.status !== "ok" || !result.topology?.groups?.length) {
    const message = result?.status === "error"
      ? "当前切面处于组合边界"
      : "切面暂未经过模型";
    const emptySvg = `<text x="160" y="88" text-anchor="middle">${message}</text>`;
    const status = result?.status === "error"
      ? "请稍微旋转或移动切面"
      : "拖动切面后实时显示";
    elements.sectionPreviewSvg.dataset.projection = result?.status ?? "empty";
    elements.sectionPreviewSvg.innerHTML = emptySvg;
    elements.sectionPreviewMeta.textContent = "暂无轮廓";
    elements.sectionPreviewStatus.textContent = status;
    syncShapeComparisonActual();
    return;
  }

  const sectionSvg = cameraProjectedSectionSvg(result);
  const meta = `${result.contourCount} 个轮廓 · 面积 ${result.area.toFixed(2)}`;
  const status = "按当前 3D 观察方向同步 · 外环、孔洞和顶点均来自 V2";
  elements.sectionPreviewSvg.dataset.projection = "camera";
  elements.sectionPreviewSvg.innerHTML = sectionSvg;
  elements.sectionPreviewMeta.textContent = meta;
  elements.sectionPreviewStatus.textContent = status;
  state.lastSectionProjectionKey = sectionProjectionKey(result);
  syncShapeComparisonActual();
}

function syncShapeComparisonActual() {
  if (!elements.shapeComparisonActual || !state.selectedComparisonOption) return;
  if (!state.selectedOptionId) return;
  elements.shapeComparisonActual.dataset.projection =
    elements.sectionPreviewSvg.dataset.projection ?? "";
  elements.shapeComparisonActual.innerHTML =
    elements.sectionPreviewSvg.innerHTML;
}

function renderInitialSectionCue(caseData) {
  const previewFrame = caseData.keyframes.find((frame) => frame.plane);
  if (!previewFrame) return;
  renderTeachingFrame({
    ...previewFrame,
    optionId: null,
  });
  sectionVisual.clear();
  planeHelper.visible = false;
  elements.reasoningHeading.textContent = "先选一个选项";
  elements.reasoningCaption.textContent =
    "先按自己的判断点 A/B/C/D；选完后再把候选图、真实截面和这一刀的 3D 结果放在一起看。";
  elements.engineStatus.textContent = "先选一个选项后显示真实切面";
  elements.engineStatus.dataset.status = "locked";
  updatePlaneReadout({ status: "locked" });
  setPlaneControlsEnabled(false);
  setTimelineControlsEnabled(false);
}

function renderShapeComparison(option) {
  state.selectedComparisonOption = option.id;
  renderCandidatePreview(option);
  renderSectionPreview(state.latestSectionResult);
  const foundation = FOUNDATION_NOTES[option.outlineClass];
  elements.foundationNote.classList.toggle("is-hidden", !foundation);
  elements.foundationNoteCopy.textContent = foundation ?? "";
  elements.shapeComparison.classList.remove("is-hidden");
  elements.shapeComparisonCandidate.innerHTML = outlineSvg(option);
  elements.shapeComparisonCopy.textContent =
    SHAPE_COMPARISONS[option.outlineClass] ?? option.reason;
  elements.shapeComparisonResult.textContent = option.verdict === "impossible"
    ? "关键差异"
    : "类型可验证";
  syncShapeComparisonActual();
}

function updateSection({ focusSection = false } = {}) {
  try {
    modelRoot.updateMatrixWorld(true);
    if (!sectionSource) throw new Error("截面实体尚未建立");
    const result = computeSectionV2(sectionSource, sectionPlane, {
      epsilon: 1e-6,
    });
    markLatestSectionResult(result);
    if (result.status === "error") {
      sectionVisual.clear();
      renderSectionPreview(result);
      updatePlaneReadout(result);
      elements.engineStatus.textContent = "当前切面处于组合边界";
      elements.engineStatus.dataset.status = "warning";
      return;
    }
    sectionVisual.update(toSectionVisualV2Data(result));
    if (focusSection) focusCameraOnSection(result);
    renderSectionPreview(result);
    updatePlaneReadout(result);
    elements.engineStatus.textContent = result.status === "ok"
      ? `真实截面 · ${result.contourCount} 个轮廓`
      : "切面暂未经过模型";
    elements.engineStatus.dataset.status = result.status;
  } catch (error) {
    sectionVisual.clear();
    const result = { status: "error" };
    markLatestSectionResult(result);
    renderSectionPreview(result);
    updatePlaneReadout({ status: "error" });
    elements.engineStatus.textContent = "截面计算已安全停止";
    elements.engineStatus.dataset.status = "error";
    console.error("Section Engine V2:", error);
  }
  syncPlaneHelper();
  syncSectionFacingMetric();
}

function resizeViewport() {
  const rect = elements.canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function refreshCameraProjectedSection() {
  if (!state.selectedOptionId || state.latestSectionResult?.status !== "ok") {
    return;
  }
  const nextKey = sectionProjectionKey(state.latestSectionResult);
  if (nextKey === state.lastSectionProjectionKey) return;
  renderSectionPreview(state.latestSectionResult);
}

function animate() {
  controls.update();
  refreshCameraProjectedSection();
  syncSectionFacingMetric();
  renderer.render(scene, camera);
  frameRequest = requestAnimationFrame(animate);
}

function linePath(points, scale = 38, center = 48) {
  return points
    .map(([x, y], index) => {
      const px = center + x * scale;
      const py = center - y * scale;
      return `${index === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ") + " Z";
}

function mixedPath(segments, scale = 38, center = 48) {
  if (!segments.length) return "";
  const first = segments[0].from;
  const commands = [`M ${center + first[0] * scale} ${center - first[1] * scale}`];
  for (const segment of segments) {
    const [x, y] = segment.to;
    if (segment.type === "quadratic") {
      const [cx, cy] = segment.control;
      commands.push(
        `Q ${center + cx * scale} ${center - cy * scale} ${center + x * scale} ${center - y * scale}`,
      );
    } else if (segment.type === "arc") {
      commands.push(
        `Q ${center} ${center - segment.bulge * scale} ${center + x * scale} ${center - y * scale}`,
      );
    } else {
      commands.push(`L ${center + x * scale} ${center - y * scale}`);
    }
  }
  return `${commands.join(" ")} Z`;
}

function outlineSvg(option) {
  const outline = option.outline;
  let content = "";
  if (outline.kind === "normalized-polyline") {
    content = `<path d="${linePath(outline.points)}"/>`;
  } else if (outline.kind === "mixed-outline") {
    content = `<path d="${mixedPath(outline.segments)}"/>`;
  } else if (outline.kind === "compound" && outline.outer) {
    const [x1, y1, x2, y2] = outline.outer.bounds;
    const width = (x2 - x1) * 34;
    const height = (y2 - y1) * 34;
    const ellipse = outline.inner;
    content = `
      <rect x="${48 + x1 * 34}" y="${48 - y2 * 34}" width="${width}" height="${height}"/>
      <ellipse cx="${48 + ellipse.center[0] * 34}" cy="${48 - ellipse.center[1] * 34}"
        rx="${ellipse.radius[0] * 34}" ry="${ellipse.radius[1] * 34}"/>`;
  } else if (outline.kind === "compound" && outline.parts) {
    content = outline.parts.map((part) => {
      if (part.type === "ellipse") {
        return `<ellipse cx="${48 + part.center[0] * 34}" cy="${48 - part.center[1] * 34}"
          rx="${part.radius[0] * 34}" ry="${part.radius[1] * 34}"/>`;
      }
      const [x1, y1, x2, y2] = part.bounds;
      return `<rect x="${48 + x1 * 34}" y="${48 - y2 * 34}"
        width="${(x2 - x1) * 34}" height="${(y2 - y1) * 34}"/>`;
    }).join("");
  }
  return `<svg viewBox="0 0 96 96" aria-hidden="true">${content}</svg>`;
}

function resetCandidatePreview() {
  elements.candidatePreview.classList.remove("is-impossible", "is-possible");
  elements.candidatePreviewTitle.textContent = "先选一个选项";
  elements.candidatePreviewMeta.textContent = "等待验证";
  elements.candidatePreviewDrawing.innerHTML = "<span>选择 A / B / C / D</span>";
  elements.candidatePreviewStatus.textContent = "选项会和真实截面同步对比";
}

function renderCandidatePreview(option) {
  const impossible = option.verdict === "impossible";
  elements.candidatePreview.classList.toggle("is-impossible", impossible);
  elements.candidatePreview.classList.toggle("is-possible", !impossible);
  elements.candidatePreviewTitle.textContent = `${option.id} · ${option.label}`;
  elements.candidatePreviewMeta.textContent = impossible ? "待排除" : "可验证";
  elements.candidatePreviewDrawing.innerHTML = outlineSvg(option);
  elements.candidatePreviewStatus.textContent = impossible
    ? "把它当目标去摆切面，真实截面会暴露多出来、缺掉或曲直不一致的地方"
    : "先证明能切出同类边界，再核对方向、比例和连接位置是否真的一致";
}

function renderSourceModelIcon(caseData) {
  elements.sourceFigure.classList.toggle("has-image", Boolean(caseData.source.image));
  if (caseData.source.image) {
    const image = document.createElement("img");
    image.className = "source-question-image";
    image.src = caseData.source.image;
    image.alt = `${caseData.title} 原题截图`;
    elements.sourceFigure.replaceChildren(image);
    return;
  }
  const types = caseData.model.objects.map((object) => object.type);
  const labels = {
    box: "方体",
    cone: "倒圆锥",
    cylinder: "圆柱",
    "square-pyramid": "四棱锥",
  };
  elements.sourceFigure.innerHTML = `
    <div class="source-model-card">
      <div class="source-shape-stack" data-case="${caseData.id}">
        ${types.map((type) => `<span class="source-shape source-${type}"></span>`).join("")}
      </div>
      <div>
        <strong>${types.map((type) => labels[type]).join(" + ")}</strong>
        <small>原视频 ${caseData.source.questionFrameSeconds} 秒题面 · 教学重建</small>
      </div>
    </div>`;
}

function draftCaseById(caseId) {
  return draftCaseIndex.draftItems.find((item) => item.id === caseId) ?? null;
}

function renderDraftCaseOptions() {
  elements.caseSelect
    .querySelector("[data-draft-group='true']")
    ?.remove();
  if (!draftCaseIndex.draftItems.length) return;
  const group = document.createElement("optgroup");
  group.label = "待核验草稿（只看题图）";
  group.dataset.draftGroup = "true";
  for (const item of draftCaseIndex.draftItems) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `草稿 · ${item.title}`;
    option.dataset.status = item.status;
    option.dataset.lessonTarget = item.lessonTarget;
    group.append(option);
  }
  elements.caseSelect.append(group);
}

async function loadDraftCaseIndex() {
  try {
    const response = await fetch(DRAFT_CASE_INDEX_URL, { cache: "no-store" });
    if (!response.ok) return;
    const index = await response.json();
    draftCaseIndex = {
      draftItems: Array.isArray(index.draftItems) ? index.draftItems : [],
      formalVideoCases: Array.isArray(index.formalVideoCases)
        ? index.formalVideoCases
        : [],
    };
    renderDraftCaseOptions();
  } catch {
    draftCaseIndex = { draftItems: [], formalVideoCases: [] };
  }
}

function renderDraftCase(draft) {
  stopPlayback();
  cancelTeachingTransition();
  clearModel();
  sectionVisual.clear();
  planeHelper.visible = false;
  sectionPlane.set(new THREE.Vector3(1, 0, 0), 99);
  setPlaneControlsEnabled(false);
  state.caseData = null;
  state.machine = null;
  state.currentKeyframe = 0;
  state.selectedOptionId = null;
  state.exploring = false;
  state.playing = false;
  state.explorationPlane = null;
  state.planeGesture = null;
  state.latestSectionResult = null;
  state.lastSectionProjectionKey = "";
  resetPlaneOutputs();
  setTimelineControlsEnabled(false);

  elements.loading.classList.add("is-hidden");
  elements.caseSelect.value = draft.id;
  elements.questionHeading.textContent = `${draft.title}（draft）`;
  elements.prompt.textContent =
    draft.lessonTarget === "three-view"
      ? "这条视频会进入三视图训练；现在先保存原题截图和来源。"
      : "这条视频还没有人工核验答案；现在只展示原题截图，不进入正式判题。";
  elements.sourceFigure.classList.add("has-image");
  const image = document.createElement("img");
  image.className = "source-question-image";
  image.src = draft.image;
  image.alt = `${draft.title} 原题截图`;
  elements.sourceFigure.replaceChildren(image);
  elements.sourceNote.textContent =
    `来源：${draft.videoFileName} · ${draft.status} · ${draft.note}`;
  elements.answer.textContent = "待人工核验";
  elements.optionList.innerHTML = `
    <div class="draft-case-notice">
      <strong>草稿题只看题图</strong>
      <p>答案、模型和选项还没有人工核验，不能混进正式练习。下一步会按视频逐题拆模型、拆选项、再确认答案。</p>
    </div>`;
  resetCandidatePreview();
  elements.foundationNote.classList.add("is-hidden");
  elements.shapeComparison.classList.add("is-hidden");
  elements.constraints.replaceChildren();
  elements.verdictCard.classList.add("is-hidden");
  elements.stepCounter.textContent = "draft";
  elements.timelineProgress.style.width = "0%";
  elements.reasoningHeading.textContent = "先保留题面证据";
  elements.reasoningCaption.textContent =
    "这一步只做素材入口：先让题图可见、来源可查，后续人工核验后才生成标准模型和动态讲解。";
  elements.sectionPreviewSvg.innerHTML =
    '<text x="160" y="88" text-anchor="middle">草稿题暂不生成截面</text>';
  elements.sectionPreviewMeta.textContent = "待建模";
  elements.sectionPreviewStatus.textContent = "等待人工拆题和几何核验";
  elements.engineStatus.textContent = "草稿题 · 未进入判题";
  elements.engineStatus.dataset.status = "draft";
  elements.explore.setAttribute("aria-pressed", "false");
  elements.explore.textContent = "手动探索";
  controls.enabled = true;
  controls.enablePan = false;
}

function renderOptions(caseData) {
  elements.optionList.replaceChildren();
  for (const option of caseData.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-card";
    button.dataset.optionId = option.id;
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <span class="option-letter">${option.id}</span>
      <span class="option-outline">${outlineSvg(option)}</span>
      <span class="option-name">${option.label}</span>`;
    button.addEventListener("click", () => selectOption(option.id));
    elements.optionList.append(button);
  }
}

function verdictText(option) {
  if (
    state.machine?.answerRevealed
    && option.id === state.caseData.answer.correctOptionId
  ) {
    return state.caseData.answer.questionMode === "select-impossible"
      ? ["本题答案", "这个截面不可能出现"]
      : ["本题答案", "这个截面可以出现"];
  }
  return option.verdict === "impossible"
    ? ["排除", "这个截面不可能出现"]
    : ["可行", "这个截面可以出现"];
}

function renderConstraints(option) {
  const constraints = new Map(
    state.caseData.constraints.map((constraint) => [constraint.id, constraint]),
  );
  elements.constraints.replaceChildren();
  const orderedIds = [...option.violates, ...option.satisfies];
  const summary = document.createElement("div");
  summary.className = `constraint-summary ${
    option.violates.length ? "has-conflict" : "is-consistent"
  }`;
  summary.innerHTML = option.violates.length
    ? `<strong>先找关键矛盾</strong><span>${option.violates.length} 条规则不满足，逐条排除</span>`
    : `<strong>逐条核对可行条件</strong><span>${option.satisfies.length} 条规则均能同时成立</span>`;
  elements.constraints.append(summary);
  orderedIds.forEach((id, index) => {
    const constraint = constraints.get(id);
    if (!constraint) return;
    const item = document.createElement("article");
    const violated = option.violates.includes(id);
    item.className = `constraint-item ${violated ? "is-violated" : "is-satisfied"}`;
    item.innerHTML = `
      <span>${index + 1}</span>
      <div>
        <small>${violated ? "不满足 · 排除依据" : "满足 · 可行条件"}</small>
        <strong>${constraint.label}</strong>
        <p>${constraint.rule}</p>
      </div>`;
    elements.constraints.append(item);
  });
}

function refreshSelectedOptionVerdict() {
  if (!state.selectedOptionId) return;
  const option = state.caseData.options.find(
    (item) => item.id === state.selectedOptionId,
  );
  if (!option) return;
  const [label, title] = verdictText(option);
  elements.verdictLabel.textContent = label;
  elements.verdictTitle.textContent = title;
  elements.verdictReason.textContent = option.reason;
}

function applyKeyframe(index, { animate = false } = {}) {
  const keyframes = state.caseData.keyframes;
  const safeIndex = Math.max(0, Math.min(index, keyframes.length - 1));
  if (safeIndex !== state.machine.currentKeyframe) {
    dispatch({ type: "GO_TO_KEYFRAME", index: safeIndex });
  }
  state.currentKeyframe = safeIndex;
  const keyframe = keyframes[state.currentKeyframe];
  elements.stepCounter.textContent =
    `${state.currentKeyframe + 1} / ${keyframes.length}`;
  elements.timelineProgress.style.width =
    `${((state.currentKeyframe + 1) / keyframes.length) * 100}%`;
  elements.reasoningCaption.textContent = keyframe.caption;

  if (keyframe.optionId) selectOption(keyframe.optionId, false);
  if (!state.exploring) {
    if (animate) {
      animateTeachingFrame(keyframe);
    } else {
      cancelTeachingTransition();
      renderTeachingFrame(keyframe);
    }
  }
}

function selectOption(optionId, jumpToKeyframe = true) {
  const option = state.caseData.options.find((item) => item.id === optionId);
  if (!option) return;
  state.selectedOptionId = optionId;
  setTimelineControlsEnabled(true);
  for (const button of elements.optionList.querySelectorAll(".option-card")) {
    const selected = button.dataset.optionId === optionId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  elements.reasoningHeading.textContent = `验证 ${option.id}：${option.label}`;
  renderShapeComparison(option);
  renderConstraints(option);
  refreshSelectedOptionVerdict();
  elements.verdictCard.classList.remove("is-hidden");
  if (jumpToKeyframe) {
    const index = state.caseData.keyframes.findIndex(
      (keyframe) => keyframe.optionId === optionId,
    );
    if (index >= 0) {
      dispatch({
        type: "SELECT_OPTION",
        optionId,
        keyframeIndex: index,
      });
      applyKeyframe(index);
      setPlaneControlsEnabled(Boolean(
        state.caseData.keyframes[index]?.plane,
      ));
    }
  } else if (state.machine.selectedOptionId !== optionId) {
    dispatch({
      type: "SELECT_OPTION",
      optionId,
      keyframeIndex: state.currentKeyframe,
    });
  }
}

function setExploring(exploring) {
  cancelTeachingTransition();
  if (exploring && !prepareExplorationPlane()) return false;
  dispatch({ type: exploring ? "ENTER_EXPLORE" : "EXIT_EXPLORE" });
  elements.explore.setAttribute("aria-pressed", String(exploring));
  elements.explore.textContent = exploring ? "返回讲解" : "手动探索";
  controls.enablePan = exploring;
  if (exploring) {
    state.explorationPlane = sectionPlane.clone();
    resetPlaneOutputs();
  } else {
    state.planeGesture = null;
    controls.enabled = true;
    state.explorationPlane = null;
    resetPlaneOutputs();
    applyKeyframe(state.currentKeyframe);
  }
  return true;
}

const PLANE_ROTATION_STEP = THREE.MathUtils.degToRad(6);
const PLANE_MOVE_STEP = 7;

function applyExplorationPlane() {
  if (!state.explorationPlane) return;
  sectionPlane.copy(state.explorationPlane);
  sectionPlane.constant += state.planeOffsetPercent * 0.012;
  updateSection();
}

function clampPlaneOffset(value) {
  const min = Number(elements.planePosition.min);
  const max = Number(elements.planePosition.max);
  return Math.max(min, Math.min(max, value));
}

function moveExplorationPlane(deltaPercent) {
  if (!state.exploring && !setExploring(true)) return;
  const next = clampPlaneOffset(state.planeOffsetPercent + deltaPercent);
  state.planeOffsetPercent = next;
  elements.planePosition.value = String(Math.round(next));
  elements.planePositionOutput.textContent = formatSignedPercent(next);
  applyExplorationPlane();
}

function rotateExplorationPlaneBy(deltaRadians) {
  if (!state.exploring && !setExploring(true)) return;
  if (!state.explorationPlane) return;
  const cameraUp = camera.up.clone().applyQuaternion(camera.quaternion).normalize();
  state.explorationPlane.normal
    .applyAxisAngle(cameraUp, deltaRadians)
    .normalize();
  state.planeRotationRadians = normalizeAngleRadians(
    state.planeRotationRadians + deltaRadians,
  );
  elements.planeAngleOutput.textContent =
    formatSignedDegrees(state.planeRotationRadians);
  applyExplorationPlane();
}

function rotateExplorationPlane(direction) {
  if (!state.exploring && !setExploring(true)) return;
  if (!state.explorationPlane) return;
  if (direction === "up") {
    moveExplorationPlane(PLANE_MOVE_STEP);
    return;
  }
  if (direction === "down") {
    moveExplorationPlane(-PLANE_MOVE_STEP);
    return;
  }
  if (direction === "left") rotateExplorationPlaneBy(PLANE_ROTATION_STEP);
  if (direction === "right") rotateExplorationPlaneBy(-PLANE_ROTATION_STEP);
}

function stopPlayback() {
  if (state.machine && state.machine.phase === "playing") {
    dispatch({ type: "PAUSE" });
  } else {
    state.playing = false;
  }
  clearTimeout(state.playTimer);
  state.playTimer = null;
  elements.play.textContent = "播放讲解";
}

function scheduleNextFrame() {
  if (!state.playing) return;
  state.playTimer = setTimeout(() => {
    if (state.currentKeyframe >= state.caseData.keyframes.length - 1) {
      elements.answer.textContent =
        `答案 ${state.caseData.answer.correctOptionId}`;
      dispatch({ type: "COMPLETE" });
      refreshSelectedOptionVerdict();
      stopPlayback();
      return;
    }
    applyKeyframe(state.currentKeyframe + 1, { animate: true });
    scheduleNextFrame();
  }, 3000);
}

function togglePlayback() {
  if (state.playing) {
    stopPlayback();
    return;
  }
  setExploring(false);
  dispatch({ type: "PLAY" });
  elements.play.textContent = "暂停讲解";
  if (state.currentKeyframe >= state.caseData.keyframes.length - 1) {
    applyKeyframe(0);
  }
  scheduleNextFrame();
}

async function loadCase(caseId) {
  stopPlayback();
  cancelTeachingTransition();
  elements.loading.classList.remove("is-hidden");
  elements.engineStatus.textContent = "正在读取人工核验题目";
  const url = CASE_URLS[caseId];
  if (!url) throw new RangeError(`未知题目: ${caseId}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`题目加载失败: HTTP ${response.status}`);
  const caseData = await response.json();
  if (caseData.answer?.aiGenerated !== false) {
    throw new Error("拒绝加载：正式答案必须经过人工或确定性几何核验");
  }

  state.caseData = caseData;
  state.machine = createLessonState({
    caseId: caseData.id,
    keyframeCount: caseData.keyframes.length,
    optionIds: caseData.options.map((option) => option.id),
    correctOptionId: caseData.answer.correctOptionId,
  });
  state.currentKeyframe = state.machine.currentKeyframe;
  state.selectedOptionId = state.machine.selectedOptionId;
  state.exploring = false;
  state.explorationPlane = null;
  state.planeGesture = null;
  state.planeOffsetPercent = 0;
  state.planeRotationRadians = 0;
  state.selectedComparisonOption = null;
  state.latestSectionResult = null;
  state.lastSectionProjectionKey = "";
  setTimelineControlsEnabled(false);
  elements.questionHeading.textContent = caseData.title;
  elements.prompt.textContent = caseData.source.prompt;
  elements.sourceNote.textContent =
    `来源：用户提供参考视频 · ${caseData.verification.status}`;
  elements.answer.textContent = "完成验证后揭晓";
  elements.caseSelect.value = caseId;
  renderSourceModelIcon(caseData);
  renderOptions(caseData);
  resetCandidatePreview();
  elements.foundationNote.classList.add("is-hidden");
  elements.shapeComparison.classList.add("is-hidden");
  elements.constraints.replaceChildren();
  elements.verdictCard.classList.add("is-hidden");
  buildModel(caseData);
  applyKeyframe(0);
  renderInitialSectionCue(caseData);
  elements.loading.classList.add("is-hidden");
}

elements.caseSelect.addEventListener("change", (event) => {
  const caseId = event.target.value;
  if (CASE_URLS[caseId]) {
    loadCase(caseId).catch(showFatalError);
    return;
  }
  const draft = draftCaseById(caseId);
  if (draft) {
    renderDraftCase(draft);
    return;
  }
  showFatalError(new RangeError(`未知题目: ${caseId}`));
});
elements.previous.addEventListener("click", () => {
  if (!state.caseData) return;
  stopPlayback();
  applyKeyframe(state.currentKeyframe - 1);
});
elements.next.addEventListener("click", () => {
  if (!state.caseData) return;
  stopPlayback();
  applyKeyframe(state.currentKeyframe + 1);
  if (state.currentKeyframe === state.caseData.keyframes.length - 1) {
    dispatch({ type: "COMPLETE" });
    elements.answer.textContent =
      `答案 ${state.caseData.answer.correctOptionId}`;
    refreshSelectedOptionVerdict();
  }
});
elements.play.addEventListener("click", togglePlayback);
elements.explore.addEventListener("click", () => {
  if (!state.caseData) return;
  stopPlayback();
  setExploring(!state.exploring);
});
elements.resetView.addEventListener("click", () => {
  if (!state.caseData) return;
  stopPlayback();
  if (state.exploring) {
    setExploring(false);
  } else {
    applyKeyframe(state.currentKeyframe);
  }
});
elements.planePosition.addEventListener("input", (event) => {
  const percent = Number(event.target.value);
  if (!state.exploring) {
    if (!setExploring(true)) return;
    elements.planePosition.value = String(percent);
  }
  state.planeOffsetPercent = percent;
  applyExplorationPlane();
  elements.planePositionOutput.textContent = formatSignedPercent(percent);
});
for (const button of elements.planeArrows) {
  button.addEventListener("click", () => {
    rotateExplorationPlane(button.dataset.planeDirection);
  });
}

function planeGestureEnabled() {
  return hasExplorablePlane();
}

function beginPlaneGesture(event) {
  if (!planeGestureEnabled() || event.button !== 0) return;
  if (event.target.closest("button, input, select, textarea")) return;
  event.preventDefault();
  stopPlayback();
  if (!prepareExplorationPlane()) return;
  if (!state.exploring && !setExploring(true)) return;
  state.planeGesture = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  controls.enabled = false;
  elements.canvas.setPointerCapture?.(event.pointerId);
}

function updatePlaneGesture(event) {
  if (!state.planeGesture || state.planeGesture.pointerId !== event.pointerId) {
    return;
  }
  event.preventDefault();
  const dx = event.clientX - state.planeGesture.lastX;
  const dy = event.clientY - state.planeGesture.lastY;
  state.planeGesture.lastX = event.clientX;
  state.planeGesture.lastY = event.clientY;
  if (Math.abs(dy) > 0.4) moveExplorationPlane(-dy * 0.22);
  if (Math.abs(dx) > 0.4) rotateExplorationPlaneBy(-dx * 0.006);
}

function endPlaneGesture(event) {
  if (!state.planeGesture || state.planeGesture.pointerId !== event.pointerId) {
    return;
  }
  state.planeGesture = null;
  controls.enabled = true;
  elements.canvas.releasePointerCapture?.(event.pointerId);
}

elements.canvas.addEventListener("pointerdown", beginPlaneGesture, true);
elements.canvas.addEventListener("pointermove", updatePlaneGesture, true);
elements.canvas.addEventListener("pointerup", endPlaneGesture, true);
elements.canvas.addEventListener("pointercancel", endPlaneGesture, true);
elements.canvas.addEventListener("wheel", (event) => {
  if (!planeGestureEnabled()) return;
  event.preventDefault();
  stopPlayback();
  if (!state.exploring && !setExploring(true)) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    rotateExplorationPlaneBy(-event.deltaX * 0.0045);
  } else {
    moveExplorationPlane(-event.deltaY * 0.08);
  }
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const direction = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  }[event.key];
  if (!direction) return;
  if (!planeGestureEnabled()) return;
  const tagName = event.target?.tagName;
  if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") {
    return;
  }
  event.preventDefault();
  rotateExplorationPlane(direction);
});

function showFatalError(error) {
  stopPlayback();
  elements.loading.classList.remove("is-hidden");
  elements.loading.innerHTML = `
    <strong>这道题暂时没有加载成功</strong>
    <small>${error.message}</small>`;
  elements.engineStatus.textContent = "载入失败";
  console.error(error);
}

resizeObserver = new ResizeObserver(resizeViewport);
resizeObserver.observe(elements.canvas.parentElement);
resizeViewport();
animate();

async function initializeLesson() {
  await loadDraftCaseIndex();
  const initialCase =
    new URLSearchParams(window.location.search).get("case") ?? "cone-box-001";
  if (CASE_URLS[initialCase]) {
    await loadCase(initialCase);
    return;
  }
  const draft = draftCaseById(initialCase);
  if (draft) {
    renderDraftCase(draft);
    return;
  }
  await loadCase("cone-box-001");
}

initializeLesson().catch(showFatalError);

window.addEventListener("beforeunload", () => {
  stopPlayback();
  cancelTeachingTransition();
  cancelAnimationFrame(frameRequest);
  resizeObserver?.disconnect();
  sectionVisual.dispose();
  clearModel();
  renderer.dispose();
});

window.__reasoningLesson = {
  getState: () => ({
    ...(state.machine ? publicLessonState(state.machine) : {
      caseId: null,
      phase: "loading",
    }),
    sectionStatus: sectionVisual.group.userData.status ?? "empty",
    planeControlsEnabled: !elements.planePosition.disabled,
    planeOffsetPercent: state.planeOffsetPercent,
    planeRotationDegrees: THREE.MathUtils.radToDeg(state.planeRotationRadians),
    selectedOptionId: state.selectedOptionId,
  }),
  loadCase,
};
