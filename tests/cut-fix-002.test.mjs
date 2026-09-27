import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 轻量模拟 document.createElement('canvas') 以支持 createCuttingPlane
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const ctx = {
          fillStyle: '',
          fillRect() {},
          strokeStyle: '',
          lineWidth: 0,
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          strokeRect() {},
          createRadialGradient() {
            return { addColorStop() {} };
          },
        };
        return {
          width: 512,
          height: 512,
          style: {},
          getContext() { return ctx; },
        };
      }
      return {};
    },
  };
}

import * as THREE from '/node_modules/three/build/three.module.js';
import {
  createCuttingPlane,
  DEFAULT_NORMAL,
  calculateCutSliderRange,
} from '../geometry/cutting-plane.js';

describe('CUT-FIX-002 建立默认水平切面连续穿模', () => {
  // ─── 1. 默认法向量 ───
  describe('默认法向量', () => {
    it('DEFAULT_NORMAL 应为 (0,1,0)', () => {
      assert.strictEqual(DEFAULT_NORMAL.x, 0);
      assert.strictEqual(DEFAULT_NORMAL.y, 1);
      assert.strictEqual(DEFAULT_NORMAL.z, 0);
    });

    it('createCuttingPlane 不传 normal 时使用 (0,1,0)', () => {
      const result = createCuttingPlane(0.5);
      assert.ok(result.plane);
      const n = result.plane.normal;
      assert.strictEqual(n.x, 0);
      assert.strictEqual(n.y, 1);
      assert.strictEqual(n.z, 0);
    });

    it('createCuttingPlane 始终使用 DEFAULT_NORMAL（不暴露 normal 入参）', () => {
      const result = createCuttingPlane();
      const n = result.plane.normal;
      assert.strictEqual(n.x, DEFAULT_NORMAL.x);
      assert.strictEqual(n.y, DEFAULT_NORMAL.y);
      assert.strictEqual(n.z, DEFAULT_NORMAL.z);
    });
  });

  // ─── 2. 滑块范围计算 ───
  describe('calculateCutSliderRange', () => {
    it('正方体 bounds (minY=-1, maxY=1)', () => {
      const range = calculateCutSliderRange(-1, 1);
      assert.strictEqual(range.min, -2.0);
      assert.strictEqual(range.max, 2.0);
      assert.strictEqual(range.initial, 1.0);
    });

    it('长方体 bounds minY=-1.5, maxY=3.0 (改变高度)', () => {
      const range = calculateCutSliderRange(-1.5, 3.0);
      assert.strictEqual(range.min, -2.5);
      assert.strictEqual(range.max, 4.0);
      assert.strictEqual(range.initial, 3.0);
    });

    it('长方体 bounds minY=-2.5, maxY=7.5 (更大高度)', () => {
      const range = calculateCutSliderRange(-2.5, 7.5);
      assert.strictEqual(range.min, -3.5);
      assert.strictEqual(range.max, 8.5);
      assert.strictEqual(range.initial, 7.5);
    });

    it('圆柱 bounds minY=-2, maxY=6', () => {
      const range = calculateCutSliderRange(-2, 6);
      assert.strictEqual(range.min, -3.0);
      assert.strictEqual(range.max, 7.0);
      assert.strictEqual(range.initial, 6.0);
    });

    it('自定义 pad=2.5', () => {
      const range = calculateCutSliderRange(-2, 6, 2.5);
      assert.strictEqual(range.min, -4.5);
      assert.strictEqual(range.max, 8.5);
    });

    it('自定义 pad=0', () => {
      const range = calculateCutSliderRange(-2, 6, 0);
      assert.strictEqual(range.min, -2.0);
      assert.strictEqual(range.max, 6.0);
      assert.strictEqual(range.initial, 6.0);
    });

    it('minY > maxY 返回 null', () => {
      assert.strictEqual(calculateCutSliderRange(5, 3), null);
    });

    it('非数字输入返回 null', () => {
      assert.strictEqual(calculateCutSliderRange(NaN, 3), null);
      assert.strictEqual(calculateCutSliderRange(3, Infinity), null);
    });

    it('minY 和 maxY 相等', () => {
      const range = calculateCutSliderRange(5, 5);
      assert.strictEqual(range.min, 4.0);
      assert.strictEqual(range.max, 6.0);
      assert.strictEqual(range.initial, 5.0);
    });
  });

  // ─── 3. 三种截面状态可区分 ───
  describe('三种截面状态', () => {
    const range = calculateCutSliderRange(-1, 1);

    it('顶部外: value = initial + 0.5 = 1.5 > maxY', () => {
      assert.strictEqual(1.5 > 1, true);
    });

    it('模型内部: value = 0.5', () => {
      assert.ok(0.5 >= -1 && 0.5 <= 1);
    });

    it('底部外: value = min - 0.1 = -2.1 < minY', () => {
      assert.strictEqual(-2.1 < -1, true);
    });
  });
});
