import assert from "node:assert/strict";
import test from "node:test";
import {
  createLessonState,
  publicLessonState,
  transitionLesson,
} from "../geometry/lesson-state-machine.js";

function initialState() {
  return createLessonState({
    caseId: "case-001",
    keyframeCount: 5,
    optionIds: ["A", "B", "C", "D"],
    correctOptionId: "A",
  });
}

test("lesson starts ready without revealing the answer", () => {
  const state = initialState();
  assert.deepEqual(publicLessonState(state), {
    phase: "ready",
    caseId: "case-001",
    currentKeyframe: 0,
    selectedOptionId: null,
    answerRevealed: false,
  });
  assert.equal(Object.isFrozen(state), true);
});

test("selecting an option changes only the verification context", () => {
  const before = initialState();
  const after = transitionLesson(before, {
    type: "SELECT_OPTION",
    optionId: "C",
    keyframeIndex: 2,
  });

  assert.equal(after.phase, "validating");
  assert.equal(after.selectedOptionId, "C");
  assert.equal(after.currentKeyframe, 2);
  assert.equal(after.correctOptionId, "A");
  assert.equal(after.answerRevealed, false);
  assert.equal(before.selectedOptionId, null);
});

test("play, pause and deterministic stepping preserve answer protection", () => {
  let state = transitionLesson(initialState(), { type: "PLAY" });
  assert.equal(state.phase, "playing");
  state = transitionLesson(state, { type: "GO_TO_KEYFRAME", index: 3 });
  assert.equal(state.currentKeyframe, 3);
  assert.equal(state.answerRevealed, false);
  state = transitionLesson(state, { type: "PAUSE" });
  assert.equal(state.phase, "paused");
});

test("exploration returns to a deterministic paused teaching state", () => {
  let state = transitionLesson(initialState(), { type: "PLAY" });
  state = transitionLesson(state, { type: "ENTER_EXPLORE" });
  assert.equal(state.phase, "exploring");
  assert.equal(state.returnPhase, "paused");
  state = transitionLesson(state, { type: "EXIT_EXPLORE" });
  assert.equal(state.phase, "paused");
});

test("only COMPLETE reveals the immutable standard answer", () => {
  const completed = transitionLesson(initialState(), { type: "COMPLETE" });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.currentKeyframe, 4);
  assert.equal(completed.answerRevealed, true);
  assert.equal(completed.correctOptionId, "A");
});

test("unknown options, frames and events are rejected", () => {
  const state = initialState();
  assert.throws(
    () => transitionLesson(state, { type: "SELECT_OPTION", optionId: "Z" }),
    /unknown option/,
  );
  assert.throws(
    () => transitionLesson(state, { type: "GO_TO_KEYFRAME", index: 9 }),
    /outside timeline/,
  );
  assert.throws(
    () => transitionLesson(state, { type: "AI_DECIDES_ANSWER" }),
    /unknown lesson event/,
  );
});
