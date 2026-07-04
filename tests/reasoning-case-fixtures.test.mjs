import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initReasoningCaseValidator,
  validateReasoningCase,
} from "../geometry/reasoning-case-validator.js";

await initReasoningCaseValidator();

const fixtureUrls = {
  coneBox: new URL(
    "../data/reasoning-cases/cone-box-001.json",
    import.meta.url,
  ),
  pyramidCylinder: new URL(
    "../data/reasoning-cases/pyramid-cylinder-001.json",
    import.meta.url,
  ),
};

async function loadFixture(name = "coneBox") {
  return JSON.parse(await readFile(fixtureUrls[name], "utf8"));
}

test("cone-box-001 freezes the manually verified source and answer", async () => {
  const fixture = await loadFixture();

  assert.equal(fixture.id, "cone-box-001");
  assert.equal(fixture.source.kind, "user-provided-video");
  assert.equal(
    fixture.source.image,
    "/data/images/reasoning/cone-box-001-question.png",
  );
  assert.ok(fixture.source.questionFrameSeconds >= 0);
  assert.equal(fixture.answer.correctOptionId, "A");
  assert.equal(fixture.answer.source, "manual-video-review");
  assert.equal(fixture.answer.aiGenerated, false);
  assert.equal(fixture.verification.status, "human-verified");
});

test("cone-box-001 records four ordered options with one correct answer", async () => {
  const fixture = await loadFixture();
  const optionIds = fixture.options.map((option) => option.id);
  const correct = fixture.options.filter((option) => option.verdict === "correct");

  assert.deepEqual(optionIds, fixture.source.optionOrder);
  assert.deepEqual(optionIds, ["A", "B", "C", "D"]);
  assert.equal(correct.length, 1);
  assert.equal(correct[0].id, fixture.answer.correctOptionId);

  for (const option of fixture.options) {
    assert.ok(option.outline, `${option.id} must have a structured outline`);
    assert.ok(option.reason.length >= 20, `${option.id} must have a reason`);
    assert.ok(Array.isArray(option.satisfies));
    assert.ok(Array.isArray(option.violates));
  }
});

test("cone-box-001 references only declared geometric constraints", async () => {
  const fixture = await loadFixture();
  const constraintIds = new Set(
    fixture.constraints.map((constraint) => constraint.id),
  );

  assert.equal(constraintIds.size, fixture.constraints.length);
  for (const option of fixture.options) {
    for (const id of [...option.satisfies, ...option.violates]) {
      assert.ok(constraintIds.has(id), `${option.id} references unknown ${id}`);
    }
  }
});

test("cone-box-001 includes a deterministic teaching keyframe for every option", async () => {
  const fixture = await loadFixture();
  const covered = new Set(
    fixture.keyframes
      .map((keyframe) => keyframe.optionId)
      .filter(Boolean),
  );

  for (const option of fixture.options) {
    assert.ok(covered.has(option.id), `missing keyframe for ${option.id}`);
  }

  let previousTime = -Infinity;
  for (const keyframe of fixture.keyframes) {
    assert.ok(keyframe.timeSeconds > previousTime);
    previousTime = keyframe.timeSeconds;
    assert.ok(keyframe.caption);
    assert.equal(keyframe.camera.position.length, 3);
    assert.equal(keyframe.camera.target.length, 3);
    if (keyframe.plane) {
      assert.equal(keyframe.plane.normal.length, 3);
      assert.ok(Number.isFinite(keyframe.plane.constant));
    }
  }
});

test("cone-box-001 teaches that a hexagon is possible in a cube but mismatched here", async () => {
  const fixture = await loadFixture();
  const optionB = fixture.options.find((option) => option.id === "B");
  const keyframeB = fixture.keyframes.find((keyframe) => keyframe.optionId === "B");

  assert.equal(optionB.outlineClass, "convex-hexagon");
  assert.match(optionB.reason, /正方体|长方体/);
  assert.match(optionB.reason, /可以.*六边形/);
  assert.match(optionB.reason, /组合体/);
  assert.match(optionB.reason, /接近六边形/);
  assert.match(optionB.reason, /倒圆锥/);
  assert.match(keyframeB.caption, /接近六边形/);
  assert.match(keyframeB.caption, /继续切到下方倒圆锥/);
  assert.deepEqual(
    keyframeB.plane.normal.map((value) => Number(value.toFixed(3))),
    [0.577, 0.577, 0.577],
  );
  assert.equal(keyframeB.plane.constant, -0.3);
});

