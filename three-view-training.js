import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  VIEW_CAMERA_POSES,
  VIEW_LABELS,
  normalizeThreeViewCase,
  validateThreeViewBank,
  validateThreeViewCase,
} from "./three-view-case-engine.js";

const BANK_URL = "/data/three-view-cases/black-white-blocks-50.json";
const RECORDS_KEY = "gongtu.threeViewTraining.records.v1";
const COLOR_LABELS = { white: "白", black: "黑" };
const CUBE_COLORS = {
  white: 0xf8fafc,
  black: 0x111827,
};

const elements = {
  groupSelect: document.getElementById("group-select"),
  groupLabel: document.getElementById("group-label"),
  caseStatus: document.getElementById("case-status"),
  progressLabel: document.getElementById("progress-label"),
  timerLabel: document.getElementById("timer-label"),
  historyLabel: document.getElementById("history-label"),
  title: document.getElementById("question-title"),
  prompt: document.getElementById("question-prompt"),
  sourceNote: document.getElementById("source-note"),
  givenViews: document.getElementById("given-views"),
  targetViewLabel: document.getElementById("target-view-label"),
  optionList: document.getElementById("option-list"),
  answerState: document.getElementById("answer-state"),
  nextQuestion: document.getElementById("next-question"),
  restartGroup: document.getElementById("restart-group"),
  groupResult: document.getElementById("group-result"),
  resultTitle: document.getElementById("result-title"),
  resultStats: document.getElementById("result-stats"),
  resultMistakes: document.getElementById("result-mistakes"),
  canvas: document.getElementById("three-view-canvas"),
  modelPanel: document.querySelector(".model-panel"),
  modelStage: document.querySelector(".model-stage"),
  modelGate: document.getElementById("model-gate"),
  blockCountBadge: document.getElementById("block-count-badge"),
  blackCountBadge: document.getElementById("black-count-badge"),
  whiteCountBadge: document.getElementById("white-count-badge"),
  actualViews: document.getElementById("actual-views"),
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

scene.add(new THREE.AmbientLight(0xffffff, 1.1));
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
  bank: null,
  casesById: new Map(),
  group: null,
  groupCases: [],
  questionIndex: 0,
  answers: [],
  selectedOptionId: null,
  viewMode: "free",
  questionStartedAt: 0,
  groupStartedAt: 0,
  timerId: null,
  animationId: null,
};

function normalizeGridCell(cell) {
  if (cell == null) return null;
  if (cell !== "white" && cell !== "black") {
    throw new RangeError(`unknown grid cell "${cell}"`);
  }
  return cell;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, 30)));
}

function lastRecordForGroup(groupId) {
  return readRecords().find((record) => record.groupId === groupId) || null;
}

