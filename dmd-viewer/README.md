# DMD Viewer

A static, browser-based pinball display test bench. File contents are processed in memory on the visitor’s device.

Live app: https://subnetpie.github.io/dmd-viewer/

Hosted alternate: https://dmd-viewer.subnetpie.chatgpt.site

Run `python -m http.server 8766 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:8766. Run `node check-formats.mjs` for parser checks and synthetic sample files.

Supports encrypted PAC v1–2 containers with automatic compatibility-key decoding, an optional key override, and embedded VNI v1–5 or FSQ v0–3 scenes. Overrides are used in browser memory and are never saved or uploaded. Both zero-padded and PKCS#7-padded PAC exports are supported. Supports PIN2DMD PAL v1–2, VNI v1–5 (uncompressed and Heatshrink 10/5), hexadecimal TXT and GZip TXT recordings, PAL-indexed FSQ v0–3 scenes, and headerless indexed/planar/RGB888 frames. Open Format guide to configure raw layout. Sample files in `dist/samples` are synthetic test fixtures, not game assets.

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

The repository contains only original synthetic sample files. No game ROMs, third-party colorization packages, or user-specific decoding keys are included.

PAC implementation references: [native PAC loader](https://github.com/freezy/dmd-extensions/blob/master/LibDmd/Converter/Vni/VniLoader.cs) and [Pin2Color plugin discussion](https://vpuniverse.com/forums/topic/7504-new-version-dmd-extensions-with-pin2dmd-coloring-plugin-and-pac-file-support/). The browser implementation does not load or redistribute pin2color DLLs.

## PuP-Pack preview

Open `screens.pup`, `playlists.pup`, and `triggers.pup` together, a full pack folder, or a complete ZIP. The viewer switches to PuP-Pack preview. Configurations alone show screen layouts, trigger details, and missing-media indicators. Add the media folder or files for playback; file contents remain local. ZIP media is extracted on demand, with a 512 MB limit per compressed clip. Extract ZIP64 archives and choose the folder instead.

Select a trigger and use **Preview selected**, or enter an event such as `D7` and use **Fire event** to run every enabled row for that event. **Start pack** loads configured screen backgrounds and fires `D0`. CustomPos layers appear inside their parent screen. The screen selector changes the visible monitor; media on other screens stays loaded. Videos, audio, and images use the browser's supported codecs. Playback starts muted.

Normal, Loop, SetBG, SkipSamePrty, QueueSameP, StopPlayer, and StopFile are recognized. Preview selected bypasses priority, counter, queue, and cooldown checks; Fire event can apply them with the rules checkbox. Unsupported actions are reported. This is a manual media/layout preview, not the native PinUP Player: no live game connection, PuPCapture matching, hardware routing, script execution, or advanced labels/SendMSG emulation is implemented. Default monitor aspect ratios are approximate; CustomPos percentages come from the pack.

Run `node check-pup.mjs` for CSV, layout, media-path, and ZIP checks. Configuration reference: https://www.nailbuster.com/wikipinup/doku.php?id=pup_capture.
