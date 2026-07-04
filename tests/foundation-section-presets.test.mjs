import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";

const sourceUrl = new URL("../section-foundation.js", import.meta.url);

function extractConstObject(source, name) {
  const startToken = `const ${name} = `;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${name} should exist`);
  const objectStart = source.indexOf("{", start + startToken.length);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      const literal = source.slice(objectStart, index + 1);
      return Function(`"use strict"; return (${literal});`)();
    }
  }

  throw new Error(`Could not parse ${name}`);
}

function makeSolidGeometry(solidId) {
  if (solidId === "cuboid") return new THREE.BoxGeometry(2.2, 1.35, 1.35);
  if (solidId === "cylinder") return new THREE.CylinderGeometry(0.9, 0.9, 1.9, 80, 1);
  if (solidId === "cone") return new THREE.ConeGeometry(1, 2, 80, 1);
  if (solidId === "pyramid") {
    const geometry = new THREE.ConeGeometry(1.05, 2, 4, 1);
    geometry.rotateY(Math.PI / 4);
    return geometry;
  }
  return new THREE.BoxGeometry(1.7, 1.7, 1.7);
}

function readVertex(position, vertexIndex) {
  return new THREE.Vector3(
    position.getX(vertexIndex),
    position.getY(vertexIndex),
    position.getZ(vertexIndex),
  );
}

function geometryTriangles(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const triangles = [];

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      triangles.push([
        readVertex(position, index.getX(i)),
        readVertex(position, index.getX(i + 1)),
        readVertex(position, index.getX(i + 2)),
      ]);
    }
    return triangles;
  }

  for (let i = 0; i < position.count; i += 3) {
    triangles.push([readVertex(position, i), readVertex(position, i + 1), readVertex(position, i + 2)]);
  }
  return triangles;
}

function pushUniquePoint(points, point, tolerance = 0.0005) {
  if (points.some((candidate) => candidate.distanceToSquared(point) < tolerance * tolerance)) return;
  points.push(point.clone());
}

function planeBasis(normal) {
  const helper = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = helper.clone().cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  return { u, v };
}

function removeCollinearSectionPoints(points) {
  if (points.length <= 3) return points;
  const cleaned = [];
  points.forEach((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const a = point.clone().sub(prev);
    const b = next.clone().sub(point);
    const crossLength = a.clone().cross(b).length();
    const scale = Math.max(a.length() * b.length(), 0.000001);
    if (crossLength / scale > 0.01) cleaned.push(point);
  });
  return cleaned.length >= 3 ? cleaned : points;
}

function orderSectionPoints(points, normal) {
  if (points.length < 3) return points;
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const { u, v } = planeBasis(normal);
  return removeCollinearSectionPoints([...points].sort((a, b) => {
    const da = a.clone().sub(center);
    const db = b.clone().sub(center);
    return Math.atan2(da.dot(v), da.dot(u)) - Math.atan2(db.dot(v), db.dot(u));
  }));
}

function collectPlaneSectionPoints(geometry, normal, offset) {
  const points = [];
  const epsilon = 0.00001;
  const addEdgeIntersection = (a, b) => {
    const da = normal.dot(a) - offset;
    const db = normal.dot(b) - offset;
    if (Math.abs(da) <= epsilon) pushUniquePoint(points, a);
    if (Math.abs(db) <= epsilon) pushUniquePoint(points, b);
    if (da * db >= 0) return;
    pushUniquePoint(points, a.clone().lerp(b, da / (da - db)));
  };

  geometryTriangles(geometry).forEach(([a, b, c]) => {
    addEdgeIntersection(a, b);
    addEdgeIntersection(b, c);
    addEdgeIntersection(c, a);
  });

  return orderSectionPoints(points, normal);
}

function sectionPointsToLocal2d(points, normal) {
  if (points.length === 0) return [];
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const { u, v } = planeBasis(normal);
  return points.map((point) => {
    const delta = point.clone().sub(center);
    return { x: delta.dot(u), y: delta.dot(v) };
  });
}

function areParallel2d(a, b) {
  const cross = Math.abs(a.x * b.y - a.y * b.x);
  const scale = Math.max(Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y), 0.000001);
  return cross / scale < 0.08;
}

function isRightAngle2d(a, b) {
  const dot = Math.abs(a.x * b.x + a.y * b.y);
  const scale = Math.max(Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y), 0.000001);
  return dot / scale < 0.12;
}

function classifyQuadrilateral(points, selectedLabel) {
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { x: next.x - point.x, y: next.y - point.y };
  });
  const parallel02 = areParallel2d(edges[0], edges[2]);
  const parallel13 = areParallel2d(edges[1], edges[3]);
  const rightAngles = edges.every((edge, index) => isRightAngle2d(edge, edges[(index + 1) % edges.length]));
  const lengths = edges.map((edge) => Math.hypot(edge.x, edge.y));
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);

  if (rightAngles && maxLength / Math.max(minLength, 0.000001) < 1.12) return "正方形";
  if (rightAngles) return selectedLabel === "长方形" ? "长方形" : "矩形";
  if (parallel02 && parallel13) return "平行四边形";
  if (parallel02 || parallel13) return "梯形";
  return "四边形";
}

function classifyTriangle(points, solidId) {
  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return { x: next.x - point.x, y: next.y - point.y };
  });
  const lengths = edges.map((edge) => Math.hypot(edge.x, edge.y));
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);
  const hasRightAngle = edges.some((edge, index) => isRightAngle2d(edge, edges[(index + 1) % edges.length]));
  const boxTriangleCannotBeRight = solidId === "cube" || solidId === "cuboid";

  if (!boxTriangleCannotBeRight && hasRightAngle) return "直角三角形";
  if (maxLength / Math.max(minLength, 0.000001) < 1.08) return "等边三角形";
  return "三角形";
}

function classifySectionPoints(points, normal, selectedLabel, solidId) {
  if (points.length < 3) return "没有截到";
  const local = sectionPointsToLocal2d(points, normal);
  if (points.length === 3) return classifyTriangle(local, solidId);
  if (points.length === 4) return classifyQuadrilateral(local, selectedLabel);
  if (points.length === 5) return "五边形";
  if (points.length === 6) return "六边形";
  if (points.length > 12) {
    if (selectedLabel.includes("圆")) return selectedLabel;
    if (selectedLabel.includes("弧") || selectedLabel.includes("曲边")) return selectedLabel;
    if (selectedLabel.includes("曲")) return "曲边截面";
  }
  return `${points.length}边形`;
}

function actualSection(solidId, label, preset, offsetDelta = 0) {
  const geometry = makeSolidGeometry(solidId);
  const normal = new THREE.Vector3(...preset.normal).normalize();
  const points = collectPlaneSectionPoints(geometry, normal, (preset.offset ?? 0) + offsetDelta);
  const actual = classifySectionPoints(points, normal, label, solidId);
  geometry.dispose();
  return { actual, vertices: points.length };
}

function canLabelMatches(label, actual) {
  if (label === actual) return true;
  if (label === "三角形") return actual === "三角形" || actual === "等边三角形";
  if (label === "四边形") return ["四边形", "矩形", "长方形", "正方形", "平行四边形", "梯形"].includes(actual);
  if (label === "矩形") return actual === "矩形" || actual === "长方形" || actual === "正方形";
  if (label === "过顶点等腰三角形") return actual === "三角形" || actual === "等边三角形";
  return false;
}

function cannotLabelIsAvoided(label, actual) {
  if (label === "直角三角形") return actual !== "直角三角形";
  if (label.includes("超过")) return Number.parseInt(actual, 10) <= 6 || !/^\d+边形$/.test(actual);
  if (label === "纯三角形") return !(actual === "三角形" || actual === "等边三角形" || actual === "直角三角形");
  if (label.includes("五边形")) return actual !== "五边形";
  if (label.includes("六边形")) return actual !== "六边形";
  if (label.includes("正方形")) return actual !== "正方形";
  if (label.includes("圆") || label.includes("椭圆") || label.includes("曲边") || label.includes("任意曲边")) {
    return !(actual.includes("圆") || actual.includes("椭圆") || actual.includes("曲边") || actual.includes("弧"));
  }
  if (label === "无曲线多边形") return actual.includes("曲边") || actual.includes("弧") || actual.includes("圆");
  return actual !== label;
}

test("foundation section presets produce the shape promised by each tile", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const shapes = extractConstObject(source, "SHAPES");
  const presets = extractConstObject(source, "SECTION_3D_PRESETS");
  const failures = [];

  for (const [solidId, shape] of Object.entries(shapes)) {
    for (const label of shape.can) {
      const preset = presets[solidId]?.[label];
      assert.ok(preset, `${solidId} ${label} should have a 3D preset`);
      const { actual, vertices } = actualSection(solidId, label, preset);
      if (!canLabelMatches(label, actual)) failures.push(`${solidId} can ${label} -> ${actual}/${vertices}`);
    }
    for (const label of shape.cannot) {
      const preset = presets[solidId]?.[label];
      assert.ok(preset, `${solidId} ${label} should have a 3D preset`);
      const { actual, vertices } = actualSection(solidId, label, preset);
      if (!cannotLabelIsAvoided(label, actual)) failures.push(`${solidId} cannot ${label} -> ${actual}/${vertices}`);
    }
  }

  assert.deepEqual(failures, []);
});

test("known fragile foundation section presets stay correct while dragged slightly", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const presets = extractConstObject(source, "SECTION_3D_PRESETS");
  const fragileCases = [
    ["cube", "长方形"],
    ["cuboid", "三角形"],
    ["cuboid", "平行四边形"],
    ["cuboid", "梯形"],
    ["cuboid", "五边形"],
    ["cylinder", "带弧边截面"],
    ["pyramid", "五边形"],
  ];
  const failures = [];

  for (const [solidId, label] of fragileCases) {
    const preset = presets[solidId][label];
    for (const offsetDelta of [-(preset.limit ?? 0), 0, preset.limit ?? 0]) {
      const { actual, vertices } = actualSection(solidId, label, preset, offsetDelta);
      if (!canLabelMatches(label, actual)) {
        failures.push(`${solidId} ${label} delta ${offsetDelta.toFixed(3)} -> ${actual}/${vertices}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
