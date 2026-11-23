# Playfield-inspired updates

This release keeps the existing PinMAME WASM core, live ROM audio, PAC matching, and local file processing.

## T2 mechanism

The browser now supplies the skull drop target, popper-to-gun transfer, loaded/home/mark sensors, motor position, gun firing, and return to the playfield. Coil identities and angular sensor/target windows follow [PinMAME's T2 simulator](https://github.com/vpinball/pinmame/blob/master/src/wpc/sims/wpc/full/t2.c). Travel delays and motor travel are approximate software mechanics, not physical calibration.

- Switch 77 drops the skull target; ROM coil 28 raises it and coil 12 lowers it.
- Switch 76 sends an available playfield ball into the popper and stays closed while occupied.
- ROM coil 1 releases the popper and transfers the ball to the gun.
- Switches 31–33 follow the gun automatically; they cannot be manually toggled through the table or matrix.
- The grip trigger remains switch 34. A shot only occurs when the ROM fires coil 2. Aiming follows motor coil 11; the resulting target hit follows the simulated position.
- Pausing freezes pending movement. Reset discards pending movement and restores three balls and the gun home sensor.

## Diagnostics and lighting

The expandable Machine activity panel keeps the latest 120 input, sensor, coil, and PAC-match events in session memory. Times reflect sampled worker activity, not instruction-level tracing. Filtering, clear, and display pause are available. No frames, audio, or media exports are added.

T2 insert colors use [Playfield's T2 metadata](https://github.com/neophob/wpc-emu/blob/main/lib/db/t2.js). Flasher identities were checked against the [g5k T2 script](https://github.com/sverrewl/vpxtable_scripts/blob/master/Terminator%202%20(Williams%201991)%20g5k%20v1.1a.vbs); coil 28 is a target reset and is deliberately excluded from flashers. Short flasher pulses remain visible for 80 ms before the visual fade. This does not alter the ROM's coil input to the mechanism model. Photographic artwork includes static illumination, so overlays are visual feedback rather than a photometric model.

All 60 used T2 inputs remain represented exactly once: 47 on the playfield and 13 cabinet inputs beside it. Popeye retains its existing lamp and switch model.

## RAW interoperability

The existing file opener recognizes [Playfield RAW v1](https://github.com/neophob/wpc-emu/blob/main/client/scripts/lib/pin2DmdExport.js) automatically. It reads the 128 × 32 / three-plane header, little-endian timestamps, and three temporal monochrome samples. Pixel intensity is the count of lit samples (0–3), not binary-weighted bitplane decoding. Frame delays and timestamp wrap are preserved. Headerless RAW behavior is unchanged. Truncated frames and unsupported headers are rejected.

## Runtime boundaries

General illumination and complete CPU/NVRAM/mechanism snapshots are not exposed by the current browser bridge. This release adds neither fabricated GI signals nor partial checkpoints presented as complete saved states. They need a runtime extension and round-trip verification before adoption.

## Validation

Run `npm test` for the regular suite, including the mechanism, activity/RAW, UI, and switch coverage checks. `node check-t2-gun-worker.mjs` separately tests the full skull → gun → trigger → playfield sequence against the actual supplied T2 ROM in the compiled WASM worker.
