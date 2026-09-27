import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBox, createCube } from "../geometry/box-generator.js";
import { createCone } from "../geometry/cone-generator.js";
import { createCylinder } from "../geometry/cylinder-generator.js";
import { createTriangularPrism } from "../geometry/prism-generator.js";
import { createTriangularPyramid } from "../geometry/pyramid-generator.js";
import { createSphere } from "../geometry/sphere-generator.js";

const INVALID_VALUES = [Number.NaN, 0, -1, Number.POSITIVE_INFINITY, null, undefined];

const GENERATORS = [
  {
    name: "cube",
    type: "box",
    create: (...args) => createCube(...args),
    defaults: [1],
    dimensionIndexes: [0],
    segmentRules: [],
    appearanceIndex: 1,
  },
  {
    name: "box",
    type: "box",
    create: (...args) => createBox(...args),
    defaults: [1, 1.5, 0.8],
    dimensionIndexes: [0, 1, 2],
    segmentRules: [],
    appearanceIndex: 3,
  },
  {
    name: "triangular prism",
    type: "triangularPrism",
    create: (...args) => createTriangularPrism(...args),
    defaults: [1, 1],
    dimensionIndexes: [0, 1],
    segmentRules: [],
    appearanceIndex: 2,
  },
  {
    name: "triangular pyramid",
    type: "triangularPyramid",
    create: (...args) => createTriangularPyramid(...args),
    defaults: [1, 1],
    dimensionIndexes: [0, 1],
    segmentRules: [],
    appearanceIndex: 2,
  },
  {
    name: "cylinder",
    type: "cylinder",
    create: (...args) => createCylinder(...args),
    defaults: [0.5, 0.5, 1, 32],
    dimensionIndexes: [0, 1, 2],
    segmentRules: [[3, 3]],
    appearanceIndex: 4,
  },
  {
    name: "cone",
    type: "cone",
    create: (...args) => createCone(...args),
    defaults: [0.5, 1, 32],
    dimensionIndexes: [0, 1],
    segmentRules: [[2, 3]],
    appearanceIndex: 3,
  },
  {
    name: "sphere",
    type: "sphere",
    create: (...args) => createSphere(...args),
    defaults: [0.5, 32, 16],
    dimensionIndexes: [0],
    segmentRules: [[1, 3], [2, 2]],
    appearanceIndex: 3,
  },
];

function assertFiniteGeometry(group) {
  assert.ok(group instanceof THREE.Group);
  assert.ok(group.children.length >= 2);

  group.traverse((child) => {
    if (!child.geometry) return;
    const positions = child.geometry.getAttribute("position");
    assert.ok(positions, `${child.name} must have positions`);
    for (const value of positions.array) {
      assert.ok(Number.isFinite(value), `${child.name} contains a non-finite coordinate`);
    }
  });
}

function assertSafeMetadata(group) {
  for (const [key, value] of Object.entries(group.userData)) {
    if (key === "type" || key === "appearance") continue;
    assert.ok(Number.isFinite(value), `${key} must be finite`);
    assert.ok(value > 0, `${key} must be positive`);
  }
}

for (const definition of GENERATORS) {
  test(`${definition.name}: normal model structure`, () => {
    const model = definition.create(...definition.defaults);
    assert.equal(model.userData.type, definition.type);
    assertFiniteGeometry(model);
    assertSafeMetadata(model);
  });

  for (const parameterIndex of definition.dimensionIndexes) {
    for (const invalidValue of INVALID_VALUES) {
      test(`${definition.name}: dimension ${parameterIndex} safely handles ${String(invalidValue)}`, () => {
        const args = [...definition.defaults];
        args[parameterIndex] = invalidValue;
        const model = definition.create(...args);
        assertFiniteGeometry(model);
        assertSafeMetadata(model);
      });
    }
  }

  for (const [parameterIndex, minimum] of definition.segmentRules) {
    for (const invalidValue of INVALID_VALUES) {
      test(`${definition.name}: segments ${parameterIndex} safely handles ${String(invalidValue)}`, () => {
        const args = [...definition.defaults];
        args[parameterIndex] = invalidValue;
        const model = definition.create(...args);
        assertFiniteGeometry(model);
        assertSafeMetadata(model);
        const segmentValues = Object.entries(model.userData)
          .filter(([key]) => key.toLowerCase().includes("segment"))
          .map(([, value]) => value);
        assert.ok(segmentValues.some((value) => value >= minimum));
      });
    }
  }

  test(`${definition.name}: appearance is applied to the solid`, () => {
    const args = [...definition.defaults];
    args[definition.appearanceIndex] = { color: 0x336699, opacity: 0.4 };
    const model = definition.create(...args);
    const solid = model.children.find((child) => child instanceof THREE.Mesh);
    assert.ok(solid);
    assert.equal(solid.material.color.getHex(), 0x336699);
    assert.equal(solid.material.opacity, 0.4);
    assert.equal(solid.material.transparent, true);
  });
}
