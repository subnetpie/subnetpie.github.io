// Star Trek course-control gesture.
// Direct relative motion feeds the emulated spinner: no inertial steering and no digital latch.
const EXCLUDED = '[data-no-swipe],button,input,select,textarea,a';
const DEADZONE_PX = 3;
const PIXELS_PER_COUNT = 4;
const MAX_COUNTS_PER_MOVE = 6;

let activePointer = null;
let lastX = 0;
let carry = 0;

function machine() {
  return window.startrek || null;
}

function excluded(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.some(node => node instanceof Element && node.matches?.(EXCLUDED));
}

function begin(event) {
  if (activePointer !== null || excluded(event)) return;
  const m = machine();
  if (!m) return;
  m.audio?.unlock?.();
  activePointer = event.pointerId;
  lastX = event.clientX;
  carry = 0;
}

function move(event) {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  const m = machine();
  if (!m) return;

  const dx = event.clientX - lastX;
  lastX = event.clientX;
  carry += dx;

  if (Math.abs(carry) < DEADZONE_PX) return;

  let counts = Math.trunc(carry / PIXELS_PER_COUNT);
  if (!counts) counts = carry > 0 ? 1 : -1;
  counts = Math.max(-MAX_COUNTS_PER_MOVE, Math.min(MAX_COUNTS_PER_MOVE, counts));

  m.spinnerDelta += counts;
  carry -= counts * PIXELS_PER_COUNT;
}

function end(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  carry = 0;
}

window.addEventListener('pointerdown', begin, { passive: true });
window.addEventListener('pointermove', move, { passive: false });
window.addEventListener('pointerup', end, { passive: true });
window.addEventListener('pointercancel', end, { passive: true });
window.addEventListener('blur', () => { activePointer = null; carry = 0; });
