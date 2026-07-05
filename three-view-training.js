import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BlockArray } from "./geometry/block-array.js";

const CASE_URLS = {
  "black-white-blocks-001": "/data/three-view-cases/black-white-blocks-001.json",
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const COLOR_LABELS = { white: "白", black: "黑" };
const CUBE_COLORS = {
  white: 0xf8fafc,
  black: 0x111827,
};

const elements = {
  caseSelect: document.getElementById("case-select"),
  caseStatus: document.getElementById("case-status"),
  title: document.getElementById("question-title"),
  prompt: document.getElementById("question-prompt"),
  sourceNote: document.getElementById("source-note"),
  leftViewGrid: document.getElementById("left-view-grid"),
  topViewGrid: document.getElementById("top-view-grid"),
  optionList: document.getElementById("option-list"),
  answerState: document.getElementById("answer-state"),
  canvas: document.getElementById("three-view-canvas"),
  modelStage: document.querySelector(".model-stage"),
  blockCountBadge: document.getElementById("block-count-badge"),
  blackCountBadge: document.getElementById("black-count-badge"),
  whiteCountBadge: document.getElementById("white-count-badge"),
  actualMainGrid: document.getElementById("actual-main-grid"),
  actualLeftGrid: document.getElementById("actual-left-grid"),
  actualTopGrid: document.getElementById("actual-top-grid"),
  validationState: document.getElementById("validation-state"),
  shortTip: document.getElementById("short-tip"),
  techniqueList: document.getElementById("technique-list"),
  feedbackCard: document.getElementById("feedback-card"),
  optionFocusList: document.getElementById("option-focus-list"),
  resetCamera: document.getElementById("reset-camera"),
  viewButtons: [...document.querySelectorAll("[data-view-mode]")],
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf9fbfa);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

const modelGroup = new THREE.Group();
modelGroup.name = "ThreeViewBlockModel";
scene.add(modelGroup);

const ambient = new THREE.AmbientLight(0xffffff, 1.1);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 7, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xdbeafe, 1.3);
rimLight.position.set(-4, 3, -5);
scene.add(rimLight);

const grid = new THREE.GridHelper(6, 6, 0x9fb5ad, 0xd7e2de);
grid.position.y = -1.55;
scene.add(grid);

const state = {
  caseData: null,
  selectedOptionId: null,
  viewMode: "free",
  animationId: null,
};

function normalizeGridCell(cell) {
  if (cell == null) return null;
  if (cell !== "white" && cell !== "black") {
    throw new RangeError(`unknown grid cell "${cell}"`);
  }
  return cell;
}

function axisValue(block, axis) {
  const index = AXIS_INDEX[axis];
  if (index == null) throw new RangeError(`unknown axis "${axis}"`);
  return block.position[index];
}

function orderedValues(order) {
  if (order === "low-to-high") return [0, 1, 2];
  if (order === "high-to-low") return [2, 1, 0];
  throw new RangeError(`unknown order "${order}"`);
}

export function projectView(blocks, rule) {
  const horizontalValues = orderedValues(rule.horizontalOrder);
  const verticalValues = orderedValues(rule.verticalOrder);
  const depthValues = orderedValues(rule.depthOrder);

  return verticalValues.map((verticalValue) => (
    horizontalValues.map((horizontalValue) => {
      for (const depthValue of depthValues) {
        const visible = blocks.find((block) => (
          axisValue(block, rule.horizontalAxis) === horizontalValue
          && axisValue(block, rule.verticalAxis) === verticalValue
          && axisValue(block, rule.depthAxis) === depthValue
        ));
        if (visible) return visible.color;
      }
      return null;
    })
  ));
}

function gridsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function countBlocks(blocks) {
  return blocks.reduce((acc, block) => {
    acc.total += 1;
    acc[block.color] += 1;
    return acc;
  }, { total: 0, white: 0, black: 0 });
}

export function validateThreeViewCase(caseData) {
  const positions = caseData.blocks.map((block) => block.position);
  const blockArray = new BlockArray(positions);
  const counts = countBlocks(caseData.blocks);
  const errors = [];

  if (blockArray.size !== caseData.blocks.length) {
    errors.push("存在重复方块坐标");
  }
  for (const key of ["total", "white", "black"]) {
    if (counts[key] !== caseData.counts[key]) {
      errors.push(`${key} 数量不一致`);
    }
  }

  const projectedMain = projectView(caseData.blocks, caseData.viewRules.main);
  const projectedLeft = projectView(caseData.blocks, caseData.viewRules.left);
  const projectedTop = projectView(caseData.blocks, caseData.viewRules.top);

  if (!gridsEqual(projectedMain, caseData.targetViews.main)) {
    errors.push("模型主视图与正确答案不一致");
  }
  if (!gridsEqual(projectedLeft, caseData.givenViews.left)) {
    errors.push("模型左视图与题面不一致");
  }
  if (!gridsEqual(projectedTop, caseData.givenViews.top)) {
    errors.push("模型俯视图与题面不一致");
  }
  if (!caseData.options.some((option) => option.id === caseData.answer)) {
    errors.push("正确答案不在选项中");
  }

  return {
    ok: errors.length === 0,
    errors,
    counts,
    projected: {
      main: projectedMain,
      left: projectedLeft,
      top: projectedTop,
    },
  };
}

