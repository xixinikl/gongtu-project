export const SECTION_DISPLAY_MODES = Object.freeze({
  TEACHING: "teaching",
  HIDDEN: "hidden",
  TRANSPARENT: "transparent",
});

const POLICIES = Object.freeze({
  [SECTION_DISPLAY_MODES.TEACHING]: Object.freeze({
    clipModel: false,
    showCutawayGhost: false,
    ghostMode: "hidden",
  }),
  [SECTION_DISPLAY_MODES.HIDDEN]: Object.freeze({
    clipModel: true,
    showCutawayGhost: false,
    ghostMode: "hidden",
  }),
  [SECTION_DISPLAY_MODES.TRANSPARENT]: Object.freeze({
    clipModel: true,
    showCutawayGhost: true,
    ghostMode: "transparent",
  }),
});

export function getSectionDisplayPolicy(mode) {
  return POLICIES[mode] || POLICIES[SECTION_DISPLAY_MODES.TEACHING];
}

export function isSectionDisplayMode(mode) {
  return Object.hasOwn(POLICIES, mode);
}
