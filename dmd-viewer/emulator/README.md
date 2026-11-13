# DMD Viewer browser runtime 3.7.0

This is an experimental browser derivative powered by PinMAME, not an official PinMAME distribution. No game ROMs are shipped or uploaded. The user's ROM ZIPs and PAC are held in browser memory. Reloading or stopping the runtime discards its NVRAM; persistence is not implemented yet.

Upstream source: [vpinball/pinmame, commit 9ddb1c36f03a6e3db616af6c8aef82bb32754842](https://github.com/vpinball/pinmame/tree/9ddb1c36f03a6e3db616af6c8aef82bb32754842), version 3.7.0. Its mixed BSD, old MAME, and component license terms apply. Notices are distributed in `dist/emulator/notices/`. This runtime is for noncommercial use under those terms.

## Build

Requires Python 3, Git, CMake 3.25+, Ninja, and Emscripten **7.0.0** activated in the current shell. Build outside `dist`. On Windows use an Emscripten command prompt, or put its `upstream/emscripten` directory on PATH after activating the SDK.

```sh
git clone https://github.com/vpinball/pinmame.git outputs/pinmame-core
git -C outputs/pinmame-core checkout 9ddb1c36f03a6e3db616af6c8aef82bb32754842
python emulator/prepare-build.py outputs/pinmame-core
emcmake cmake -S outputs/pinmame-core -B outputs/pinmame-build -G Ninja -DPLATFORM=wasm -DARCH=wasm32 -DBUILD_SHARED=OFF -DBUILD_STATIC=ON -DPINMAME_P2K=OFF -DPINMAME_SPIKE1=OFF -DPINMAME_JIT_ASMJIT=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build outputs/pinmame-build --target dmd-runtime --parallel 4
python emulator/package-runtime.py outputs/pinmame-build
node check-rom-runtime.mjs
node check-rom-worker.mjs
node check-live-colorizer.mjs
```

`prepare-build.py` derives the CMake configuration from upstream's library target, adds the bridge, and inserts one identification-plane hook into `src/wpc/core.c`. The CPU and sound emulation and ROM verification are unchanged. Native machine code JITs, Pinball 2000, and Spike 1 are disabled for this target. WasmFS avoids cross-thread JavaScript filesystem proxy deadlocks. The bridge polls mutex-protected frame/audio buffers from the emulation thread; ROM, PAC, and sound data never travel to a server.

## Browser behavior

Choose **ROM + PAC**, enable browser emulation once if requested, then select one original ROM set ZIP and one matching PAC together. Additional parent ROM ZIPs can be selected in the same batch. Select the game set and press **Start ROM**. Missing or mismatched ROMs are reported before startup. The browser downloads the 1.7 MB compressed runtime only when Start ROM is pressed. Modern browsers with WebAssembly threads, SharedArrayBuffer, Web Audio, and DecompressionStream are required. HTTPS is required outside localhost. The scoped service worker adds isolation headers and does not cache files or upload anything.

The runtime supplies indexed DMD frames, extra WPC/GTS3/Alvin G. identification planes, float PCM audio, native keyboard controls, and numbered switches. Switching viewer modes, hiding the tab, or losing focus pauses the game and releases held inputs. Service-menu buttons use PinMAME's standard number-key mappings. A playfield/ball simulator is not included; switch inputs can drive game behavior manually. Coin-door state is toggled with End. Its initial state depends on the game.

Live PAC matching supports palette triggers/durations, timed replacements, color masks, follow scenes, layered color masks, masked replacements, no-retrigger replacements, and looping masks. FSQ v3 metadata hashes and VNI v4/v5 hashes/masks are retained. It currently targets the supplied 128×32 Popeye and Terminator 2 PACs. High-resolution scaling, embedded palette commands, and VNI transition-mask behavior are not complete. Actual compatibility and timing must be checked with each game ROM/PAC pair. Animation preview remains available separately.

Format references: [DMD Extensions VNI/PAC implementation](https://github.com/freezy/dmd-extensions/tree/master/LibDmd/Converter/Vni), [PinMAME library API](https://github.com/vpinball/pinmame/blob/9ddb1c36f03a6e3db616af6c8aef82bb32754842/src/libpinmame/libpinmame.h), and [Emscripten filesystem documentation](https://emscripten.org/docs/api_reference/Filesystem-API.html).

## Verification limits

Automated checks instantiate the compiled WASM, recognize both game drivers, audit missing ROMs, start and stop the real emulation thread with missing-ROM failure handling, exercise the compressed worker-loading path, and test colorizer modes with synthetic frames. UI tests pair the actual supplied PAC with a synthetic ZIP and verify controls/cleanup. No valid game ROM set has been supplied, so a successful game boot, audible game sound, and real PAC trigger synchronization have not yet been verified. Real-browser rendering and isolation behavior also require browser verification.