function renderViewGrid(container, gridData, label = "") {
  container.innerHTML = "";
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", label);
  for (const row of gridData) {
    for (const rawCell of row) {
      const cell = normalizeGridCell(rawCell);
      const node = document.createElement("span");
      node.className = `view-cell ${cell ? `is-${cell}` : "is-empty"}`;
      node.dataset.cell = cell || "empty";
      node.setAttribute("aria-label", cell ? `${COLOR_LABELS[cell]}块` : "空位");
      container.appendChild(node);
    }
  }
}

function renderOption(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "option-card";
  button.dataset.optionId = option.id;
  button.setAttribute("role", "listitem");
  button.setAttribute("aria-label", `选择 ${option.label}`);

  const grid = document.createElement("div");
  grid.className = "view-grid compact";
  renderViewGrid(grid, option.grid, `${option.label} 选项`);

  const label = document.createElement("strong");
  label.textContent = option.label;

  button.append(grid, label);
  button.addEventListener("click", () => selectOption(option.id));
  return button;
}

function renderOptions(caseData) {
  elements.optionList.innerHTML = "";
  for (const option of caseData.options) {
    elements.optionList.appendChild(renderOption(option));
  }
}

function cubePosition(position) {
  const [x, y, z] = position;
  return new THREE.Vector3(x - 1, y - 1, z - 1);
}

function disposeModel() {
  while (modelGroup.children.length) {
    const child = modelGroup.children.pop();
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  }
}

function addCube(block) {
  const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
  const material = new THREE.MeshStandardMaterial({
    color: CUBE_COLORS[block.color],
    roughness: 0.62,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(cubePosition(block.position));
  mesh.userData = { type: "threeViewCube", color: block.color, position: block.position };

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: block.color === "black" ? 0x020617 : 0x18232d,
      linewidth: 1,
    }),
  );
  edges.position.copy(mesh.position);
  edges.userData = { type: "threeViewCubeEdges", color: block.color, position: block.position };

  modelGroup.add(mesh, edges);
}

function renderModel(caseData) {
  disposeModel();
  for (const block of caseData.blocks) addCube(block);
  elements.modelStage.classList.add("is-ready");
  elements.canvas.dataset.blockCount = String(caseData.blocks.length);
  elements.canvas.dataset.blackCount = String(caseData.counts.black);
  elements.canvas.dataset.whiteCount = String(caseData.counts.white);
}

function setCamera(viewMode = "free") {
  state.viewMode = viewMode;
  elements.canvas.dataset.viewMode = viewMode;
  for (const button of elements.viewButtons) {
    button.classList.toggle("is-active", button.dataset.viewMode === viewMode);
  }

  controls.enabled = viewMode === "free";
  camera.up.set(0, 1, 0);

  if (viewMode === "main") {
    camera.position.set(0, 0, -7.2);
  } else if (viewMode === "left") {
    camera.position.set(-7.2, 0, 0);
    camera.up.set(0, -1, 0);
  } else if (viewMode === "top") {
    camera.position.set(0, -7.2, 0);
    camera.up.set(0, 0, 1);
  } else {
    camera.position.set(5.4, 4.5, 6.2);
  }

  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  controls.update();
}

function resizeRenderer() {
  const rect = elements.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);
  state.animationId = requestAnimationFrame(animate);
}

function renderTeaching(caseData) {
  elements.shortTip.textContent = caseData.teaching.short;
  elements.techniqueList.innerHTML = "";
  for (const step of caseData.teaching.steps) {
    const item = document.createElement("li");
    item.textContent = step;
    elements.techniqueList.appendChild(item);
  }

  elements.optionFocusList.innerHTML = "";
  for (const focus of caseData.teaching.optionFocus) {
    const item = document.createElement("li");
    item.textContent = focus;
    elements.optionFocusList.appendChild(item);
  }
}

