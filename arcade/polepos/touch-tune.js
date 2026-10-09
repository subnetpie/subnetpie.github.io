// Graded landscape steering for Pole Position. The emulated frontend exposes
// digital left/right inputs, so convert drag displacement into a bounded PWM
// duty cycle. Small corrections produce short taps; larger drags approach a
// continuous hold without the old all-or-nothing 10px latch.
(() => {
  const DEADZONE = 12;
  const FULL_SCALE = 96;
  const PERIOD_MS = 70;
  let active = null;
  let direction = 0;
  let strength = 0;
  let held = 0;
  let offTimer = 0;

  const excluded = event => (event.composedPath?.() ?? [event.target]).some(node =>
    node?.matches?.('button,input,select,textarea,a,[data-input]'));
  const code = dir => dir < 0 ? 'ArrowLeft' : 'ArrowRight';
  const send = (type, dir) => window.dispatchEvent(new KeyboardEvent(type, {
    key: code(dir), code: code(dir), bubbles: true, cancelable: true
  }));

  const release = () => {
    if (offTimer) clearTimeout(offTimer);
    offTimer = 0;
    if (held) send('keyup', held);
    held = 0;
  };

  const pulse = () => {
    release();
    if (!direction || strength <= 0) return;
    held = direction;
    send('keydown', direction);
    const onMs = 16 + Math.round(strength * 50);
    offTimer = setTimeout(release, onMs);
  };
  const timer = setInterval(pulse, PERIOD_MS);

  window.addEventListener('touchstart', event => {
    if (active || excluded(event)) return;
    const t = event.changedTouches?.[0];
    if (!t) return;
    active = { id: t.identifier, x: t.clientX };
    direction = 0;
    strength = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  window.addEventListener('touchmove', event => {
    if (!active) return;
    const t = [...(event.changedTouches ?? [])].find(v => v.identifier === active.id);
    if (!t) return;
    const dx = t.clientX - active.x;
    const mag = Math.abs(dx);
    if (mag <= DEADZONE) {
      direction = 0;
      strength = 0;
      release();
    } else {
      direction = dx < 0 ? -1 : 1;
      strength = Math.min(1, (mag - DEADZONE) / (FULL_SCALE - DEADZONE));
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });

  const end = event => {
    if (!active) return;
    const ended = [...(event.changedTouches ?? [])].some(v => v.identifier === active.id);
    if (!ended) return;
    active = null;
    direction = 0;
    strength = 0;
    release();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('touchend', end, { passive: false, capture: true });
  window.addEventListener('touchcancel', end, { passive: false, capture: true });
  window.addEventListener('pagehide', () => { clearInterval(timer); release(); });
})();
