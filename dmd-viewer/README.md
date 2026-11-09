# DMD Viewer

A static, browser-based pinball display test bench. File contents are processed in memory on the visitor’s device.

Live app: https://subnetpie.github.io/dmd-viewer/

Hosted alternate: https://dmd-viewer.subnetpie.chatgpt.site

Run `python -m http.server 8766 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:8766. Run `node check-formats.mjs` for parser checks and synthetic sample files.

Supports encrypted PAC v1–2 containers with a user-provided decoding key and embedded VNI v1–5 or FSQ v0–3 scenes. The key is used in browser memory and is never saved or uploaded. Supports PIN2DMD PAL v1–2, VNI v1–5 (uncompressed and Heatshrink 10/5), hexadecimal TXT and GZip TXT recordings, PAL-indexed FSQ v0–3 scenes, and headerless indexed/planar/RGB888 frames. Open Format guide to configure raw layout. Sample files in `dist/samples` are synthetic test fixtures, not game assets.

Controls: play/pause, frame stepping, scrubbing, loop, speed, palette selection, brightness, dot mode, fullscreen, hover inspection, and PNG snapshot. Space toggles playback; Left/Right step frames; Alt+Left/Right switch animations; Home restarts the current animation. Shortcuts work after focusing playback buttons and are ignored while editing form fields.

This app previews stored frames and manually selected palettes. It does not execute game ROMs, implement the PAL keyframe/mask rule engine, reconstruct color-mask scenes with game output, drive PIN2DMD hardware, or decode ColorDMD CHROMA.ROM, Serum CRZ, or VNI v6+. No claim of complete PIN2DMD firmware emulation is made.

Format references: https://pin2dmd.com/editor/ and https://github.com/freezy/dmd-extensions/tree/master/LibDmd/Converter/Vni. All demo scenes and test fixtures are original.

For a local preview with a PAL/FSQ pair preloaded without uploading or copying it, run `python preview.py --pal PATH_TO_PAL --fsq PATH_TO_FSQ` and open the printed URL. Run `node check-fsq.mjs` and `node check-pac.mjs` for format checks.

ZIP packages containing one matching PAL/FSQ or PAL/VNI pair can be opened directly. ZIP entries are unpacked and CRC-checked in browser memory. Previous/next animation buttons and Play all scenes browse the active scene filter.

## Checks

Requires Node.js 22 or newer. No npm dependencies are needed.

```sh
node check-formats.mjs
node check-fsq.mjs
node check-pac.mjs
node check-zip.mjs
node check-controls.mjs
```

The repository contains only original synthetic sample files. No game ROMs, third-party colorization packages, or decoding keys are included.
