# Pole Position source import

Unmodified JavaScript retrieved from https://emulators.org/ on 2026-09-19.
See `UPSTREAM.json` for source URLs and SHA-256 checksums. Original source comments and license notices are preserved.

- `pole-position.js`: board emulation, Z8002 CPUs, MCU emulation, and video.
- `Z80.js`: upstream Z80 CPU core.
- `polepos-voices.js`: voice and discrete sound synthesis.
- `namco-wsg.js`: Namco wavetable sound chip.
- `pole-position-debug.js`: upstream debugger integration.

This is a source import, not a playable integration. The existing `Index.html` remains a placeholder. Running the emulator requires a host page, ROM data, audio setup, and (if enabled) the upstream debugger framework. ROM data and the debugger framework are not included. The imported Z80 is kept as supplied; it has not been adapted to the repository's shared CPU interface.

The upstream description page labels the emulator MIT; individual files retain their own notices and references to third-party code. This provenance record does not relicense the imported sources.
