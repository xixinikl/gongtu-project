import * as THREE from "/node_modules/three/build/three.module.js";
import { OrbitControls } from "/node_modules/three/examples/jsm/controls/OrbitControls.js";
import { createCuttingPlane } from "/geometry/cutting-plane.js";

const canvas = document.querySelector("#geometryCanvas");
const viewport = canvas?.closest(".viewport");
const placeholder = document.querySelector("#stagePlaceholder");
const statusChip = document.querySelector(".status-chip");
const resetViewButton = document.querySelector('[aria-label="复位视角"]');
const zoomInButton = document.querySelector('[aria-label="放大三维视图"]');
const zoomOutButton = document.querySelector('[aria-label="缩小三维视图"]');

if (!(canvas instanceof HTMLCanvasElement) || !(viewport instanceof HTMLElement)) {
  throw new Error("空间几何实验室缺少必要的三维视口元素");
}

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  if (statusChip) {
    statusChip.textContent = "浏览器不支持 3D";
    statusChip.dataset.state = "error";
  }
  if (placeholder) {
    const message = placeholder.querySelector("span");
    if (message) {
      message.textContent = "当前浏览器无法启动 WebGL，请升级浏览器或检查图形加速设置。";
    }
  }
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.name = "GongTuGeometryScene";

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.name = "MainPerspectiveCamera";
const defaultCameraPosition = new THREE.Vector3(5.4, 4.2, 6.8);
const defaultTarget = new THREE.Vector3(0, 0.35, 0);
camera.position.copy(defaultCameraPosition);
camera.lookAt(defaultTarget);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(defaultTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = true;
controls.enableZoom = false;
controls.screenSpacePanning = true;
controls.minDistance = 2.8;
controls.maxDistance = 18;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI - 0.08;
controls.update();

const hemisphereLight = new THREE.HemisphereLight(0xfff8e8, 0x44645f, 2.1);
hemisphereLight.name = "HemisphereFill";
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xfff1d2, 3.2);
keyLight.name = "KeyLight";
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xb6e1dc, 1.5);
rimLight.name = "RimLight";
rimLight.position.set(-6, 3, -4);
scene.add(rimLight);

const helpers = new THREE.Group();
helpers.name = "CoordinateHelpers";

const grid = new THREE.GridHelper(12, 24, 0x9f8b6c, 0xd6cbbb);
grid.name = "GroundGrid";
grid.position.y = -1.5;
grid.material.transparent = true;
grid.material.opacity = 0.48;
helpers.add(grid);

const axes = new THREE.AxesHelper(2.25);
axes.name = "WorldAxes";
axes.position.y = -1.48;
helpers.add(axes);

const originGeometry = new THREE.RingGeometry(0.08, 0.13, 32);
const originMaterial = new THREE.MeshBasicMaterial({
  color: 0x5f5040,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.8,
});
const originMarker = new THREE.Mesh(originGeometry, originMaterial);
originMarker.name = "OriginMarker";
originMarker.position.y = -1.47;
originMarker.rotation.x = -Math.PI / 2;
helpers.add(originMarker);

function createAxisLabel(text, color) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 128;
  labelCanvas.height = 128;
  const context = labelCanvas.getContext("2d");

  context.clearRect(0, 0, 128, 128);
  context.fillStyle = "rgba(255, 253, 248, 0.94)";
  context.beginPath();
  context.arc(64, 64, 42, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 7;
  context.stroke();
  context.fillStyle = color;
  context.font = "700 58px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 64, 62);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `${text}AxisLabel`;
  sprite.scale.setScalar(0.42);
  return sprite;
}

const xLabel = createAxisLabel("X", "#c65345");
xLabel.position.set(2.45, -1.48, 0);
helpers.add(xLabel);

const yLabel = createAxisLabel("Y", "#3e8b67");
yLabel.position.set(0, 1.02, 0);
helpers.add(yLabel);