test("cone-box-001 explicitly preserves source ambiguities", async () => {
  const fixture = await loadFixture();

  assert.equal(fixture.model.parameterStatus, "representative-not-source-dimensioned");
  assert.ok(fixture.uncertainties.length >= 1);
  for (const uncertainty of fixture.uncertainties) {
    assert.ok(uncertainty.field);
    assert.ok(uncertainty.reason);
    assert.ok(uncertainty.impact);
  }
});

test("pyramid-cylinder-001 corrects the source to four options and answer D", async () => {
  const fixture = await loadFixture("pyramidCylinder");

  assert.equal(fixture.id, "pyramid-cylinder-001");
  assert.deepEqual(fixture.source.optionOrder, ["A", "B", "C", "D"]);
  assert.match(fixture.source.taskBoardCorrection, /四个选项/);
  assert.equal(fixture.answer.questionMode, "select-impossible");
  assert.equal(fixture.answer.correctOptionId, "D");
  assert.equal(fixture.answer.source, "manual-video-review");
  assert.equal(fixture.answer.aiGenerated, false);
});

test("pyramid-cylinder-001 freezes three possible options and one impossible option", async () => {
  const fixture = await loadFixture("pyramidCylinder");
  const verdicts = Object.fromEntries(
    fixture.options.map((option) => [option.id, option.verdict]),
  );

  assert.deepEqual(verdicts, {
    A: "possible",
    B: "possible",
    C: "possible",
    D: "impossible",
  });

  for (const option of fixture.options) {
    assert.ok(option.outline);
    assert.ok(option.reason.length >= 20);
  }
});

test("pyramid-cylinder-001 ties option D to the coupled-plane edge constraint", async () => {
  const fixture = await loadFixture("pyramidCylinder");
  const optionD = fixture.options.find((option) => option.id === "D");

  assert.ok(optionD.violates.includes("shared-plane-angle-coupling"));
  assert.ok(optionD.violates.includes("pyramid-edge-clips-rectangle"));
  assert.match(optionD.reason, /倾斜/);
  assert.match(optionD.reason, /缺角/);
});

test("pyramid-cylinder-001 keyframes cover every option deterministically", async () => {
  const fixture = await loadFixture("pyramidCylinder");
  const covered = new Set(
    fixture.keyframes
      .map((keyframe) => keyframe.optionId)
      .filter(Boolean),
  );

  assert.deepEqual([...covered].sort(), ["A", "B", "C", "D"]);
  assert.equal(fixture.verification.status, "human-verified");
  assert.ok(fixture.uncertainties.length >= 1);
});

test("both golden cases satisfy the ReasoningCase schema and semantics", async () => {
  for (const name of Object.keys(fixtureUrls)) {
    const fixture = await loadFixture(name);
    const result = validateReasoningCase(fixture);
    assert.equal(
      result.valid,
      true,
      `${name}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test("ReasoningCase validator rejects AI answers and broken references", async () => {
  const aiAnswer = await loadFixture();
  aiAnswer.answer.aiGenerated = true;
  assert.equal(validateReasoningCase(aiAnswer).valid, false);

  const missingConstraint = await loadFixture();
  missingConstraint.options[0].satisfies.push("invented-constraint");
  const missingResult = validateReasoningCase(missingConstraint);
  assert.equal(missingResult.valid, false);
  assert.match(
    missingResult.errors.map((error) => error.message).join("\n"),
    /不存在的约束/,
  );

  const missingKeyframe = await loadFixture();
  missingKeyframe.keyframes = missingKeyframe.keyframes.filter(
    (keyframe) => keyframe.optionId !== "B",
  );
  const keyframeResult = validateReasoningCase(missingKeyframe);
  assert.equal(keyframeResult.valid, false);
  assert.match(
    keyframeResult.errors.map((error) => error.message).join("\n"),
    /缺少选项 B/,
  );
});
