function finiteVector3(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must be a finite three-number array`);
  }
  return value;
}

function clamp01(value) {
  if (!Number.isFinite(value)) throw new TypeError("progress must be finite");
  return Math.max(0, Math.min(1, value));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function lerpVector(start, end, progress) {
  finiteVector3(start, "start vector");
  finiteVector3(end, "end vector");
  return start.map((value, index) => lerp(value, end[index], progress));
}

function normalized(vector) {
  const length = Math.hypot(...vector);
  if (length <= Number.EPSILON) return [1, 0, 0];
  return vector.map((value) => value / length);
}

export function easeInOutCubic(progress) {
  const value = clamp01(progress);
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function interpolateTeachingFrame(from, to, progress) {
  if (!from?.camera || !to?.camera) {
    throw new TypeError("both teaching frames require camera data");
  }
  const eased = easeInOutCubic(progress);
  const frame = {
    camera: {
      position: lerpVector(
        from.camera.position,
        to.camera.position,
        eased,
      ),
      target: lerpVector(from.camera.target, to.camera.target, eased),
    },
    plane: null,
  };

  if (from.plane && to.plane) {
    frame.plane = {
      normal: normalized(
        lerpVector(from.plane.normal, to.plane.normal, eased),
      ),
      constant: lerp(from.plane.constant, to.plane.constant, eased),
    };
  } else if (eased >= 0.5 && to.plane) {
    frame.plane = {
      normal: normalized(to.plane.normal),
      constant: to.plane.constant,
    };
  } else if (from.plane) {
    frame.plane = {
      normal: normalized(from.plane.normal),
      constant: from.plane.constant,
    };
  }
  return frame;
}

export function transitionProgress(startTime, now, durationMs) {
  if (![startTime, now, durationMs].every(Number.isFinite)) {
    throw new TypeError("timeline clock values must be finite");
  }
  if (durationMs <= 0) return 1;
  return clamp01((now - startTime) / durationMs);
}
