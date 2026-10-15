# Bzone object stylesheet

The editable surface is `index.html` (structure), `style.css` (page and touch controls), and `script.js` (OBJECTS table and startup). The entry imports the shared runtime; it does not embed CPU, mathbox, audio, AVG, or rendering implementations.

`runtime.js` owns the game board, memory map, AVG and input wiring. Shared chip imports include `cpu/m6502.js`, `cpu/bzone-mathbox.js` and the POKEY modules. `assets.js` identifies objects using verified ROM provenance; `vector-renderer.js` draws them; `object-style.js` validates the editable appearance table.

```js
obstacle: {
  source: {cpu: ['0x5c5c'], types: ['0x00', '0x01', '0x0c', '0x0f']},
  color: 'magenta',
  brightness: 1.2,
  lineGlow: 1.0,
  fillSupported: true,
  fillOpacity: '25%'
}
```

Colors accept palette aliases or CSS colors. Brightness and lineGlow range from 0 to 4; zero hides the object or disables the halo respectively. fillOpacity accepts 0–1 or a percentage string. Optional displayIntensity ranges from 0–15; null preserves the ROM intensity. Optional ringRadius ranges from 0–32 pixels.

Source addresses are labeled CPU, vector ROM, or object types; they document the verified identity, rather than creating new execution hooks. Actual classification remains ROM-fingerprint checked in AssetTrace. FillSupported describes existing geometry capability: only obstacle hulls currently support filling. A tank mesh is not supplied by the original vector game. Unsupported fills are rejected.

## CodePen workflow

1. Edit OBJECTS near the top of script.js and let CodePen rerun the preview.
2. For adjustments without restarting, use the preview console:
   `battlezone.setObjectStyle('obstacle', {color:'magenta', lineGlow:1, fillOpacity:'25%'})`.
3. `battlezone.exportObjectStyles()` returns JSON containing all current rules, including live changes. Paste that JSON as the OBJECTS value in script.js.
4. Commit the reviewed script.js to `arcade/bzone/script.js` on GitHub. This never requires a GitHub credential inside the Pen. Save/commit is explicit; preview edits do not automatically overwrite GitHub.

Live changes redraw existing vectors while paused. They do not change CPU cycles, vector geometry or source intensity. Original mode uses original colors/intensities independently of the stylesheet.

The GitHub entry uses its adjacent runtime. The CodePen copy imports the same runtime through a pinned public CDN URL so relative chip imports and ROM loading resolve from that shared module. No runtime or ROM duplication is needed in the Pen.

## Checks

`node --test arcade/bzone/object-style.test.mjs arcade/bzone/radar.test.mjs arcade/bzone/audio.test.mjs`

Covers validation, unsupported fills, original mode, atomic live edits and exports, 600 ROM frames of radar provenance/unchanged geometry, POKEY and discrete sound references, and game/audio timing at 60/120 Hz.
