# JSbzone source layout

GitHub and CodePen contain identical index.html, style.css and script.js. Both import the same shared native JavaScript chip classes from GitHub. There is no runtime wrapper, bundler, WebAssembly, Emscripten or third-party framework.

script.js is the complete game implementation, arranged as:

1. Shared chip imports: M6502, PokeyAudio/POKEY_CLOCK and PokeyRandom.
2. OBJECTS: source addresses and rendering attributes.
3. Game constants and ObjectStyle class methods.
4. Unique classes: AssetTrace, Mathbox, NoiseEnvelope, BattlezoneDiscrete, BzoneAudio, VectorRenderer and RadarPersistence.
5. JSbzone: initialization, board memory map, AVG execution, rendering, timing and controls.
6. Main: create the game, load ROMs, apply attributes and run.

CPU addresses, vector ROM addresses and object types remain distinct in source metadata. Object identification remains tied to verified ROM provenance; editing a display attribute does not alter emulated memory, timing or vector geometry.

Only objects with supported fill geometry expose fill and fillOpacity. Obstacles currently support projected hull fill. Tanks and other wireframe objects do not expose those fields. brightness and lineGlow range from 0 to 4; fillOpacity accepts 0–1 or a percentage string. color accepts a CSS color or palette alias.

```js
obstacle: {
  source: { cpu: ['0x5c5c'], types: ['0x00', '0x01', '0x0c', '0x0f'] },
  color: 'magenta',
  brightness: 1.2,
  lineGlow: 1,
  fill: true,
  fillOpacity: '25%'
}
```

Edit OBJECTS in CodePen and preview the result. The same complete script.js can be committed back to GitHub without changing its imports. For adjustments without restarting, use `bzone.setObjectStyle('obstacle', {color:'magenta', lineGlow:1})`; `bzone.exportObjectStyles()` returns the current table for pasting as OBJECTS. GitHub writes are explicit; no GitHub token belongs in a public Pen.

The production source contains no test harness or debug logging. Existing repository development files are not imported by the page.

The game script exports nothing. Shared chip imports are grouped at the top; presentation helpers belong to ObjectStyle and VectorRenderer, while circuit and math helpers stay inside their hardware classes.
