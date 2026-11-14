# DMD Viewer

A static, browser-based pinball display test bench. File contents are processed in memory on the visitorâ€™s device.

Live app: https://subnetpie.github.io/dmd-viewer/

Hosted alternate: https://dmd-viewer.subnetpie.chatgpt.site

Run `python -m http.server 8766 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:8766. Run `node check-formats.mjs` for parser checks and synthetic sample files.

Supports encrypted PAC v1â€“2 containers with automatic compatibility-key decoding, an optional key override, and embedded VNI v1â€“5 or FSQ v0â€“3 scenes. Overrides are used in browser memory and are never saved or uploaded. Both zero-padded and PKCS#7-padded PAC exports are supported. Supports PIN2DMD PAL v1â€“2, VNI v1â€“5 (uncompressed and Heatshrink 10/5), hexadecimal TXT and GZip TXT recordings, PAL-indexed FSQ v0â€“3 scenes, and headerless indexed/planar/RGB888 frames. Open Format guide to configure raw layout. Sample files in `dist/samples` are synthetic test fixtures, not game assets.

Controls: play/pause, frame stepping, scrubbing, loop, speed, palette selection, brightness, dot mode, fullscreen, hover inspection, and PNG snapshot. Space toggles playback; Left/Right step frames; Alt+Left/Right switch animations; Home restarts the current animation. Shortcuts work after focusing playback buttons and are ignored while editing form fields.

This app previews stored frames and manually selected palettes. The separate experimental ROM + PAC mode executes game ROMs and applies live frame matching; see emulator/README.md for its current limits. Animation-preview mode does not reconstruct color-mask scenes with game output or drive PIN2DMD hardware. The viewer does not decode ColorDMD CHROMA.ROM, Serum CRZ, or VNI v6+. No claim of complete PIN2DMD firmware emulation is made.

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

The repository includes original synthetic test fixtures and the Popeye and Terminator 2 PAC colorization files supplied by the repository owner. The owner-supplied game ROM archives are listed below; no user-specific decoding keys are included.

PAC implementation references: [native PAC loader](https://github.com/freezy/dmd-extensions/blob/master/LibDmd/Converter/Vni/VniLoader.cs) and [Pin2Color plugin discussion](https://vpuniverse.com/forums/topic/7504-new-version-dmd-extensions-with-pin2dmd-coloring-plugin-and-pac-file-support/). The browser implementation does not load or redistribute pin2color DLLs.

## PuP-Pack preview

Open `screens.pup`, `playlists.pup`, and `triggers.pup` together, a full pack folder, or a complete ZIP. The viewer switches to PuP-Pack preview. Configurations alone show screen layouts, trigger details, and missing-media indicators. Add the media folder or files for playback; file contents remain local. ZIP media is extracted on demand, with a 512 MB limit per compressed clip. Extract ZIP64 archives and choose the folder instead.

Select a trigger and use **Preview selected**, or enter an event such as `D7` and use **Fire event** to run every enabled row for that event. **Start pack** loads configured screen backgrounds and fires `D0`. CustomPos layers appear inside their parent screen. The screen selector changes the visible monitor; media on other screens stays loaded. Videos, audio, and images use the browser's supported codecs. Playback starts muted.

Normal, Loop, SetBG, SkipSamePrty, QueueSameP, StopPlayer, and StopFile are recognized. Preview selected bypasses priority, counter, queue, and cooldown checks; Fire event can apply them with the rules checkbox. Unsupported actions are reported. This is a manual media/layout preview, not the native PinUP Player: no live game connection, PuPCapture matching, hardware routing, script execution, or advanced labels/SendMSG emulation is implemented. Default monitor aspect ratios are approximate; CustomPos percentages come from the pack.

Run `node check-pup.mjs` for CSV, layout, media-path, and ZIP checks. Configuration reference: https://www.nailbuster.com/wikipinup/doku.php?id=pup_capture.

## Included DMD files

Choose **Popeye** or **Terminator 2** from **Game** to load and start its complete ROM set, matching PAC colorization, and original sound together. **Sound on** controls audio. **Play game** starts or restarts the selection. On the first visit, browser setup reloads the page once; press **Play game** afterward to allow sound. Extra animation previews, local files, and PuP-Pack tools are available under **Advanced tools**. Both games load their published assets automatically. Direct links: `?game=popeye` and `?game=terminator-2`.


## Browser ROM + PAC mode

Choose **ROM + PAC**, enable browser emulation once if requested (the page reloads), then load the original game ROM ZIP and matching PAC together. Add any needed parent ROM ZIPs in the same selection, choose the game set, and press **Start ROM**. ROMs stay on the device. Controls include pause/resume, reset, stop, coin/start, service keys, coin-door toggle, manual numbered switches, and audio volume/Sound on. Losing focus or switching viewer modes pauses emulation. Stopping discards runtime NVRAM.

The WebAssembly runtime is a noncommercial derivative of PinMAME 3.7.0. Source, build instructions, upstream revision, licensing notices, and verification limits are in [emulator/README.md](emulator/README.md). The owner-supplied Popeye LX5 set now passes native audits and boots with DMD output and non-silent PCM audio in the compiled runtime. Live PAC synchronization remains experimental and unverified.


## Supplied ROM archives

The repository owner supplied these original game-program archives alongside the PAC files in `dist/library/`:

- [Popeye program ROM: peye_lx5.zip](dist/library/peye_lx5.zip) with [Popeye.pac](dist/library/popeye.pac).
- [Terminator 2 program ROM: t2_l8.zip](dist/library/t2_l8.zip) with [Terminator 2.pac](dist/library/terminator-2.pac).

These archives are published unchanged, including their original license/readme files. They contain the game-program ROMs, not complete sound ROM sets. They also use legacy Implode/Shrink ZIP compression; the current browser runtime requires Store/Deflate archives. Repacking and matching sound ROMs are needed before these can pass the emulator's complete-set audit. Game ROMs are copyrighted; download and use them only if you are legally entitled to do so.


## Complete Popeye LX5 set and sound files

[Download the complete browser-compatible Popeye ROM ZIP: pop_lx5.zip](dist/library/pop_lx5.zip). It combines the verified LX5 program ROM, all six L2 sound ROMs, and the original program archive's license/readme files, using Deflate ZIP compression. Load `pop_lx5.zip` together with [Popeye.pac](dist/library/popeye.pac) in ROM + PAC mode. Select ROM set `pop_lx5`.

The six original sound ROMs are also available separately: [U2](dist/library/popsndl2.u2), [U3](dist/library/popsndl2.u3), [U4](dist/library/popsndl2.u4), [U5](dist/library/popsndl2.u5), [U6](dist/library/popsndl2.u6), [U7](dist/library/popsndl2.u7). Their CRC32 and SHA-1 values match the upstream Popeye L2 sound definitions.

[The supplied WAV sound-effects archive](dist/library/popeye-sound-effects.zip) is uploaded unchanged as a separate asset. It is not required by ROM emulation.

The complete ZIP passed every native ROM audit and a six-second compiled-WASM boot check: running state, 128Ã—32 DMD frames, and non-silent PCM audio. This was a Node-hosted WASM check; real-browser playback and PAC trigger synchronization are still unverified.


## Complete Terminator 2 L8 set

The owner-supplied L8 program ROM and three L3 sound ROMs are packaged in [t2_l8-complete.zip](dist/library/t2_l8-complete.zip) using browser-compatible Deflate compression. Choose **Terminator 2 → DMD + sound ROMs → Load game**, then **Start ROM**. The viewer mounts the archive under the emulator-required name `t2_l8.zip` and loads the matching PAC automatically. **Sound on** enables or mutes ROM audio.

All four files match PinMAME's CRC32 and SHA-1 definitions: `t2_l8.rom`, `t2_u18.l3`, `t2_u15.l3`, and `t2_u14.l3`. The original program-only `t2_l8.zip`, including its license and revision notes, remains unchanged. Run `node check-t2-runtime.mjs` for the complete-set audit and compiled-WASM DMD/audio boot check. Browser audio playback and live PAC synchronization still require browser verification.

## Stepping through animations with sound

Run a game to capture its rendered color DMD and original ROM audio in memory. **Previous animation**, **Next animation**, and the **Captured animation** dropdown replay captured sections with their matching sound. **Replay animation** restarts the section; Pause/Resume works during replay. **Return to live** resumes the paused game and captures more animations. Recent history is limited to 60 seconds and 48 MB, split at observed colorization changes or eight seconds. Reset, Stop, and switching games clear it.

This browses animations the game has actually displayed during this session. PAC files do not contain sound cues, so arbitrary PAC-only scenes cannot automatically trigger matching ROM audio.

## Popeye event simulator

Select Popeye, then use **Coin + start game** and **Launch ball** in **Popeye shot controls**. Named controls cover the inlanes, three bumpers, a bumper sequence, slingshots, wheel exit, and left/right drains. A six-ball trough and shooter-lane model responds to the ROM’s trough and launch coils. The game ROM selects its own animation, scoring, music, and effects; a shot can produce different results in different modes.

The event panel does not require a VPX table. It is an initial set of supported shots, not a complete table or an index of every animation. Switch and coil numbers come from PinMAME’s `src/wpc/sims/wpc/prelim/pop.c`. The Popeye input bridge uses direct WPC cabinet switches to avoid a second keyboard-driven ball simulator competing with the event model.
