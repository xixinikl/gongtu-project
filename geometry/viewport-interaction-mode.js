const VALID_MODES = new Set(["orbit", "plane"]);

/**
 * 视角旋转与切面拖拽的互斥状态机。
 */
export function createViewportInteractionMode(initialMode = "orbit") {
  if (!VALID_MODES.has(initialMode)) {
    throw new RangeError(`unsupported interaction mode "${initialMode}"`);
  }

  let mode = initialMode;
  let pointerId = null;
  let startY = 0;

  function snapshot() {
    return Object.freeze({
      mode,
      dragging: pointerId !== null,
      pointerId,
    });
  }

  function setMode(nextMode) {
    if (!VALID_MODES.has(nextMode)) {
      throw new RangeError(`unsupported interaction mode "${nextMode}"`);
    }
    const changed = mode !== nextMode;
    mode = nextMode;
    if (mode !== "plane") pointerId = null;
    return { changed, ...snapshot() };
  }

  function begin(pointer, clientY) {
    if (mode !== "plane" || pointerId !== null) return { accepted: false, ...snapshot() };
    if (!Number.isInteger(pointer) || !Number.isFinite(clientY)) {
      throw new TypeError("pointerId must be an integer and clientY must be finite");
    }
    pointerId = pointer;
    startY = clientY;
    return { accepted: true, ...snapshot() };
  }

  function move(pointer, clientY, viewportHeight) {
    if (pointer !== pointerId || pointerId === null) {
      return { accepted: false, deltaNormalized: 0, ...snapshot() };
    }
    if (!Number.isFinite(clientY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      throw new RangeError("clientY must be finite and viewportHeight must be positive");
    }
    return {
      accepted: true,
      deltaNormalized: (clientY - startY) / viewportHeight,
      ...snapshot(),
    };
  }

  function end(pointer) {
    if (pointer !== pointerId || pointerId === null) return { accepted: false, ...snapshot() };
    pointerId = null;
    return { accepted: true, ...snapshot() };
  }

  return Object.freeze({ snapshot, setMode, begin, move, end });
}

export const VIEWPORT_INTERACTION_MODES = Object.freeze(["orbit", "plane"]);
