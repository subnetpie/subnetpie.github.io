// Install before the emulator module (and its network imports) loads.
// Controls act on pointer events; cancel Safari's synthetic tap gestures on
// every touch release instead of relying on a double-tap timing threshold.
(() => {
  const options = {capture: true, passive: false};
  const preventGesture = (event) => {
    // Allow native label activation to open the file picker on iOS.
    if(event.target instanceof Element && event.target.closest('input, #buttonLoad')) return;
    if(event.cancelable) event.preventDefault();
  };
  for(const type of ['touchend', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, preventGesture, options);
  }
  document.addEventListener('pointerdown', (event) => {
    if(event.pointerType === 'touch') preventGesture(event);
  }, options);
})();
