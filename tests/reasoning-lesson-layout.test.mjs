import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../reasoning-lesson.html", import.meta.url);
const cssUrl = new URL("../reasoning-lesson.css", import.meta.url);
const scriptUrl = new URL("../reasoning-lesson.js", import.meta.url);
const foundationHtmlUrl = new URL("../section-foundation.html", import.meta.url);
const foundationCssUrl = new URL("../section-foundation.css", import.meta.url);
const foundationScriptUrl = new URL("../section-foundation.js", import.meta.url);
const caseUrls = [
  new URL("../data/reasoning-cases/cone-box-001.json", import.meta.url),
  new URL("../data/reasoning-cases/pyramid-cylinder-001.json", import.meta.url),
];
const draftIndexUrl = new URL(
  "../data/reasoning-cases/draft-video-questions.json",
  import.meta.url,
);

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("student lesson stays a deep lesson with one return to the spatial center", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /href="\/spatial-learning\.html"/);
  assert.doesNotMatch(html, /href="\/three-view-training\.html"/);
  assert.doesNotMatch(html, /href="\/section-foundation\.html"/);
  assert.doesNotMatch(html, /WASM 状态|三角面数量|模板调试/);
});

test("student lesson has all four same-screen learning regions", async () => {
  const html = await readFile(htmlUrl, "utf8");

  for (const id of [
    "question-heading",
    "option-list",
    "lesson-viewport",
    "foundation-note",
    "constraint-list",
    "verdict-card",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("student lesson exposes deterministic timeline and exploration controls", async () => {
  const html = await readFile(htmlUrl, "utf8");

  for (const id of [
    "previous-step",
    "play-lesson",
    "next-step",
    "reset-view",
    "explore-toggle",
    "plane-position",
    "plane-angle-output",
    "plane-live-readout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("lesson layout has desktop and narrow-screen arrangements", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.lesson-shell\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("constraint teaching prioritizes conflicts and protects the answer", async () => {
  const [script, css] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(script, /orderedIds = \[\.\.\.option\.violates, \.\.\.option\.satisfies\]/);
  assert.match(script, /不满足 · 排除依据/);
  assert.match(script, /满足 · 可行条件/);
  assert.match(script, /state\.machine\?\.answerRevealed/);
  assert.match(css, /\.constraint-summary\.has-conflict/);
  assert.match(css, /\.constraint-summary\.is-consistent/);
});

test("student lesson explains foundation knowledge before rejecting lookalike options", async () => {
  const [script, css] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(script, /FOUNDATION_NOTES/);
  assert.match(script, /单独的正方体或长方体确实可以截出六边形/);
  assert.match(script, /不能说“六边形不可能”/);
  assert.match(script, /foundationNoteCopy/);
  assert.match(css, /\.foundation-note/);
});

test("student lesson shows the original video question frame when available", async () => {
  const [script, css, coneCase, pyramidCase] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(caseUrls[0], "utf8"),
    readFile(caseUrls[1], "utf8"),
  ]);
  const caseData = JSON.parse(coneCase);
  const pyramidData = JSON.parse(pyramidCase);

  assert.match(caseData.source.image, /cone-box-001-question\.png$/);
  assert.match(pyramidData.source.image, /pyramid-cylinder-001-question-crop\.png$/);
  const pyramidImage = await readFile(
    new URL(`..${pyramidData.source.image}`, import.meta.url),
  );
  const dimensions = pngDimensions(pyramidImage);
  assert.ok(dimensions.width >= 900, "cropped question keeps option row readable");
  assert.ok(dimensions.height <= 520, "cropped question removes lower video explanation");
  assert.match(script, /source-question-image/);
  assert.match(script, /caseData\.source\.image/);
  assert.match(css, /\.source-figure\.has-image/);
});

test("student lesson separates draft video questions from verified cases", async () => {
  const [script, css, draftIndex] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(draftIndexUrl, "utf8"),
  ]);
  const index = JSON.parse(draftIndex);

  assert.equal(index.draftItems.length, 7);
  assert.equal(index.formalVideoCases.length, 2);
  const answeredDrafts = index.draftItems.filter(
    (item) => item.answerStatus === "user-provided-needs-review",
  );
  assert.equal(answeredDrafts.length, 4);
  assert.deepEqual(
    Object.fromEntries(answeredDrafts.map((item) => [item.id, item.candidateAnswer.optionId])),
    {
      "draft-section-cubes-7-blocks": "D",
      "draft-section-stair-model": "B",
      "draft-section-box-rectangles-01": "A",
      "draft-section-box-rectangles-03": "C",
    },
  );
  const coneFormal = index.formalVideoCases.find(
    (item) => item.caseId === "cone-box-001",
  );
  assert.equal(coneFormal.userProvidedAnswer.status, "conflict-needs-review");
  assert.equal(coneFormal.userProvidedAnswer.existingAnswer, "A");
  for (const item of index.draftItems) {
    assert.match(item.status, /^draft-/);
    assert.notEqual(item.answerStatus, "human-verified");
    assert.match(item.image, /^\/data\/images\/reasoning\/drafts\/.+\.png$/);
    assert.ok(item.videoFileName.endsWith(".mp4"), item.id);
    const image = await readFile(new URL(`..${item.image}`, import.meta.url));
    assert.ok(image.byteLength > 1000, `${item.id} screenshot is empty`);
  }
  assert.match(script, /DRAFT_CASE_INDEX_URL/);
  assert.match(script, /function renderDraftCase/);
  assert.match(script, /待核验草稿（只看题图）/);
  assert.match(script, /草稿题 · 未进入判题/);
  assert.match(script, /answer\.textContent = "待人工核验"/);
  assert.match(css, /\.draft-case-notice/);
  assert.match(css, /\.engine-status\[data-status="draft"\]/);
});

test("student lesson maps vertical movement to plane offset and horizontal movement to rotation", async () => {
  const [html, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  assert.match(html, /上下移动 · 左右旋转/);
  assert.match(html, /三维区可直接拖动；方向键备用/);
  assert.match(script, /function moveExplorationPlane/);
  assert.match(script, /function rotateExplorationPlaneBy/);
  assert.match(script, /function prepareExplorationPlane/);
  assert.match(script, /planeRotationRadians/);
  assert.match(script, /planeLiveSummary/);
  assert.match(script, /direction === "up"[\s\S]*moveExplorationPlane/);
  assert.match(script, /direction === "left"[\s\S]*rotateExplorationPlaneBy/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(script, /addEventListener\("pointermove"/);
  assert.doesNotMatch(
    script,
    /function planeGestureEnabled\(\)\s*\{\s*return !elements\.planePosition\.disabled;\s*\}/,
  );
});

test("student lesson compares candidate, actual section and 3D plane in one stage", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  for (const id of [
    "candidate-preview-drawing",
    "candidate-preview-meta",
    "candidate-preview-status",
    "section-preview-svg",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(css, /\.candidate-preview/);
  assert.match(css, /\.candidate-preview-drawing/);
  assert.match(css, /grid-template-columns: minmax\(170px, 0\.72fr\) minmax\(210px, 0\.9fr\) minmax\(250px, 1fr\)/);
  assert.match(script, /function renderCandidatePreview/);
  assert.match(script, /renderCandidatePreview\(option\)/);
  assert.match(script, /syncShapeComparisonActual/);
  assert.match(script, /function setTimelineControlsEnabled/);
  assert.match(script, /setTimelineControlsEnabled\(false\)/);
  assert.match(script, /setTimelineControlsEnabled\(true\)/);
  assert.match(script, /function cameraProjectedSectionSvg/);
  assert.match(script, /new THREE\.Vector3\(1, 0, 0\)[\s\S]*applyQuaternion\(camera\.quaternion\)/);
  assert.match(script, /sectionPreviewSvg\.dataset\.projection = "camera"/);
  assert.match(script, /function refreshCameraProjectedSection/);
  assert.match(script, /点 A\/B\/C\/D 后，再按当前 3D 方向显示真实截面/);
  assert.match(script, /先选一个选项后显示真实切面/);
  assert.match(script, /setPlaneControlsEnabled\(false\)/);
  assert.doesNotMatch(script, /图形能对上/);
  assert.match(script, /类型可验证/);
  assert.match(script, /如果当前真实截面和候选简图方向不一致，就不能说完全对上/);
});

test("student lesson keeps the front-facing section inside the 3D model itself", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  assert.doesNotMatch(html, /front-section-card|front-section-svg|front-section-meta/);
  assert.doesNotMatch(css, /\.front-section-card|#front-section-svg/);
  assert.doesNotMatch(script, /frontSectionCard|syncFrontSectionPreview/);
  assert.match(script, /function cameraFrameForFrontSection/);
  assert.match(script, /if \(!frame\.plane\) return \{ camera: frame\.camera, plane: null \}/);
  assert.match(script, /plane\.projectPoint\(target, new THREE\.Vector3\(\)\)/);
  assert.match(script, /function focusCameraOnSection/);
  assert.match(script, /sectionVisual\.fill\.material\.depthTest = false/);
  assert.match(script, /focusCameraOnSection\(result\)/);
  assert.match(script, /function syncSectionFacingMetric/);
  assert.match(script, /dataset\.sectionFacing = facing\.toFixed\(3\)/);
  assert.match(script, /function renderInitialSectionCue/);
  assert.match(script, /caseData\.keyframes\.find\(\(frame\) => frame\.plane\)/);
  assert.match(script, /renderInitialSectionCue\(caseData\)/);
  assert.match(script, /setCameraFrame\(cameraFrameForFrontSection\(frame\)\.camera\)/);
  assert.match(css, /\.shape-comparison\.is-hidden[\s\S]*visibility: hidden/);
  assert.match(css, /\.foundation-note\.is-hidden[\s\S]*visibility: hidden/);
});

test("every golden option has a human-readable constraint path", async () => {
  for (const url of caseUrls) {
    const caseData = JSON.parse(await readFile(url, "utf8"));
    const constraintIds = new Set(caseData.constraints.map(({ id }) => id));
    for (const option of caseData.options) {
      const path = [...option.violates, ...option.satisfies];
      assert.ok(path.length > 0, `${caseData.id}/${option.id} has no path`);
      assert.ok(option.reason.length >= 20, `${caseData.id}/${option.id} reason too short`);
      for (const id of path) {
        assert.ok(constraintIds.has(id), `${caseData.id}/${option.id} unknown ${id}`);
      }
    }
  }
});

test("formal lesson answer notes preserve user corrections without overwriting verified answers", async () => {
  const [coneRaw, pyramidRaw] = await Promise.all([
    readFile(caseUrls[0], "utf8"),
    readFile(caseUrls[1], "utf8"),
  ]);
  const coneCase = JSON.parse(coneRaw);
  const pyramidCase = JSON.parse(pyramidRaw);

  assert.equal(coneCase.answer.correctOptionId, "A");
  assert.equal(coneCase.answerReviewNotes[0].userProvidedOptionId, "B");
  assert.equal(coneCase.answerReviewNotes[0].status, "conflict-needs-review");
  assert.match(coneCase.answerReviewNotes[0].note, /暂不覆盖/);

  assert.equal(pyramidCase.answer.correctOptionId, "D");
  assert.equal(pyramidCase.answerReviewNotes[0].userProvidedOptionId, "D");
  assert.equal(
    pyramidCase.answerReviewNotes[0].status,
    "matches-existing-human-verified",
  );
});

test("foundation page lists base solids and section entry points", async () => {
  const [html, css, script] = await Promise.all([
    readFile(foundationHtmlUrl, "utf8"),
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(html, /id="solid-list"/);
  assert.match(html, /id="knowledge-grid"/);
  assert.match(html, /id="foundation-3d"/);
  assert.doesNotMatch(html, /id="demo-buttons"/);
  assert.match(html, /spatial-learning-shell\.js/);
  assert.match(html, /aria-label="立体图推学习路径"/);
  assert.match(css, /\.foundation-shell/);
  for (const word of ["正方体", "长方体", "圆柱", "圆锥", "棱锥"]) {
    assert.match(script, new RegExp(word));
  }
  for (const word of ["六边形", "椭圆", "不能直接截出", "典型切法"]) {
    assert.match(script + html, new RegExp(word));
  }
});

test("foundation page renders every common section as a visual tile", async () => {
  const [css, script] = await Promise.all([
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(script, /sectionTileList/);
  assert.match(script, /section-tile/);
  assert.match(css, /\.section-tile-list/);
  assert.match(css, /\.section-thumb/);
  for (const word of [
    "等边三角形",
    "直角三角形",
    "平行四边形",
    "带弧边截面",
    "斜切必然带曲边",
  ]) {
    assert.match(script, new RegExp(word));
  }
});

test("foundation visual tiles are tied to the current solid", async () => {
  const [css, script] = await Promise.all([
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(script, /renderSectionThumb3d\(solidId, item, verdict\)/);
  assert.match(script, /collectPlaneSectionPoints\(solidGeometry, normal, offset\)/);
  assert.match(script, /geometryEdgeSegments/);
  assert.match(script, /makeThumbProjectionBasis/);
  assert.match(script, /data-real-thumb="true"/);
  assert.match(script, /data-section-vertices/);
  assert.doesNotMatch(script, /drawingForSection\(solidId, item\)/);
  assert.doesNotMatch(script, /function shapePoints/);
  assert.match(css, /\.real-section-thumb \.thumb-section/);
  assert.match(css, /\.real-section-thumb \.thumb-vertex/);
  assert.match(css, /fill: rgba\(228, 86, 27, 0\.58\)/);
  assert.match(css, /\.thumb-solid-edge/);
  assert.match(css, /\.thumb-plane/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(146px, 1fr\)\)/);
});

test("foundation page uses an interactive 3D section viewer", async () => {
  const [html, css, script] = await Promise.all([
    readFile(foundationHtmlUrl, "utf8"),
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(html, /id="foundation-3d"/);
  assert.match(html, /id="reset-section"/);
  assert.match(html, /id="live-section-svg"/);
  assert.match(html, /id="live-section-verdict"/);
  assert.match(html, /这刀怎么摆/);
  assert.match(html, /active-cut-card[\s\S]*demo-stage/);
  assert.doesNotMatch(html, /切法选择/);
  assert.match(html, /"three": "\/node_modules\/three\/build\/three\.module\.js"/);
  assert.match(script, /import \* as THREE from "three"/);
  assert.match(script, /SECTION_3D_PRESETS/);
  assert.match(script, /collectPlaneSectionPoints/);
  assert.match(script, /makeSectionGeometryFromPoints/);
  assert.match(script, /updateRealSectionGeometry/);
  assert.match(script, /sectionPointsToLocal2d/);
  assert.match(script, /classifySectionPoints/);
  assert.match(script, /renderOrder = 8/);
  assert.match(script, /depthTest: false/);
  assert.match(script, /dataset\.realSection = "true"/);
  assert.match(script, /dataset\.actualSection/);
  assert.match(script, /dataset\.sectionVertexCount/);
  assert.match(script, /classifyTriangle/);
  assert.match(script, /boxTriangleCannotBeRight/);
  assert.match(script, /solidId === "cube" \|\| solidId === "cuboid"/);
  assert.match(script, /!boxTriangleCannotBeRight && hasRightAngle/);
  assert.match(script, /classifySectionPoints\(points, viewer\.normal, state\.selectedLabel, state\.solidId\)/);
  assert.match(script, /cannot: \["直角三角形", "圆", "椭圆", "曲边图形", "超过 6 条边"\]/);
  assert.match(script, /这个不能当成正方体的真实截面/);
  assert.match(script, /"直角三角形": \{ normal: \[1, 1, 1\]/);
  assert.match(script, /"梯形": \{ normal: \[0\.15, 0\.5, 0\.5\], offset: 0\.36/);
  assert.match(script, /POSITION_RULES/);
  assert.match(script, /先看蓝色刀片/);
  assert.match(script, /六条棱的中点/);
  assert.match(script, /不是正五边形/);
  assert.match(script, /一个面上接近走对角线/);
  assert.match(script, /把刀片斜着切圆柱/);
  assert.match(script, /把蓝色刀片放在一个顶角上/);
  assert.match(script, /buildViewerScene/);
  assert.match(script, /renderLiveSection/);
  assert.match(script, /dataset\.vertexCount/);
  assert.match(script, /data-section-label/);
  assert.match(script, /updateSectionOffset/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(css, /\.demo-stage-3d canvas/);
  assert.match(css, /\.active-cut-card/);
  assert.match(css, /\.live-section-card/);
  assert.match(css, /\.live-fill/);
  assert.match(css, /\.live-vertex/);
  assert.match(css, /cursor: ns-resize/);
});
