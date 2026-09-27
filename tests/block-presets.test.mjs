/**
 * COM-008: 积木视图题固定样例验证测试。
 *
 * 覆盖 block-presets.js 的所有预设数据完整性和正确性。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  BLOCK_PRESETS,
  findPresetByName,
  validateAllPresets,
} from "../geometry/block-presets.js";

describe("COM-008: Block Presets", () => {

  it("should have exactly 8 presets", () => {
    assert.equal(BLOCK_PRESETS.length, 8);
  });

  it("all presets should pass validation", () => {
    const r = validateAllPresets();
    assert.ok(r.valid);
    assert.deepEqual(r.errors, []);
  });

  it("all preset names should be unique", () => {
    const names = BLOCK_PRESETS.map((p) => p.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length);
  });

  it("all coordinates should be integers in range 0~4", () => {
    for (const p of BLOCK_PRESETS) {
      for (const [x, y, z] of p.blocks) {
        assert.ok(Number.isInteger(x), `${p.name}: x=${x} is not integer`);
        assert.ok(Number.isInteger(y), `${p.name}: y=${y} is not integer`);
        assert.ok(Number.isInteger(z), `${p.name}: z=${z} is not integer`);
        assert.ok(x >= 0 && x <= 4, `${p.name}: x=${x} out of range`);
        assert.ok(y >= 0 && y <= 4, `${p.name}: y=${y} out of range`);
        assert.ok(z >= 0 && z <= 4, `${p.name}: z=${z} out of range`);
      }
    }
  });

  it("blockCount should match actual blocks array length", () => {
    for (const p of BLOCK_PRESETS) {
      assert.equal(p.blocks.length, p.blockCount,
        `${p.name}: count mismatch (${p.blocks.length} vs ${p.blockCount})`);
    }
  });

  // ── 各预设具体形状验证 ──

  it("L形预设应有 3 块且形成 L 形", () => {
    const l = findPresetByName("L 形");
    assert.ok(l);
    assert.equal(l.blockCount, 3);
    // L形: (1,0,2),(2,0,2) 横向 + (2,0,3) 竖向拐角
    const coords = l.blocks.map(([x, y, z]) => `${x},${y},${z}`);
    assert.ok(coords.includes("1,0,2"));
    assert.ok(coords.includes("2,0,2"));
    assert.ok(coords.includes("2,0,3"));
  });

  it("阶梯预设应有 6 块且分 3 层高度", () => {
    const s = findPresetByName("阶梯");
    assert.ok(s);
    assert.equal(s.blockCount, 6);
    const heights = new Set(s.blocks.map(([, y]) => y));
    assert.ok(heights.has(0), "should have y=0 layer");
    assert.ok(heights.has(1), "should have y=1 layer");
    assert.ok(heights.has(2), "should have y=2 layer");
  });

  it("金字塔预设应有 14 块且覆盖 3 层", () => {
    const py = findPresetByName("金字塔");
    assert.ok(py);
    assert.equal(py.blockCount, 14);
    const byLayer = [0, 0, 0];
    py.blocks.forEach(([, y]) => byLayer[y]++);
    // y=0:9, y=1:4, y=2:1
    assert.equal(byLayer[0], 9, `layer0 expected 9 got ${byLayer[0]}`);
    assert.equal(byLayer[1], 4, `layer1 expected 4 got ${byLayer[1]}`);
    assert.equal(byLayer[2], 1, `layer2 expected 1 got ${byLayer[2]}`);
  });

  it("散点预设应跨越 5 层", () => {
    const sc = findPresetByName("散点");
    assert.ok(sc);
    assert.equal(sc.blockCount, 14);
    const layers = new Set(sc.blocks.map(([, y]) => y));
    assert.equal(layers.size, 5, "scattered should span all 5 layers");
  });

  it("回形预设应为空心方框，中心无块", () => {
    const h = findPresetByName("回形");
    assert.ok(h);
    assert.equal(h.blockCount, 8);
    const coords = h.blocks;
    // 3×3 ring center at (2,0,2) should be empty
    const hasCenter = coords.some(([x, y, z]) => x === 2 && y === 0 && z === 2);
    assert.ok(!hasCenter, "hollow square center must be empty");
  });

  it("findPresetByName 返回 undefined 对不存在的名称", () => {
    assert.equal(findPresetByName("不存在"), undefined);
  });
});
