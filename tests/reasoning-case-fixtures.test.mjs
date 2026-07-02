import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL(
  "../data/reasoning-cases/cone-box-001.json",
  import.meta.url,
);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

test("cone-box-001 freezes the manually verified source and answer", async () => {
  const fixture = await loadFixture();

  assert.equal(fixture.id, "cone-box-001");
  assert.equal(fixture.source.kind, "user-provided-video");
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
