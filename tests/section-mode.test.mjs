import assert from "node:assert/strict";
import test from "node:test";

import {
  getSectionDisplayPolicy,
  isSectionDisplayMode,
  SECTION_DISPLAY_MODES,
} from "../geometry/section-mode.js";

test("teaching mode keeps the complete model and hides the cutaway ghost", () => {
  assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING), {
    clipModel: false,
    showCutawayGhost: false,
    ghostMode: "hidden",
  });
});

test("hidden mode clips the source model without a reverse ghost", () => {
  assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.HIDDEN), {
    clipModel: true,
    showCutawayGhost: false,
    ghostMode: "hidden",
  });
});

test("transparent mode clips the source and shows the reverse ghost", () => {
  assert.deepEqual(getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TRANSPARENT), {
    clipModel: true,
    showCutawayGhost: true,
    ghostMode: "transparent",
  });
});

test("unknown modes safely fall back to teaching mode", () => {
  assert.strictEqual(
    getSectionDisplayPolicy("unexpected"),
    getSectionDisplayPolicy(SECTION_DISPLAY_MODES.TEACHING),
  );
});

test("only the three documented display modes are accepted", () => {
  assert.equal(isSectionDisplayMode("teaching"), true);
  assert.equal(isSectionDisplayMode("hidden"), true);
  assert.equal(isSectionDisplayMode("transparent"), true);
  assert.equal(isSectionDisplayMode("unexpected"), false);
  assert.equal(isSectionDisplayMode(null), false);
});
