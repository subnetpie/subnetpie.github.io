// Install before the emulator module (and its network imports) loads.
// Controls act on pointer events; cancel Safari's synthetic tap gestures on
// every touch release instead of relying on a double-tap timing threshold.
(() => {
  const options = {capture: true, passive: false};
  const preventGesture = (event) => {
    // Preserve the native file picker. Its Load control uses pointerdown.
    if(event.target instanceof Element && event.target.closest('input')) return;
    if(event.cancelable) event.preventDefault();
  };
  for(const type of ['touchend', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, preventGesture, options);
  }
  document.addEventListener('pointerdown', (event) => {
    if(event.pointerType === 'touch') preventGesture(event);
  }, options);
})();
