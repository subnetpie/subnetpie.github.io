// Explicit display geometry keeps machine framebuffer dimensions unchanged.
export function fitDisplay(availableWidth, availableHeight, width, height, rotation = 0) {
  if (![availableWidth, availableHeight, width, height].every(Number.isFinite) ||
      availableWidth < 0 || availableHeight < 0 || width <= 0 || height <= 0 ||
      ![0, 90, 180, 270].includes(rotation)) throw new RangeError("Invalid display geometry");
  const sideways = rotation === 90 || rotation === 270;
  const scale = Math.min(availableWidth / (sideways ? height : width),
                         availableHeight / (sideways ? width : height));
  return { width: width * scale, height: height * scale, rotation };
}

// Supply the game's physical display aspect, which may differ from canvas pixels.
// This module only sizes the canvas; it does not run a machine or bind game input.
export function observeDisplay(stage, canvas, { width, height, rotation = 0 }) {
  const resize = () => {
    const fitted = fitDisplay(stage.clientWidth, stage.clientHeight, width, height, rotation);
    canvas.style.width = fitted.width + "px";
    canvas.style.height = fitted.height + "px";
    canvas.style.transform = "translate(-50%, -50%) rotate(" + fitted.rotation + "deg)";
  };
  const original = { width: canvas.style.width, height: canvas.style.height, transform: canvas.style.transform };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  return () => { observer.disconnect(); Object.assign(canvas.style, original); };
}
