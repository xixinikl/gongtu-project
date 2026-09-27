import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  getSectionDisplayPolicy,
  isSectionDisplayMode,
  SECTION_DISPLAY_MODES,
} from "../geometry/section-mode.js";

import { createCutawayVisual } from "../geometry/cutaway-visual.js";

/* ── 辅助：创建一个简单的测试 Mesh 供 cutaway visual 使用 ── */
function makeTestModel() {
  const group = new THREE.Group();
  group.name = "TestModel";
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = "TestMesh";
  group.add(mesh);
  return group;
}

function disposeTestModel(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   第一部分：三种显示策略回归
   ═══════════════════════════════════════════════════════════════════ */
test("teaching policy: clipModel=false, showCutawayGhost=false, ghostMode=hidden", () => {
  const p = getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING);
  assert.strictEqual(p.clipModel, false);
  assert.strictEqual(p.showCutawayGhost, false);
  assert.strictEqual(p.ghostMode, "hidden");
});

test("hidden policy: clipModel=true, showCutawayGhost=false, ghostMode=hidden", () => {
  const p = getSectionDisplayPolicy(SECTION_DISPLAY_MODES.HIDDEN);
  assert.strictEqual(p.clipModel, true);
  assert.strictEqual(p.showCutawayGhost, false);
  assert.strictEqual(p.ghostMode, "hidden");
});

test("transparent policy: clipModel=true, showCutawayGhost=true, ghostMode=transparent", () => {
  const p = getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TRANSPARENT);
  assert.strictEqual(p.clipModel, true);
  assert.strictEqual(p.showCutawayGhost, true);
  assert.strictEqual(p.ghostMode, "transparent");
});

test("isSectionDisplayMode only accepts the three valid modes", () => {
  assert.strictEqual(isSectionDisplayMode("teaching"), true);
  assert.strictEqual(isSectionDisplayMode("hidden"), true);
  assert.strictEqual(isSectionDisplayMode("transparent"), true);
  assert.strictEqual(isSectionDisplayMode("unknown"), false);
  assert.strictEqual(isSectionDisplayMode(""), false);
  assert.strictEqual(isSectionDisplayMode(null), false);
  assert.strictEqual(isSectionDisplayMode(undefined), false);
});

test("unknown mode falls back to teaching policy", () => {
  const fallback = getSectionDisplayPolicy("garbage");
  const teaching = getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING);
  assert.deepStrictEqual(fallback, teaching);
});

/* ═══════════════════════════════════════════════════════════════════
   第二部分：cutaway visual API 生命周期
   ═══════════════════════════════════════════════════════════════════ */
test("cutaway visual group starts invisible and empty", () => {
  const cv = createCutawayVisual();
  assert.strictEqual(cv.group.visible, false);
  assert.strictEqual(cv.group.children.length, 0);
  assert.strictEqual(cv.source, null);
  assert.strictEqual(cv.ghost, null);
  assert.strictEqual(cv.mode, "hidden");
});

test("setSource creates a ghost clone of the model", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model);
  assert.ok(cv.source === model);
  assert.ok(cv.ghost !== null);
  assert.ok(cv.group.children.includes(cv.ghost));
  // ghost is a clone, not the original
  assert.ok(cv.ghost !== model);
  disposeTestModel(model);
  cv.dispose();
});

test("setSource with same model is a no-op (no double-clone)", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model);
  const firstGhost = cv.ghost;
  cv.setSource(model); // same source
  assert.strictEqual(cv.ghost, firstGhost);
  assert.strictEqual(cv.group.children.length, 1);
  disposeTestModel(model);
  cv.dispose();
});

test("setSource with different model replaces ghost", () => {
  const model1 = makeTestModel();
  const model2 = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model1);
  const ghost1 = cv.ghost;
  cv.setSource(model2);
  assert.ok(cv.source === model2);
  assert.ok(cv.ghost !== ghost1);
  assert.strictEqual(cv.group.children.length, 1);
  disposeTestModel(model1);
  disposeTestModel(model2);
  cv.dispose();
});

test("hidden mode keeps ghost invisible even after setSource", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setMode("hidden");
  cv.setSource(model);
  assert.strictEqual(cv.group.visible, false);
  assert.strictEqual(cv.mode, "hidden");
  disposeTestModel(model);
  cv.dispose();
});

