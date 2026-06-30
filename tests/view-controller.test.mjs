import assert from "node:assert/strict";
import test from "node:test";
import { switchToLabel, switchToView, getCurrentView } from "../geometry/view-controller.js";

// ======================================================
// 1. 预设数据结构校验
// ======================================================
const VIEW_LABELS = ["透视", "正视", "后视", "左视", "右视", "俯视", "仰视"];
const EXPECTED_KEYS = ["perspective", "front", "back", "left", "right", "top", "bottom"];

test("switchToLabel maps all 7 labels to correct keys", () => {
  for (let i = 0; i < VIEW_LABELS.length; i++) {
    // 无有效 lab 时只校验 label→key 映射，动画执行提前返回
    assert.equal(switchToLabel(VIEW_LABELS[i], null), EXPECTED_KEYS[i]);
  }
});

test("switchToView rejects unknown key", () => {
  assert.doesNotThrow(() => switchToView("invalid", null));
});

test("getCurrentView returns initial default", () => {
  assert.equal(getCurrentView(), "perspective");
});

// ======================================================
// 2. 无效 lab 参数安全返回
// ======================================================
test("switchToLabel with null/undefined lab returns key but bails animation", () => {
  assert.equal(switchToLabel("正视", null), "front");
  assert.equal(switchToLabel("正视", undefined), "front");
});

test("switchToLabel with empty object lab returns key", () => {
  assert.equal(switchToLabel("俯视", {}), "top");
});

// ======================================================
// 3. 未知 label 不崩溃
// ======================================================
test("switchToLabel with unknown label returns null", () => {
  assert.equal(switchToLabel("斜向", {}), null);
});

// ======================================================
// 4. switchToView 参数安全
// ======================================================
test("switchToView with null preset key does not throw", () => {
  assert.doesNotThrow(() => switchToView(null, {}));
});

test("switchToView with undefined preset key does not throw", () => {
  assert.doesNotThrow(() => switchToView(undefined, {}));
});

test("switchToView with null lab does not throw", () => {
  assert.doesNotThrow(() => switchToView("front", null));
});

test("switchToView with empty lab does not throw", () => {
  assert.doesNotThrow(() => switchToView("front", {}));
});

// ======================================================
// 5. 所有 7 个方向映射完整
// ======================================================
test("all 7 directions map correctly", () => {
  for (let i = 0; i < VIEW_LABELS.length; i++) {
    assert.equal(switchToLabel(VIEW_LABELS[i], null), EXPECTED_KEYS[i]);
  }
});
