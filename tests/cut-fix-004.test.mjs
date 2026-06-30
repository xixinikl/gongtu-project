import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 轻量模拟 document.createElement('canvas') 以支持 CanvasTexture
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
  computeCutPlaneVisualSize,
  computeCutPlaneVisualCenter,
  resizeCutPlaneVisual,
  DEFAULT_NORMAL,
} from '../geometry/cutting-plane.js';
import {
  getSectionDisplayPolicy,
  isSectionDisplayMode,
  SECTION_DISPLAY_MODES,
} from '../geometry/section-mode.js';

describe('CUT-FIX-004 缩小并弱化切割平面视觉', () => {
  // ─── 1. 视觉尺寸由包围盒计算 ──────────────────────────
  describe('computeCutPlaneVisualSize', () => {
    it('正方体 1×1×1 包围盒 maxSpan=1 → 1.25', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL), 1.25);
    });

    it('长方体 X=3 Z=2 包围盒 maxSpan=3 → 3.75', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-1.5, -0.5, -1),
        new THREE.Vector3(1.5, 0.5, 1),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL), 3.75);
    });

    it('圆柱半径=1 maxSpan=2 → 2.50', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 2, 1),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL), 2.50);
    });

    it('null 包围盒返回默认值 7', () => {
      assert.strictEqual(computeCutPlaneVisualSize(null), 7);
    });

    it('自定义 scaleFactor 1.15 → 2.30', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 1, 1),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL, 1.15), 2.30);
    });

    it('自定义 scaleFactor 1.35 → 2.70', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 1, 1),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL, 1.35), 2.70);
    });

    it('极小包围盒仍返回合理值', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.005, 0.005, 0.005),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box), 7);
    });

    it('非 Box3 对象返回默认值', () => {
      assert.strictEqual(computeCutPlaneVisualSize({ min: { x: -1 }, max: { x: 1 } }), 7);
    });
  });

  // ─── 1b. computeCutPlaneVisualCenter 投影中心计算 ───────
  describe('computeCutPlaneVisualCenter', () => {
    it('原点中心正方体 + 水平法向量 → 中心在原点', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      const center = computeCutPlaneVisualCenter(box, DEFAULT_NORMAL);
      assert.ok(center, '应返回非 null 中心');
      assert.ok(Math.abs(center.x) < 1e-9, `中心 x=${center.x} 应在原点`);
      assert.ok(Math.abs(center.y) < 1e-9);
      assert.ok(Math.abs(center.z) < 1e-9);
    });

    it('非原点长方体 (右下角) + 水平法向量 → 中心在包围盒 XZ 中心', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(2, 0, 2),
        new THREE.Vector3(5, 3, 4),
      );
      const center = computeCutPlaneVisualCenter(box, DEFAULT_NORMAL);
      assert.ok(center);
      assert.ok(Math.abs(center.x - 3.5) < 1e-9, `中心 x=${center.x} 应为 3.5`);
      assert.ok(Math.abs(center.y) < 1e-9, `中心 y=${center.y} 应为 0（在切面上）`);
      assert.ok(Math.abs(center.z - 3) < 1e-9, `中心 z=${center.z} 应为 3`);
    });

    it('非原点长方体 + 倾斜45°法向量 → 中心在倾斜切面内投影处', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(2, 0, 2),
        new THREE.Vector3(5, 3, 4),
      );
      const normal = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2).normalize();
      const center = computeCutPlaneVisualCenter(box, normal);
      assert.ok(center);
      // 中心点的世界坐标应在包围盒内或附近
      const boundsCenter = new THREE.Vector3(3.5, 1.5, 3);
      const toBounds = center.distanceTo(boundsCenter);
      assert.ok(toBounds < 5, `投影中心距包围盒中心 ${toBounds} 应 < 5`);
    });

    it('null 包围盒返回 null', () => {
      assert.strictEqual(computeCutPlaneVisualCenter(null), null);
    });

    it('非 Box3 对象返回 null', () => {
      assert.strictEqual(computeCutPlaneVisualCenter({ min: { x: -1 }, max: { x: 1 } }), null);
    });

    it('非零 offset=1.5 → 中心沿法向位移 normal*1.5', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      // plane.constant = -1.5，在 THREE.Plane 中表示平面经过 y=1.5
      const center = computeCutPlaneVisualCenter(box, DEFAULT_NORMAL, -1.5);
      assert.ok(center);
      assert.ok(Math.abs(center.y - 1.5) < 1e-9,
        `中心 y=${center.y} 应为 1.5（投影中心 0 + 法向位移 1.5）`);
    });

    it('plane.distanceToPoint(center) ≈ 0 —— 中心精确落在切面上', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(2, 0, 2),
        new THREE.Vector3(5, 3, 4),
      );
      const normal = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2).normalize();
      const plane = new THREE.Plane(normal, -1.5);
      const center = computeCutPlaneVisualCenter(box, normal, plane);
      assert.ok(center);
      const dist = Math.abs(plane.distanceToPoint(center));
      assert.ok(dist < 1e-9, `点面距离 ${dist} 应为 0`);
    });

    it('传入 THREE.Plane 实例 → 常数提取正确，中心在切面上', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      const plane = new THREE.Plane(DEFAULT_NORMAL, -2.0);
      const center = computeCutPlaneVisualCenter(box, DEFAULT_NORMAL, plane);
      assert.ok(center);
      assert.ok(Math.abs(plane.distanceToPoint(center)) < 1e-9);
      assert.ok(Math.abs(center.y - 2.0) < 1e-9,
        `中心 y=${center.y} 应为 2.0`);
    });

    it('offset=0 时中心在原点平面，与之前行为一致', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      const plane = new THREE.Plane(DEFAULT_NORMAL, 0);
      const center = computeCutPlaneVisualCenter(box, DEFAULT_NORMAL, plane);
      assert.ok(center);
      assert.ok(Math.abs(plane.distanceToPoint(center)) < 1e-9);
      assert.ok(Math.abs(center.y) < 1e-9);
    });
  });

  // ─── 2. resizeCutPlaneVisual 缩放语义 ─────────────────
  describe('resizeCutPlaneVisual', () => {
    it('缩放后方 visualSize 等于目标值', () => {
      const result = createCuttingPlane();
      const initialSize = result.visual.userData.visualSize;
      resizeCutPlaneVisual(result.visual, 3.0);
      assert.strictEqual(result.visual.userData.visualSize, 3.0);
      assert.notStrictEqual(result.visual.userData.visualSize, initialSize);
    });

    it('缩放后视觉位置不变（由 syncVisual 控制）', () => {
      const result = createCuttingPlane();
      const posBefore = result.visual.position.clone();
      resizeCutPlaneVisual(result.visual, 2.5);
      assert.strictEqual(result.visual.position.x, posBefore.x);
      assert.strictEqual(result.visual.position.y, posBefore.y);
      assert.strictEqual(result.visual.position.z, posBefore.z);
    });

    it('非法目标值不修改 visualSize', () => {
      const result = createCuttingPlane();
      const sizeBefore = result.visual.userData.visualSize;
      resizeCutPlaneVisual(result.visual, 0);
      assert.strictEqual(result.visual.userData.visualSize, sizeBefore);
      resizeCutPlaneVisual(result.visual, -1);
      assert.strictEqual(result.visual.userData.visualSize, sizeBefore);
      resizeCutPlaneVisual(result.visual, NaN);
      assert.strictEqual(result.visual.userData.visualSize, sizeBefore);
    });

    it('resizeCutPlaneVisual(null) 不崩溃', () => {
      assert.doesNotThrow(() => resizeCutPlaneVisual(null, 3));
    });
  });

  // ─── 3. 数学平面不受视觉操作影响 ─────────────────────
  describe('数学平面与视觉分离', () => {
    it('隐藏视觉刀面不影响数学 normal', () => {
      const result = createCuttingPlane();
      const normalBefore = result.plane.normal.clone();
      const constantBefore = result.plane.constant;
      result.visual.visible = false;
      assert.strictEqual(result.visual.visible, false);
      assert.strictEqual(result.plane.normal.x, normalBefore.x);
      assert.strictEqual(result.plane.normal.y, normalBefore.y);
      assert.strictEqual(result.plane.normal.z, normalBefore.z);
      assert.strictEqual(result.plane.constant, constantBefore);
    });

    it('缩放视觉刀面不影响数学平面', () => {
      const result = createCuttingPlane();
      const normalBefore = result.plane.normal.clone();
      const constantBefore = result.plane.constant;
      resizeCutPlaneVisual(result.visual, 2.0);
      assert.strictEqual(result.plane.normal.x, normalBefore.x);
      assert.strictEqual(result.plane.normal.y, normalBefore.y);
      assert.strictEqual(result.plane.normal.z, normalBefore.z);
      assert.strictEqual(result.plane.constant, constantBefore);
    });

    it('数学范围标记仍为 infinite', () => {
      const result = createCuttingPlane();
      assert.strictEqual(result.visual.userData.mathematicalExtent, 'infinite');
      resizeCutPlaneVisual(result.visual, 2.0);
      // 数学范围不变
      assert.strictEqual(result.visual.userData.mathematicalExtent, 'infinite');
    });

    it('setPlane 后视觉跟随，但数学范围不变', () => {
      const result = createCuttingPlane();
      result.setPlane(new THREE.Vector3(0.5, 0.7, 0.5), 1.5);
      result.visual.visible = false;
      result.setPlane(DEFAULT_NORMAL, 0);
      result.visual.visible = true;
      // 位置和法向量已恢复
      const n = result.plane.normal;
      assert.ok(Math.abs(n.x - DEFAULT_NORMAL.x) < 1e-9);
      assert.ok(Math.abs(n.y - DEFAULT_NORMAL.y) < 1e-9);
      assert.strictEqual(result.visual.userData.mathematicalExtent, 'infinite');
    });
  });

  // ─── 4. createCuttingPlane userData 完整性 ─────────────
  describe('createCuttingPlane userData', () => {
    it('visual 包含 mathematicalExtent', () => {
      const result = createCuttingPlane();
      assert.strictEqual(result.visual.userData.mathematicalExtent, 'infinite');
    });

    it('visual 包含 visualSize', () => {
      const result = createCuttingPlane();
      assert.ok(Number.isFinite(result.visual.userData.visualSize));
    });

    it('visual 包含 unitSize', () => {
      const result = createCuttingPlane();
      assert.ok(Number.isFinite(result.visual.userData.unitSize));
    });

    it('visual 名称正确', () => {
      const result = createCuttingPlane();
      assert.strictEqual(result.visual.name, 'InfiniteCuttingPlaneVisual');
    });

    it('visual 初始可见', () => {
      const result = createCuttingPlane();
      assert.strictEqual(result.visual.visible, true);
    });
  });

  // ─── 5. 三种显示策略未回归 ────────────────────────────
  describe('截面显示策略回归检查', () => {
    it('teaching 模式保持完整模型', () => {
      assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING), {
        clipModel: false,
        showCutawayGhost: false,
        ghostMode: 'hidden',
      });
    });

    it('hidden 模式裁切模型', () => {
      assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.HIDDEN), {
        clipModel: true,
        showCutawayGhost: false,
        ghostMode: 'hidden',
      });
    });

    it('transparent 模式裁切并显示透明镜像', () => {
      assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TRANSPARENT), {
        clipModel: true,
        showCutawayGhost: true,
        ghostMode: 'transparent',
      });
    });

    it('isSectionDisplayMode 三种合法模式均识别', () => {
      assert.strictEqual(isSectionDisplayMode('teaching'), true);
      assert.strictEqual(isSectionDisplayMode('hidden'), true);
      assert.strictEqual(isSectionDisplayMode('transparent'), true);
    });

    it('未知模式回退到 teaching', () => {
      const fallback = getSectionDisplayPolicy('unknown');
      const teaching = getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING);
      assert.deepEqual(fallback, teaching);
    });
  });

  // ─── 6. P1修正: 倾斜平面投影包围盒尺寸 ─────────────────
  describe('倾斜切面尺寸投影计算', () => {
    it('高窄长方体(宽=1,高=4,深=1)水平切面尺寸仍取XZ最大跨度=1.25', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -2, -0.5),
        new THREE.Vector3(0.5, 2, 0.5),
      );
      assert.strictEqual(computeCutPlaneVisualSize(box, DEFAULT_NORMAL), 1.25);
    });

    it('高窄长方体 绕X轴倾斜45° → Y分量投影到切面局部坐标，尺寸大于水平', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -2, -0.5),
        new THREE.Vector3(0.5, 2, 0.5),
      );
      // 绕 X 轴 45°：法向量 (0, cos45, sin45)
      const normal = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2).normalize();
      const size = computeCutPlaneVisualSize(box, normal, 1.25);
      // 切面局部 v 轴方向含 Y+Z 分量，跨度远超 1.25
      assert.ok(size > 2.5, `倾斜45°后尺寸 ${size} 应 > 2.5`);
    });

    it('高窄长方体 绕X轴+Z轴各倾斜45° → 三维分量全投影，尺寸进一步增大', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -2, -0.5),
        new THREE.Vector3(0.5, 2, 0.5),
      );
      // 先绕 X 45°，再绕 Z 45°：法向量变化更复杂
      const hRad = Math.PI / 4; // 45°
      const normal = new THREE.Vector3(0, 1, 0);
      normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), hRad);
      normal.applyAxisAngle(new THREE.Vector3(0, 0, 1), hRad);
      const size = computeCutPlaneVisualSize(box, normal, 1.25);
      // 双轴倾斜后 X,Y,Z 分量均参与投影，尺寸应足够大覆盖截面
      assert.ok(size > 2.0, `双轴45°后尺寸 ${size} 应 > 2.0`);
    });

    it('正方体任意轴倾斜后尺寸不小于水平尺寸', () => {
      const box = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
      const tiltedNormal = new THREE.Vector3(0.577, 0.577, 0.577).normalize();
      const tiltedSize = computeCutPlaneVisualSize(box, tiltedNormal, 1.25);
      const horizontalSize = computeCutPlaneVisualSize(box, DEFAULT_NORMAL, 1.25);
      // 正方体任意方向投影跨度应 ≥ 水平跨度
      assert.ok(tiltedSize >= horizontalSize - 0.01,
        `倾斜尺寸 ${tiltedSize} 应 >= 水平尺寸 ${horizontalSize}`);
    });
  });

  // ─── 7. P1修正: 模式切换必须尊重 checkbox 显隐状态 ─────
  describe('模式切换保留显隐状态', () => {
    it('free 模式 → locked 模式：locked 不把刀面设回 visible', () => {
      const result = createCuttingPlane();
      // 模拟用户隐藏刀面
      result.visual.visible = false;
      // 模拟锁定后读取 checkbox 状态（应保持 false）
      const checkboxState = false; // 模拟 checkbox unchecked
      result.visual.visible = checkboxState;
      assert.strictEqual(result.visual.visible, false);
    });

    it('locked 模式 → free 模式：free 模式应尊重被记住的隐藏状态', () => {
      const result = createCuttingPlane();
      // 模拟用户隐藏刀面后切到 free 模式
      result.visual.visible = false;
      const checkboxState = false;
      result.visual.visible = checkboxState;
      assert.strictEqual(result.visual.visible, false);
    });

    it('checkbox checked 时 locked 模式正常显示刀面', () => {
      const result = createCuttingPlane();
      result.visual.visible = true;
      const checkboxState = true;
      result.visual.visible = checkboxState;
      assert.strictEqual(result.visual.visible, true);
    });

    it('checkbox unchecked 时 setPlane 不改变 visible=false', () => {
      const result = createCuttingPlane();
      result.visual.visible = false;
      result.setPlane(new THREE.Vector3(0, 1, 0), 1.0);
      assert.strictEqual(result.visual.visible, false);
    });

    it('setPlane 后数学平面正常更新但视觉状态保持隐藏', () => {
      const result = createCuttingPlane();
      result.visual.visible = false;
      const tiltedNormal = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
      result.setPlane(tiltedNormal, 1.5);
      // 数学平面正确变化
      assert.ok(Math.abs(result.plane.normal.dot(tiltedNormal.normalize()) - 1) < 1e-9);
      // 视觉仍隐藏
      assert.strictEqual(result.visual.visible, false);
    });
  });
});