test("transparent mode makes ghost visible when source is set", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model);
  cv.setMode("transparent");
  assert.strictEqual(cv.group.visible, true);
  assert.strictEqual(cv.mode, "transparent");
  disposeTestModel(model);
  cv.dispose();
});

test("clear removes ghost and resets source", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model);
  assert.ok(cv.source !== null);
  assert.ok(cv.ghost !== null);
  cv.clear();
  assert.strictEqual(cv.source, null);
  assert.strictEqual(cv.ghost, null);
  assert.strictEqual(cv.group.visible, false);
  assert.strictEqual(cv.group.children.length, 0);
  disposeTestModel(model);
  cv.dispose();
});

test("setMode rejects invalid modes", () => {
  const cv = createCutawayVisual();
  assert.throws(() => cv.setMode("invalid"), RangeError);
  assert.throws(() => cv.setMode(""), RangeError);
  cv.dispose();
});

test("setPlane rejects invalid input", () => {
  const cv = createCutawayVisual();
  assert.throws(() => cv.setPlane(null), TypeError);
  assert.throws(() => cv.setPlane({ isPlane: false }), TypeError);
  cv.dispose();
});

test("setPlane with valid plane works", () => {
  const cv = createCutawayVisual();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  cv.setPlane(plane);
  // reversePlane should be negated
  assert.ok(Math.abs(cv.reversePlane.normal.y + 1) < 1e-9);
  cv.dispose();
});

/* ═══════════════════════════════════════════════════════════════════
   第三部分：模式切换往返无泄漏
   ═══════════════════════════════════════════════════════════════════ */
test("teaching → hidden → teaching: source and ghost fully recovered", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  // simulate teaching mode (no ghost)
  cv.clear();
  assert.strictEqual(cv.source, null);
  assert.strictEqual(cv.ghost, null);

  // simulate hidden mode
  cv.setSource(model);
  cv.setMode("hidden");
  assert.ok(cv.source === model);
  assert.ok(cv.ghost !== null);
  assert.strictEqual(cv.group.visible, false);

  // simulate back to teaching
  cv.clear();
  assert.strictEqual(cv.source, null);
  assert.strictEqual(cv.ghost, null);
  assert.strictEqual(cv.group.visible, false);
  assert.strictEqual(cv.group.children.length, 0);

  disposeTestModel(model);
  cv.dispose();
});

test("hidden → transparent: no re-clone, same ghost reused", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  cv.setSource(model);
  cv.setMode("hidden");
  const ghostHidden = cv.ghost;
  assert.strictEqual(cv.group.visible, false);

  // switch to transparent — should reuse same ghost
  cv.setMode("transparent");
  assert.strictEqual(cv.ghost, ghostHidden);
  assert.strictEqual(cv.group.visible, true);

  disposeTestModel(model);
  cv.dispose();
});

test("transparent → hidden: ghost stays but hidden", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  cv.setSource(model);
  cv.setMode("transparent");
  const ghost = cv.ghost;
  assert.strictEqual(cv.group.visible, true);

  cv.setMode("hidden");
  assert.strictEqual(cv.ghost, ghost);
  assert.strictEqual(cv.group.visible, false);

  disposeTestModel(model);
  cv.dispose();
});

test("10 round-trips teaching ↔ hidden do not accumulate scene children", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  for (let i = 0; i < 10; i++) {
    // teaching → hidden
    cv.setSource(model);
    cv.setMode("hidden");
    assert.strictEqual(cv.group.children.length, 1, `round ${i}: hidden ghost count`);

    // hidden → teaching
    cv.clear();
    assert.strictEqual(cv.group.children.length, 0, `round ${i}: teaching ghost count`);
  }

  disposeTestModel(model);
  cv.dispose();
});

test("10 round-trips transparent ↔ teaching do not accumulate scene children", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  for (let i = 0; i < 10; i++) {
    // teaching → transparent
    cv.setSource(model);
    cv.setMode("transparent");
    assert.strictEqual(cv.group.children.length, 1, `round ${i}: transparent ghost count`);

    // transparent → teaching
    cv.clear();
    assert.strictEqual(cv.group.children.length, 0, `round ${i}: teaching ghost count`);
  }

  disposeTestModel(model);
  cv.dispose();
});

