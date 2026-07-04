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

const MODEL_APPEARANCE = {
  color: 0xe0b36f,
  opacity: 0.46,
  wireframe: 0x263746,
};

const elements = {
  answer: document.querySelector("#answer-display"),
  canvas: document.querySelector("#lesson-canvas"),
  caseSelect: document.querySelector("#case-select"),
  constraints: document.querySelector("#constraint-list"),
  engineStatus: document.querySelector("#engine-status"),
  explore: document.querySelector("#explore-toggle"),
  loading: document.querySelector("#viewport-loading"),
  next: document.querySelector("#next-step"),
  optionList: document.querySelector("#option-list"),
  planeArrows: [...document.querySelectorAll("[data-plane-direction]")],
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
  selectedComparisonOption: null,
};

const SHAPE_COMPARISONS = {
  "box-stem-plus-axial-cone": "实际截面就是“上方矩形直杆 + 下方直角边三角形”，候选图的直边、尖角和连接位置都能对上。",
  "convex-hexagon": "最接近的实际图仍会保留上方矩形直杆和下方尖角，不会被削成一个没有凹口的完整六边形。",
  "box-stem-plus-curved-shield": "实际过轴截面下方是两条直母线组成的三角形；候选图把直边画成了向外鼓的曲边。",
  "rectangle-with-full-ellipse": "实际边界会把方体直边和圆锥截痕连成一个外轮廓，不会出现“矩形里面悬着一条完整椭圆”。",
  "narrow-triangle": "实际切面可以只经过棱锥相邻平面，得到一个很窄的三角形，三条边都能对应。",
  "pyramid-quadrilateral": "实际切到棱锥四个侧面时就是四条直边围成的不规则四边形，候选图可以出现。",
  "conic-plus-triangle": "实际最接近“圆柱椭圆弧 + 棱锥两条直边”，曲边和直边会在组合体连接处接上。",
  "ellipse-plus-full-rectangle": "圆柱要出现椭圆，切面必须倾斜；同一斜面会削掉棱锥矩形的一个角，所以实际图最接近“椭圆 + 缺角四边形”。",
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
controls.maxDistance = 12;
controls.target.set(0, -0.5, 0);

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
  fillOpacity: 0.64,
});
scene.add(sectionVisual.group);

