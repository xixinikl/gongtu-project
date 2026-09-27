const PHASES = new Set([
  "ready",
  "validating",
  "playing",
  "paused",
  "exploring",
  "completed",
]);

function frozen(state) {
  return Object.freeze({ ...state });
}

function validIndex(index, count) {
  return Number.isInteger(index) && index >= 0 && index < count;
}

export function createLessonState({
  caseId,
  keyframeCount,
  optionIds,
  correctOptionId,
}) {
  if (!caseId || !Number.isInteger(keyframeCount) || keyframeCount < 1) {
    throw new TypeError("caseId and a positive keyframeCount are required");
  }
  if (!Array.isArray(optionIds) || optionIds.length < 2) {
    throw new TypeError("optionIds must contain at least two options");
  }
  const uniqueOptions = [...new Set(optionIds)];
  if (
    uniqueOptions.length !== optionIds.length
    || !uniqueOptions.includes(correctOptionId)
  ) {
    throw new RangeError("optionIds must be unique and contain correctOptionId");
  }
  return frozen({
    phase: "ready",
    caseId,
    keyframeCount,
    optionIds: Object.freeze(uniqueOptions),
    correctOptionId,
    currentKeyframe: 0,
    selectedOptionId: null,
    answerRevealed: false,
    returnPhase: "ready",
  });
}

export function transitionLesson(state, event) {
  if (!state || !PHASES.has(state.phase)) {
    throw new TypeError("invalid lesson state");
  }
  if (!event?.type) throw new TypeError("lesson event requires type");

  switch (event.type) {
    case "SELECT_OPTION": {
      if (!state.optionIds.includes(event.optionId)) {
        throw new RangeError(`unknown option: ${event.optionId}`);
      }
      const nextIndex = event.keyframeIndex ?? state.currentKeyframe;
      if (!validIndex(nextIndex, state.keyframeCount)) {
        throw new RangeError("SELECT_OPTION keyframeIndex is outside timeline");
      }
      return frozen({
        ...state,
        phase: "validating",
        selectedOptionId: event.optionId,
        currentKeyframe: nextIndex,
        returnPhase: "validating",
      });
    }
    case "PLAY":
      return frozen({
        ...state,
        phase: "playing",
        answerRevealed: false,
        returnPhase: "playing",
      });
    case "PAUSE":
      return frozen({
        ...state,
        phase: state.phase === "completed" ? "completed" : "paused",
        returnPhase: "paused",
      });
    case "GO_TO_KEYFRAME": {
      if (!validIndex(event.index, state.keyframeCount)) {
        throw new RangeError("keyframe index is outside timeline");
      }
      return frozen({
        ...state,
        phase: state.phase === "playing" ? "playing" : "validating",
        currentKeyframe: event.index,
      });
    }
    case "ENTER_EXPLORE":
      return frozen({
        ...state,
        phase: "exploring",
        returnPhase: state.phase === "playing" ? "paused" : state.phase,
      });
    case "EXIT_EXPLORE":
      return frozen({
        ...state,
        phase: state.returnPhase === "exploring" ? "paused" : state.returnPhase,
      });
    case "COMPLETE":
      return frozen({
        ...state,
        phase: "completed",
        currentKeyframe: state.keyframeCount - 1,
        answerRevealed: true,
        returnPhase: "completed",
      });
    case "RESET":
      return frozen({
        ...state,
        phase: "ready",
        currentKeyframe: 0,
        selectedOptionId: null,
        answerRevealed: false,
        returnPhase: "ready",
      });
    default:
      throw new RangeError(`unknown lesson event: ${event.type}`);
  }
}

export function publicLessonState(state) {
  return {
    phase: state.phase,
    caseId: state.caseId,
    currentKeyframe: state.currentKeyframe,
    selectedOptionId: state.selectedOptionId,
    answerRevealed: state.answerRevealed,
  };
}