const zLabel = createAxisLabel("Z", "#3975ad");
zLabel.position.set(0, -1.48, 2.45);
helpers.add(zLabel);

scene.add(helpers);

const cuttingPlane = createCuttingPlane({ size: 7 });
scene.add(cuttingPlane.visual);

function resizeRenderer() {
  const { width, height } = viewport.getBoundingClientRect();
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  renderer.setSize(safeWidth, safeHeight, false);
  camera.aspect = safeWidth / safeHeight;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resizeRenderer);
resizeObserver.observe(viewport);
resizeRenderer();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

function updateCameraState() {
  canvas.dataset.cameraPosition = camera.position
    .toArray()
    .map((value) => value.toFixed(3))
    .join(",");
  canvas.dataset.cameraTarget = controls.target
    .toArray()
    .map((value) => value.toFixed(3))
    .join(",");
}

function resetView() {
  camera.position.copy(defaultCameraPosition);
  controls.target.copy(defaultTarget);
  controls.update();
  updateCameraState();
}

function zoomView(scale) {
  const offset = camera.position.clone().sub(controls.target);
  const nextDistance = THREE.MathUtils.clamp(
    offset.length() * scale,
    controls.minDistance,
    controls.maxDistance,
  );

  offset.setLength(nextDistance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
  updateCameraState();
}

function zoomIn() {
  zoomView(0.82);
}

function zoomOut() {
  zoomView(1 / 0.82);
}

controls.addEventListener("change", updateCameraState);
resetViewButton?.addEventListener("click", resetView);
zoomInButton?.addEventListener("click", zoomIn);
zoomOutButton?.addEventListener("click", zoomOut);
updateCameraState();

if (placeholder) {
  placeholder.hidden = true;
}
if (statusChip) {
  statusChip.textContent = "3D 场景已启动";
  statusChip.dataset.state = "ready";
}
canvas.dataset.sceneReady = "true";
canvas.dataset.renderer = "webgl";
canvas.dataset.camera = camera.name;
canvas.dataset.lightCount = "3";
canvas.dataset.clipping = String(renderer.localClippingEnabled);
canvas.dataset.orbitControls = "true";
canvas.dataset.wheelZoom = String(controls.enableZoom);
canvas.dataset.zoomControls = "buttons";
canvas.dataset.zoomRange = `${controls.minDistance},${controls.maxDistance}`;
canvas.dataset.coordinateHelpers = "grid,axes,origin,x-label,y-label,z-label";
canvas.dataset.cuttingPlane = "visible";
canvas.dataset.cuttingPlaneExtent = cuttingPlane.visual.userData.mathematicalExtent;
canvas.dataset.cuttingPlaneNormal = cuttingPlane.plane.normal.toArray().join(",");
canvas.dataset.cuttingPlaneConstant = String(cuttingPlane.plane.constant);

const geometryLab = Object.freeze({
  THREE,
  scene,
  camera,
  renderer,
  controls,
  helpers,
  cuttingPlane,
  lights: Object.freeze({
    hemisphere: hemisphereLight,
    key: keyLight,
    rim: rimLight,
  }),
});

window.geometryLab = geometryLab;
window.dispatchEvent(new CustomEvent("geometry:scene-ready", { detail: geometryLab }));

window.addEventListener(
  "pagehide",
  () => {
    resetViewButton?.removeEventListener("click", resetView);
    zoomInButton?.removeEventListener("click", zoomIn);
    zoomOutButton?.removeEventListener("click", zoomOut);
    controls.removeEventListener("change", updateCameraState);
    controls.dispose();
    originGeometry.dispose();
    originMaterial.dispose();
    for (const child of helpers.children) {
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
    grid.geometry.dispose();
    grid.material.dispose();
    axes.geometry.dispose();
    axes.material.dispose();
    cuttingPlane.dispose();
    resizeObserver.disconnect();
    renderer.setAnimationLoop(null);
    renderer.dispose();
  },
  { once: true },
);