function resetFeedback() {
  state.selectedOptionId = null;
  document.body.dataset.selectedOption = "";
  elements.answerState.textContent = "先选一个";
  elements.feedbackCard.className = "feedback-card";
  elements.feedbackCard.innerHTML = `
    <span>当前选择</span>
    <strong>还没有选择</strong>
    <p>点 A/B/C/D 后，这里会直接告诉你为什么对或错。</p>
  `;
  for (const button of elements.optionList.querySelectorAll(".option-card")) {
    button.classList.remove("is-selected", "is-correct", "is-wrong");
  }
}

function selectOption(optionId) {
  const caseData = state.caseData;
  const option = caseData.options.find((item) => item.id === optionId);
  if (!option) return;

  const isCorrect = option.id === caseData.answer;
  state.selectedOptionId = option.id;
  document.body.dataset.selectedOption = option.id;
  elements.answerState.textContent = isCorrect ? "答对了" : "再想想";
  elements.answerState.dataset.result = isCorrect ? "correct" : "wrong";
  elements.canvas.dataset.selectedOption = option.id;

  for (const button of elements.optionList.querySelectorAll(".option-card")) {
    const selected = button.dataset.optionId === option.id;
    const correct = button.dataset.optionId === caseData.answer;
    button.classList.toggle("is-selected", selected);
    button.classList.toggle("is-correct", selected && correct);
    button.classList.toggle("is-wrong", selected && !correct);
  }

  elements.feedbackCard.className = `feedback-card ${isCorrect ? "is-correct" : "is-wrong"}`;
  elements.feedbackCard.innerHTML = `
    <span>当前选择：${option.label}</span>
    <strong>${isCorrect ? "正确，就是这个主视图" : "这个选项先排除"}</strong>
    <p>${option.feedback}</p>
  `;
}

function renderCase(caseData) {
  state.caseData = caseData;
  const validation = validateThreeViewCase(caseData);

  elements.caseStatus.textContent = validation.ok ? "已核验" : "需检查";
  elements.validationState.textContent = validation.ok ? "模型通过" : "模型异常";
  elements.validationState.dataset.valid = validation.ok ? "true" : "false";
  elements.canvas.dataset.validation = validation.ok ? "pass" : "fail";
  elements.canvas.dataset.validationErrors = validation.errors.join("；");

  elements.title.textContent = caseData.title;
  elements.prompt.textContent = caseData.prompt;
  elements.sourceNote.textContent = caseData.source.note;
  elements.blockCountBadge.textContent = `${validation.counts.total} 块`;
  elements.blackCountBadge.textContent = `${validation.counts.black} 黑`;
  elements.whiteCountBadge.textContent = `${validation.counts.white} 白`;

  renderViewGrid(elements.leftViewGrid, caseData.givenViews.left, "题面左视图");
  renderViewGrid(elements.topViewGrid, caseData.givenViews.top, "题面俯视图");
  renderViewGrid(elements.actualMainGrid, validation.projected.main, "模型计算出的主视图");
  renderViewGrid(elements.actualLeftGrid, validation.projected.left, "模型计算出的左视图");
  renderViewGrid(elements.actualTopGrid, validation.projected.top, "模型计算出的俯视图");
  renderOptions(caseData);
  renderTeaching(caseData);
  renderModel(caseData);
  resetFeedback();
  setCamera("free");

  if (!validation.ok) {
    elements.feedbackCard.innerHTML = `
      <span>数据校验</span>
      <strong>这道题还不能交给学生</strong>
      <p>${validation.errors.join("；")}</p>
    `;
  }
}

async function loadCase(caseId) {
  const url = CASE_URLS[caseId];
  if (!url) throw new Error(`unknown three-view case "${caseId}"`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to load ${url}: ${response.status}`);
  const caseData = await response.json();
  renderCase(caseData);
}

for (const button of elements.viewButtons) {
  button.addEventListener("click", () => setCamera(button.dataset.viewMode));
}

elements.resetCamera.addEventListener("click", () => setCamera("free"));
elements.caseSelect.addEventListener("change", () => loadCase(elements.caseSelect.value));
window.addEventListener("resize", resizeRenderer);

loadCase(elements.caseSelect.value).catch((error) => {
  elements.title.textContent = "题目载入失败";
  elements.prompt.textContent = error.message;
  elements.canvas.dataset.validation = "load-failed";
  console.error(error);
});

animate();

window.__threeViewTraining = {
  getState() {
    return {
      caseId: state.caseData?.id || null,
      selectedOptionId: state.selectedOptionId,
      viewMode: state.viewMode,
      blockCount: state.caseData?.blocks.length || 0,
      validation: elements.canvas.dataset.validation,
      validationErrors: elements.canvas.dataset.validationErrors || "",
    };
  },
  projectView,
  validateThreeViewCase,
};