const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
const planeHelperGeometry = new THREE.PlaneGeometry(6.4, 6.4);
const planeHelper = new THREE.Mesh(
  planeHelperGeometry,
  new THREE.MeshBasicMaterial({
    color: 0x5b95ef,
    transparent: true,
    opacity: 0.065,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
planeHelper.name = "TeachingCutPlane";
scene.add(planeHelper);

let frameRequest = null;
let resizeObserver = null;
let sectionSource = null;

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
  return {
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
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
}

function renderTeachingFrame(frame) {
  camera.position.fromArray(frame.camera.position);
  controls.target.fromArray(frame.camera.target);
  controls.update();
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
  updateSection();
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

function svgNumber(value) {
  return Number(value.toFixed(3));
}

function renderSectionPreview(result) {
  if (result?.status !== "ok" || !result.topology?.groups?.length) {
    const message = result?.status === "error"
      ? "当前切面处于组合边界"
      : "切面暂未经过模型";
    elements.sectionPreviewSvg.innerHTML =
      `<text x="160" y="88" text-anchor="middle">${message}</text>`;
    elements.sectionPreviewMeta.textContent = "暂无轮廓";
    elements.sectionPreviewStatus.textContent =
      result?.status === "error" ? "请稍微旋转或移动切面" : "拖动切面后实时显示";
    syncShapeComparisonActual();
    return;
  }

  const rings = result.topology.groups.flatMap(
    (group) => [group.outerPoints2D, ...group.holes2D],
  );
  const points = rings.flat();
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
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

  const paths = result.topology.groups.map((group) => {
    const path = [
      ringPath(group.outerPoints2D),
      ...group.holes2D.map(ringPath),
    ].join(" ");
    return `<path class="section-shape" d="${path}" fill="#f5a15f" fill-opacity="0.32" fill-rule="evenodd" stroke="#d85418" stroke-width="4" stroke-linejoin="round"/>`;
  }).join("");
  const markers = rings.flatMap((ring) => ring.map((point) => {
    const [cx, cy] = project(point);
    return `<circle class="section-point" cx="${cx}" cy="${cy}" r="3.2" fill="#fffdf9" stroke="#d85418" stroke-width="2"/>`;
  })).join("");

  elements.sectionPreviewSvg.innerHTML = `${paths}${markers}`;
  elements.sectionPreviewMeta.textContent =
    `${result.contourCount} 个轮廓 · 面积 ${result.area.toFixed(2)}`;
  elements.sectionPreviewStatus.textContent =
    "与三维橙色截面同步 · 外环、孔洞和顶点均来自 V2";
  syncShapeComparisonActual();
}

function syncShapeComparisonActual() {
  if (!elements.shapeComparisonActual || !state.selectedComparisonOption) return;
  elements.shapeComparisonActual.innerHTML =
    elements.sectionPreviewSvg.innerHTML;
}

function renderShapeComparison(option) {
  state.selectedComparisonOption = option.id;
  elements.shapeComparison.classList.remove("is-hidden");
  elements.shapeComparisonCandidate.innerHTML = outlineSvg(option);
  elements.shapeComparisonCopy.textContent =
    SHAPE_COMPARISONS[option.outlineClass] ?? option.reason;
  elements.shapeComparisonResult.textContent = option.verdict === "impossible"
    ? "关键差异"
    : "图形能对上";
  syncShapeComparisonActual();
}

function updateSection() {
  try {
    modelRoot.updateMatrixWorld(true);
    if (!sectionSource) throw new Error("截面实体尚未建立");
    const result = computeSectionV2(sectionSource, sectionPlane, {
      epsilon: 1e-6,
    });
    if (result.status === "error") {
      sectionVisual.clear();
      renderSectionPreview(result);
      elements.engineStatus.textContent = "当前切面处于组合边界";
      elements.engineStatus.dataset.status = "warning";
      return;
    }
    sectionVisual.update(toSectionVisualV2Data(result));
    renderSectionPreview(result);
    elements.engineStatus.textContent = result.status === "ok"
      ? `真实截面 · ${result.contourCount} 个轮廓`
      : "切面暂未经过模型";
    elements.engineStatus.dataset.status = result.status;
  } catch (error) {
    sectionVisual.clear();
    renderSectionPreview({ status: "error" });
    elements.engineStatus.textContent = "截面计算已安全停止";
    elements.engineStatus.dataset.status = "error";
    console.error("Section Engine V2:", error);
  }
  syncPlaneHelper();
}

function resizeViewport() {
  const rect = elements.canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
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

function renderSourceModelIcon(caseData) {
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
  dispatch({ type: exploring ? "ENTER_EXPLORE" : "EXIT_EXPLORE" });
  elements.explore.setAttribute("aria-pressed", String(exploring));
  elements.explore.textContent = exploring ? "返回讲解" : "手动探索";
  controls.enablePan = exploring;
  if (exploring) {
    state.explorationPlane = sectionPlane.clone();
    state.planeOffsetPercent = 0;
    elements.planePosition.value = "0";
    elements.planePositionOutput.textContent = "0%";
  } else {
    state.explorationPlane = null;
    state.planeOffsetPercent = 0;
    applyKeyframe(state.currentKeyframe);
  }
}

const PLANE_ROTATION_STEP = THREE.MathUtils.degToRad(6);

function applyExplorationPlane() {
  if (!state.explorationPlane) return;
  sectionPlane.copy(state.explorationPlane);
  sectionPlane.constant += state.planeOffsetPercent * 0.012;
  updateSection();
}

function rotateExplorationPlane(direction) {
  if (!state.exploring || !state.explorationPlane) return;
  const cameraUp = camera.up.clone().applyQuaternion(camera.quaternion).normalize();
  const cameraRight = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .normalize();
  const rotations = {
    up: [cameraRight, PLANE_ROTATION_STEP],
    down: [cameraRight, -PLANE_ROTATION_STEP],
    left: [cameraUp, PLANE_ROTATION_STEP],
    right: [cameraUp, -PLANE_ROTATION_STEP],
  };
  const rotation = rotations[direction];
  if (!rotation) return;
  state.explorationPlane.normal
    .applyAxisAngle(rotation[0], rotation[1])
    .normalize();
  applyExplorationPlane();
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
  elements.questionHeading.textContent = caseData.title;
  elements.prompt.textContent = caseData.source.prompt;
  elements.sourceNote.textContent =
    `来源：用户提供参考视频 · ${caseData.verification.status}`;
  elements.answer.textContent = "完成验证后揭晓";
  elements.caseSelect.value = caseId;
  renderSourceModelIcon(caseData);
  renderOptions(caseData);
  buildModel(caseData);
  applyKeyframe(0);
  elements.loading.classList.add("is-hidden");
}

elements.caseSelect.addEventListener("change", (event) => {
  loadCase(event.target.value).catch(showFatalError);
});
elements.previous.addEventListener("click", () => {
  stopPlayback();
  applyKeyframe(state.currentKeyframe - 1);
});
elements.next.addEventListener("click", () => {
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
  stopPlayback();
  setExploring(!state.exploring);
});
elements.resetView.addEventListener("click", () => {
  applyKeyframe(state.currentKeyframe);
});
elements.planePosition.addEventListener("input", (event) => {
  const percent = Number(event.target.value);
  if (!state.exploring) {
    setExploring(true);
    elements.planePosition.value = String(percent);
  }
  state.planeOffsetPercent = percent;
  applyExplorationPlane();
  elements.planePositionOutput.textContent = `${percent}%`;
});
for (const button of elements.planeArrows) {
  button.addEventListener("click", () => {
    if (!state.exploring) setExploring(true);
    rotateExplorationPlane(button.dataset.planeDirection);
  });
}
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const direction = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  }[event.key];
  if (!direction) return;
  if (elements.planeArrows[0]?.disabled) return;
  const tagName = event.target?.tagName;
  if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") {
    return;
  }
  event.preventDefault();
  if (!state.exploring) setExploring(true);
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

const initialCase =
  new URLSearchParams(window.location.search).get("case") ?? "cone-box-001";
loadCase(CASE_URLS[initialCase] ? initialCase : "cone-box-001")
  .catch(showFatalError);

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
  }),
  loadCase,
};
