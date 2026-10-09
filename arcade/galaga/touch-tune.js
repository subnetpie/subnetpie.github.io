// Landscape touch steering tuned between the prior analog-like Galaga swipe
// and binary left/right buttons. Horizontal drag distance is converted into
// short bounded key pulses; there is no inertia and no persistent latch.
(() => {
  const STEP_PX = 18;
  const PULSE_MS = 52;
  let active = null;
  let accum = 0;
  let held = null;
  let releaseTimer = 0;

  const excluded = event => (event.composedPath?.() ?? [event.target]).some(node =>
    node?.matches?.('button,input,select,textarea,a,[data-no-swipe],[data-game-control],[data-touch-control]'));

  const keyFor = dir => dir < 0 ? 'ArrowLeft' : 'ArrowRight';
  const codeFor = dir => dir < 0 ? 'ArrowLeft' : 'ArrowRight';
  const send = (type, dir) => window.dispatchEvent(new KeyboardEvent(type, {
    key: keyFor(dir), code: codeFor(dir), bubbles: true, cancelable: true
  }));

  const release = () => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = 0;
    if (held) send('keyup', held);
    held = null;
  };

  const pulse = dir => {
    if (held && held !== dir) release();
    if (!held) {
      held = dir;
      send('keydown', dir);
    }
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, PULSE_MS);
  };

  window.addEventListener('touchstart', event => {
    if (active || excluded(event)) return;
    const t = event.changedTouches?.[0];
    if (!t) return;
    active = { id: t.identifier, x: t.clientX };
    accum = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  window.addEventListener('touchmove', event => {
    if (!active) return;
    const t = [...(event.changedTouches ?? [])].find(v => v.identifier === active.id);
    if (!t) return;
    const dx = t.clientX - active.x;
    active.x = t.clientX;
    accum += dx;
    while (Math.abs(accum) >= STEP_PX) {
      const dir = accum < 0 ? -1 : 1;
      pulse(dir);
      accum -= dir * STEP_PX;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  const end = event => {
    if (!active) return;
    const ended = [...(event.changedTouches ?? [])].some(v => v.identifier === active.id);
    if (!ended) return;
    active = null;
    accum = 0;
    release();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('touchend', end, { passive: false, capture: true });
  window.addEventListener('touchcancel', end, { passive: false, capture: true });
})();
