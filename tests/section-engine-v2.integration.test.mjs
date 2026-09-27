import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBlockAssembly } from "../geometry/block-assembly.js";
import {
  chooseSectionProductionEngine,
  compareSectionV1V2,
  computeSectionV2,
  toSectionVisualV2Data,
} from "../geometry/section-engine-v2.js";
import { sectionV2Fixtures } from "./fixtures/section-v2-fixtures.mjs";

function horizontalPlane(y = 0) {
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
}

function boxFromBounds(min, max) {
  const size = new THREE.Vector3().fromArray(max).sub(new THREE.Vector3().fromArray(min));
  const center = new THREE.Vector3().fromArray(min).addScaledVector(size, 0.5);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  return mesh;
}

function modelFromFixture(model) {
  if (model.type === "box") return boxFromBounds(model.min, model.max);
  if (model.type === "boxes") {
    const group = new THREE.Group();
    model.boxes.forEach((box) => group.add(boxFromBounds(box.min, box.max)));
    return group;
  }
  if (model.type === "unit-blocks") return createBlockAssembly(model.blocks);
  if (model.type === "cylinder") {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(
      model.radius,
      model.radius,
      model.height,
      model.radialSegments,
    ));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.fromArray(model.center);
    return mesh;
  }
  if (model.type === "extruded-polygon") {
    const shape = new THREE.Shape();
    model.polygon.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: model.zRange[1] - model.zRange[0],
      bevelEnabled: false,
    });
    geometry.translate(0, 0, model.zRange[0]);
    return new THREE.Mesh(geometry);
  }
  throw new Error(`unsupported golden fixture model ${model.type}`);
}

test("indexed box geometry completes the full V2 pipeline in world coordinates", () => {
  const root = new THREE.Group();
  root.position.set(3, 2, -4);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  root.add(mesh);

  const result = computeSectionV2(root, horizontalPlane(2));

  assert.equal(result.status, "ok");
  assert.equal(result.contourCount, 1);
  assert.ok(Math.abs(result.area - 4) < 1e-6);
  assert.equal(result.diagnostics.meshCount, 1);
  assert.equal(result.diagnostics.triangleCount, 12);
  assert.equal(result.triangulation.indices.length, 6);
  assert.ok(result.contours[0].points.every((point) => Math.abs(point.y - 2) < 1e-7));
});

test("non-indexed geometry is supported", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).toNonIndexed());
  const result = computeSectionV2(mesh, horizontalPlane());

  assert.equal(result.status, "ok");
  assert.equal(result.contourCount, 1);
  assert.ok(Math.abs(result.area - 4) < 1e-6);
});

test("two disconnected meshes produce two contours and summed area", () => {
  const root = new THREE.Group();
  const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const right = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  left.position.x = -2;
  right.position.x = 2;
  root.add(left, right);

  const result = computeSectionV2(root, horizontalPlane());

  assert.equal(result.status, "ok");
  assert.equal(result.contourCount, 2);
  assert.ok(Math.abs(result.area - 3) < 1e-6);
  assert.equal(result.topology.groups.length, 2);
});

test("plane outside model returns a stable empty result", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const result = computeSectionV2(mesh, horizontalPlane(5));

  assert.equal(result.status, "empty");
  assert.equal(result.contourCount, 0);
  assert.equal(result.area, 0);
  assert.equal(result.diagnostics.rawSegmentCount, 0);
});

test("overlapping shells are returned as an explicit topology-stage error", () => {
  const root = new THREE.Group();
  const first = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const second = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  second.position.x = 0.25;
  root.add(first, second);

  const result = computeSectionV2(root, horizontalPlane());

  assert.equal(result.status, "error");
  assert.equal(result.stage, "topology");
  assert.equal(result.error, "intersecting-rings");
});

test("comparison reports a matching legacy polygon without changing either result", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  const v2 = computeSectionV2(mesh, horizontalPlane());
  const comparison = compareSectionV1V2(
    { status: "visible", contourCount: 1, area: 4 },
    v2,
  );

  assert.equal(comparison.match, true);
  assert.equal(comparison.statusMatch, true);
  assert.equal(comparison.contourCountMatch, true);
  assert.equal(comparison.areaMatch, true);
});

test("comparison records status, contour and area differences", () => {
  const comparison = compareSectionV1V2(
    { status: "visible", area: 1 },
    { status: "error", stage: "contours", error: "open-chain", contourCount: 0, area: 0 },
  );

  assert.equal(comparison.match, false);
  assert.equal(comparison.statusMatch, false);
  assert.equal(comparison.contourCountMatch, false);
  assert.equal(comparison.areaMatch, false);
  assert.equal(comparison.areaDelta, 1);
  assert.equal(comparison.v2.error, "open-chain");
});

test("invalid root and plane are rejected before traversal", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  assert.throws(() => computeSectionV2(null, horizontalPlane()), /THREE.Object3D/);
  assert.throws(
    () => computeSectionV2(mesh, new THREE.Plane(new THREE.Vector3(), 0)),
    /non-zero normal/,
  );
});

test("production adapter sends successful and empty V2 results to the V2 visual", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  const visible = computeSectionV2(mesh, horizontalPlane());
  const empty = computeSectionV2(mesh, horizontalPlane(5));

  assert.deepEqual(chooseSectionProductionEngine(visible), {
    engine: "v2",
    reason: "production",
  });
  assert.equal(toSectionVisualV2Data(visible).indices.length, visible.triangulation.indices.length);
  assert.deepEqual(toSectionVisualV2Data(empty), {
    status: "ok",
    vertices3D: [],
    indices: [],
    contours: [],
  });
});

test("production adapter preserves explicit and automatic V1 fallback", () => {
  assert.deepEqual(
    chooseSectionProductionEngine({ status: "ok" }, { forceLegacy: true }),
    { engine: "v1", reason: "forced-legacy" },
  );
  assert.deepEqual(
    chooseSectionProductionEngine({ status: "error", error: "open-chain" }),
    { engine: "v1", reason: "v2-error", error: "open-chain" },
  );
  assert.throws(
    () => toSectionVisualV2Data({ status: "error" }),
    /cannot render V2 result/,
  );
});

test("all SEC2 golden fixtures run through real triangle meshes", async (t) => {
  for (const fixture of sectionV2Fixtures) {
    await t.test(fixture.id, () => {
      const root = modelFromFixture(fixture.model);
      const plane = new THREE.Plane(
        new THREE.Vector3().fromArray(fixture.plane.normal),
        fixture.plane.constant,
      );
      const result = computeSectionV2(root, plane);
      const expectedArea = fixture.expected.rings
        .reduce((sum, expectedRing) => sum + expectedRing.area, 0);

      if (fixture.expected.status === "degenerate") {
        assert.equal(result.status, "empty");
        assert.equal(result.contourCount, 0);
      } else {
        assert.equal(result.status, "ok");
        assert.equal(result.contourCount, fixture.expected.contourCount);
        assert.ok(
          Math.abs(result.area - expectedArea) < 1e-6,
          `${fixture.id}: expected area ${expectedArea}, got ${result.area}`,
        );
      }
    });
  }
});