function renderHistory() {
  const record = state.group ? lastRecordForGroup(state.group.id) : null;
  if (!record) {
    elements.historyLabel.textContent = "本组暂无记录";
    return;
  }
  elements.historyLabel.textContent = `上次 ${record.correct}/${record.total}，${formatTime(record.durationMs)}`;
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

function createViewFigure(viewKey, gridData, prefix = "") {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  const grid = document.createElement("div");
  caption.textContent = `${prefix}${VIEW_LABELS[viewKey] || viewKey}`;
  grid.className = "view-grid";
  renderViewGrid(grid, gridData, caption.textContent);
  figure.append(caption, grid);
  return figure;
}

function renderGivenViews(caseData) {
  elements.givenViews.innerHTML = "";
  for (const viewKey of caseData.givenViewKeys) {
    elements.givenViews.appendChild(createViewFigure(viewKey, caseData.givenViews[viewKey]));
  }
}

function renderActualViews(validation) {
  elements.actualViews.innerHTML = "";
  for (const viewKey of ["main", "left", "right", "top"]) {
    const figure = createViewFigure(viewKey, validation.projected[viewKey], "模型");
    figure.querySelector(".view-grid").classList.add("compact");
    elements.actualViews.appendChild(figure);
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
  // The case grid treats x as left-to-right on screen; mirror it once at the Three.js boundary.
  return new THREE.Vector3(1 - x, y - 1, z - 1);
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

  const isAnswered = document.body.dataset.answered === "true";
  controls.enabled = isAnswered && viewMode === "free";
  const pose = VIEW_CAMERA_POSES[viewMode] || VIEW_CAMERA_POSES.free;
  elements.canvas.dataset.cameraPosition = pose.position.join(",");
  elements.canvas.dataset.cameraUp = pose.up.join(",");
  camera.up.set(...pose.up);
  camera.position.set(...pose.position);

  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  controls.update();
}

function setModelAccess(isUnlocked) {
  elements.modelStage.dataset.revealed = isUnlocked ? "true" : "false";
  elements.canvas.setAttribute("aria-hidden", isUnlocked ? "false" : "true");
  for (const button of elements.viewButtons) {
    button.disabled = !isUnlocked;
  }
  elements.resetCamera.disabled = !isUnlocked;
  controls.enabled = isUnlocked && state.viewMode === "free";
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

function currentCase() {
  return state.groupCases[state.questionIndex] || null;
}

function updateTimer() {
  if (!state.groupStartedAt) {
    elements.timerLabel.textContent = "00:00";
    return;
  }
  elements.timerLabel.textContent = formatTime(Date.now() - state.groupStartedAt);
}

function resetFeedback() {
  state.selectedOptionId = null;
  document.body.dataset.selectedOption = "";
  document.body.dataset.answered = "false";
  setModelAccess(false);
  elements.answerState.textContent = "先选一个";
  elements.answerState.dataset.result = "";
  elements.nextQuestion.disabled = true;
  elements.nextQuestion.textContent = state.questionIndex === state.groupCases.length - 1 ? "完成训练" : "下一题";
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

function saveCurrentAnswer(option, isCorrect) {
  state.answers[state.questionIndex] = {
    caseId: currentCase().id,
    selected: option.id,
    correct: isCorrect,
    elapsedMs: Date.now() - state.questionStartedAt,
  };
}

function selectOption(optionId) {
  const caseData = currentCase();
  const option = caseData.options.find((item) => item.id === optionId);
  if (!option) return;

  const isCorrect = option.id === caseData.answer;
  state.selectedOptionId = option.id;
  saveCurrentAnswer(option, isCorrect);
  document.body.dataset.selectedOption = option.id;
  document.body.dataset.answered = "true";
  setModelAccess(true);
  elements.answerState.textContent = isCorrect ? "答对了" : "再想想";
  elements.answerState.dataset.result = isCorrect ? "correct" : "wrong";
  elements.canvas.dataset.selectedOption = option.id;
  elements.nextQuestion.disabled = false;

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
    <strong>${isCorrect ? `正确，就是这个${VIEW_LABELS[caseData.targetViewKey]}` : "这个选项先排除"}</strong>
    <p>${option.feedback}</p>
  `;
  requestAnimationFrame(resizeRenderer);
}

function renderCase(rawCaseData) {
  const caseData = normalizeThreeViewCase(rawCaseData);
  const validation = validateThreeViewCase(caseData);

  elements.caseStatus.textContent = validation.ok ? "已核验" : "需检查";
  elements.validationState.textContent = validation.ok ? "模型通过" : "模型异常";
  elements.validationState.dataset.valid = validation.ok ? "true" : "false";
  elements.canvas.dataset.validation = validation.ok ? "pass" : "fail";
  elements.canvas.dataset.validationErrors = validation.errors.join("；");

  elements.groupLabel.textContent = state.group?.title || "训练组";
  elements.progressLabel.textContent = `第 ${state.questionIndex + 1} / ${state.groupCases.length} 题`;
  elements.title.textContent = caseData.title;
  elements.prompt.textContent = caseData.prompt;
  elements.targetViewLabel.textContent = VIEW_LABELS[caseData.targetViewKey] || caseData.targetViewKey;
  elements.sourceNote.textContent = caseData.source.note;
  elements.blockCountBadge.textContent = `${validation.counts.total} 块`;
  elements.blackCountBadge.textContent = `${validation.counts.black} 黑`;
  elements.whiteCountBadge.textContent = `${validation.counts.white} 白`;
  elements.groupResult.hidden = true;

  renderGivenViews(caseData);
  renderActualViews(validation);
  renderOptions(caseData);
  renderTeaching(caseData);
  renderModel(caseData);
  resetFeedback();
  setCamera("free");
  state.questionStartedAt = Date.now();

  if (!validation.ok) {
    elements.feedbackCard.innerHTML = `
      <span>数据校验</span>
      <strong>这道题还不能交给学生</strong>
      <p>${validation.errors.join("；")}</p>
    `;
  }
}

function renderGroupResult(record) {
  elements.groupResult.hidden = false;
  const accuracy = Math.round((record.correct / record.total) * 100);
  elements.resultTitle.textContent = `${state.group.title} 完成`;
  elements.resultStats.innerHTML = `
    <span>${record.correct}/${record.total} 正确</span>
    <span>正确率 ${accuracy}%</span>
    <span>总用时 ${formatTime(record.durationMs)}</span>
    <span>平均 ${formatTime(record.averageMs)}</span>
  `;
  elements.resultMistakes.innerHTML = "";
  const mistakes = record.answers.filter((answer) => !answer.correct);
  if (!mistakes.length) {
    const item = document.createElement("li");
    item.textContent = "这一组全对，保持这个节奏。";
    elements.resultMistakes.appendChild(item);
    return;
  }
  for (const answer of mistakes) {
    const caseNumber = state.groupCases.findIndex((caseData) => caseData.id === answer.caseId) + 1;
    const item = document.createElement("li");
    item.textContent = `第 ${caseNumber} 题选了 ${answer.selected}，回看这题的两个给定视图和正确答案。`;
    elements.resultMistakes.appendChild(item);
  }
}

function completeGroup() {
  const durationMs = Date.now() - state.groupStartedAt;
  const answers = state.answers.slice(0, state.groupCases.length);
  const correct = answers.filter((answer) => answer?.correct).length;
  const record = {
    groupId: state.group.id,
    groupTitle: state.group.title,
    completedAt: new Date().toISOString(),
    total: state.groupCases.length,
    correct,
    durationMs,
    averageMs: Math.round(durationMs / state.groupCases.length),
    answers,
  };
  writeRecords([record, ...readRecords()]);
  renderHistory();
  renderGroupResult(record);
  elements.nextQuestion.disabled = true;
  elements.nextQuestion.textContent = "已完成";
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function moveNext() {
  if (!state.answers[state.questionIndex]) return;
  if (state.questionIndex >= state.groupCases.length - 1) {
    completeGroup();
    return;
  }
  state.questionIndex += 1;
  renderCase(currentCase());
}

function startGroup(groupId) {
  const group = state.bank.groups.find((item) => item.id === groupId) || state.bank.groups[0];
  state.group = group;
  state.groupCases = group.caseIds.map((caseId) => state.casesById.get(caseId));
  state.questionIndex = 0;
  state.answers = [];
  state.groupStartedAt = Date.now();
  state.questionStartedAt = Date.now();
  elements.groupSelect.value = group.id;
  renderHistory();
  renderCase(currentCase());
  updateTimer();
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(updateTimer, 1000);
}

function renderGroupOptions(bank) {
  elements.groupSelect.innerHTML = "";
  for (const group of bank.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = `${group.title} · 5题`;
    elements.groupSelect.appendChild(option);
  }
}

async function loadBank() {
  const response = await fetch(BANK_URL);
  if (!response.ok) throw new Error(`failed to load ${BANK_URL}: ${response.status}`);
  const bank = await response.json();
  const validation = validateThreeViewBank(bank);
  if (!validation.ok) throw new Error(validation.errors.join("；"));
  state.bank = bank;
  state.casesById = new Map(bank.cases.map((caseData) => [caseData.id, caseData]));
  elements.canvas.dataset.bankValidation = "pass";
  elements.canvas.dataset.caseCount = String(bank.cases.length);
  renderGroupOptions(bank);
  const requestedGroup = new URLSearchParams(location.search).get("group");
  startGroup(requestedGroup || bank.groups[0].id);
}

for (const button of elements.viewButtons) {
  button.addEventListener("click", () => setCamera(button.dataset.viewMode));
}

elements.resetCamera.addEventListener("click", () => setCamera("free"));
elements.groupSelect.addEventListener("change", () => startGroup(elements.groupSelect.value));
elements.nextQuestion.addEventListener("click", moveNext);
elements.restartGroup.addEventListener("click", () => startGroup(state.group.id));
window.addEventListener("resize", resizeRenderer);

loadBank().catch((error) => {
  elements.title.textContent = "题库载入失败";
  elements.prompt.textContent = error.message;
  elements.canvas.dataset.validation = "load-failed";
  console.error(error);
});

animate();

window.__threeViewTraining = {
  getState() {
    return {
      bankId: state.bank?.id || null,
      groupId: state.group?.id || null,
      questionIndex: state.questionIndex,
      groupSize: state.groupCases.length,
      caseId: currentCase()?.id || null,
      selectedOptionId: state.selectedOptionId,
      answeredCount: state.answers.filter(Boolean).length,
      viewMode: state.viewMode,
      cameraPosition: camera.position.toArray().map((value) => Number(value.toFixed(2))),
      cameraUp: camera.up.toArray().map((value) => Number(value.toFixed(2))),
      blockCount: currentCase()?.blocks.length || 0,
      validation: elements.canvas.dataset.validation,
      bankValidation: elements.canvas.dataset.bankValidation || "",
      validationErrors: elements.canvas.dataset.validationErrors || "",
      records: readRecords(),
    };
  },
  validateThreeViewCase,
  validateThreeViewBank,
};