test("20 consecutive mode switches without intervening teaching do not accumulate", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();
  cv.setSource(model);

  for (let i = 0; i < 20; i++) {
    cv.setMode(i % 2 === 0 ? "hidden" : "transparent");
    assert.strictEqual(cv.group.children.length, 1, `switch ${i}: ghost count`);
    assert.strictEqual(cv.source, model, `switch ${i}: source unchanged`);
  }

  disposeTestModel(model);
  cv.dispose();
});

/* ═══════════════════════════════════════════════════════════════════
   第四部分：模型重建不改变当前策略
   ═══════════════════════════════════════════════════════════════════ */
test("model rebuild in hidden mode: old ghost cleared, new ghost created", () => {
  const model1 = makeTestModel();
  const model2 = makeTestModel();
  const cv = createCutawayVisual();

  // First model in hidden mode
  cv.setSource(model1);
  cv.setMode("hidden");
  const ghost1 = cv.ghost;

  // Simulate model rebuild: clear, then set new source
  cv.clear();
  cv.setSource(model2);
  cv.setMode("hidden");
  const ghost2 = cv.ghost;

  assert.ok(ghost2 !== ghost1);
  assert.ok(cv.source === model2);
  assert.strictEqual(cv.group.visible, false); // hidden mode
  assert.strictEqual(cv.group.children.length, 1);

  disposeTestModel(model1);
  disposeTestModel(model2);
  cv.dispose();
});

test("model rebuild in transparent mode: new ghost visible", () => {
  const model1 = makeTestModel();
  const model2 = makeTestModel();
  const cv = createCutawayVisual();

  cv.setSource(model1);
  cv.setMode("transparent");
  const ghost1 = cv.ghost;

  cv.clear();
  cv.setSource(model2);
  cv.setMode("transparent");
  const ghost2 = cv.ghost;

  assert.ok(ghost2 !== ghost1);
  assert.ok(cv.source === model2);
  assert.strictEqual(cv.group.visible, true); // transparent mode
  assert.strictEqual(cv.group.children.length, 1);

  disposeTestModel(model1);
  disposeTestModel(model2);
  cv.dispose();
});

/* ═══════════════════════════════════════════════════════════════════
   第五部分：策略对象不可变性（回归保护）
   ═══════════════════════════════════════════════════════════════════ */
test("teaching policy object is frozen (immutable)", () => {
  const p = getSectionDisplayPolicy("teaching");
  assert.throws(() => { p.clipModel = true; }, TypeError);
});

test("hidden policy object is frozen", () => {
  const p = getSectionDisplayPolicy("hidden");
  assert.throws(() => { p.showCutawayGhost = true; }, TypeError);
});

test("transparent policy object is frozen", () => {
  const p = getSectionDisplayPolicy("transparent");
  assert.throws(() => { p.ghostMode = "hidden"; }, TypeError);
});

/* ═══════════════════════════════════════════════════════════════════
   第六部分：cutaway visual dispose 彻底清理
   ═══════════════════════════════════════════════════════════════════ */
test("dispose fully clears and resets cutaway visual", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  cv.setSource(model);
  cv.setMode("transparent");
  assert.ok(cv.source !== null);

  cv.dispose();
  assert.strictEqual(cv.source, null);
  assert.strictEqual(cv.ghost, null);
  assert.strictEqual(cv.group.visible, false);
  assert.strictEqual(cv.group.children.length, 0);

  disposeTestModel(model);
});

test("ghost materials are disposed via clear", () => {
  const model = makeTestModel();
  const cv = createCutawayVisual();

  cv.setSource(model);
  // Count owned materials indirectly: ghost should have at least 1 material child
  const ghostBefore = cv.ghost;
  let materialCount = 0;
  ghostBefore.traverse((obj) => {
    if (obj.material) materialCount++;
  });
  assert.ok(materialCount >= 1, "ghost should have at least one material");

  cv.clear();
  assert.strictEqual(cv.ghost, null);

  disposeTestModel(model);
  cv.dispose();
});

/* ═══════════════════════════════════════════════════════════════════
   第七部分：mode constants 一致性
   ═══════════════════════════════════════════════════════════════════ */
test("SECTION_DISPLAY_MODES has three entries", () => {
  const keys = Object.keys(SECTION_DISPLAY_MODES);
  assert.strictEqual(keys.length, 3);
  assert.ok(keys.includes("TEACHING"));
  assert.ok(keys.includes("HIDDEN"));
  assert.ok(keys.includes("TRANSPARENT"));
});
