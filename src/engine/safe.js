// How much of the framebuffer the on-screen controls are sitting on top of,
// measured in game pixels. Zero on desktop and in portrait, where the controls
// have a band of their own; non-zero in landscape, where they float over the
// view. UI that hugs an edge reads these so it doesn't hide behind a thumb.
//
// This lives on its own so both the display (which measures it) and the UI
// (which obeys it) can import it without a cycle.

export const SAFE = { left: 0, right: 0, bottom: 0 };

/**
 * Shift and shrink a full-width rect clear of the controls.
 *
 * `min` is a floor on the width: past a certain point a panel is better off
 * with a thumb over one corner than squeezed until its contents will not fit.
 * Once it stops shrinking it has to stop moving too — a panel that keeps
 * sliding right after it has stopped narrowing hangs off the side of the
 * picture, which is worse than either.
 */
export function fitRect(x, w, min = 120) {
  const nw = Math.max(min, w - SAFE.left - SAFE.right);
  const nx = Math.min(x + SAFE.left, x + w - nw);
  return { x: Math.max(x, nx), w: nw };
}

/** Centre of the area that isn't covered. */
export function safeCenterX(viewW) {
  return (SAFE.left + (viewW - SAFE.right)) / 2;
}
