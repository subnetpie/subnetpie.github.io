# Apple IIgs support status

Updated 2026-09-29. IIgs support remains experimental, with the compatibility
boot path now exercised end to end.

## Implemented

- Instruction-level 65C816 decoding for all 256 opcodes, native/emulation
  modes, register widths, decimal arithmetic, interrupts, and block moves.
- IIgs ROM reset/compatibility mapping and STATEREG bank-state restoration.
- Slow-bank peripheral mirrors, basic ADB command responses/FIFO, and IWM
  startup status handling.
- Hardware-state reset before CPU reset; loading an IIgs disk uses a cold boot
  so a prior monitor/program cannot bypass the newly mounted image.
- Active-high IIgs VBL from the video clock and elapsed-time analog paddles.
- Hidden graphics-page updates, fixing stale/black output on page flips.
- Startup diagnostics clear after success; the watchdog no longer appears
  unconditionally during a healthy boot.

## Current test limitation

The Total Replay regression currently reaches its menu and loads Battlezone,
but its final visible-title assertion fails on both the current upstream
build and this fix. Do not interpret the earlier verification below as a
fresh pass for the current rendering changes. iPhone frame rate and gameplay
have not been measured by the headless tests.

## Verified

- The supplied Thexder ZIP/2MG now passes ProDOS 16 v1.3 initialization
  and reaches its native Sierra graphics. The slot-7 ROM advertises the
  legacy drive pair already accepted by the block interface, preventing
  the device-list reorder from leaving a byte on the return stack and
  returning to `$0099E1`. This verifies startup, not full game compatibility.
- Failed slot-7 boot reads branch to the firmware return instruction.


Regression coverage includes the supplied Total Replay v6.1 HDV image:

- IIgs ROM 3 boots that image after the machine has already run without media.
- The rendered menu shows 519 games. Keyboard search selects Battlezone;
  Return loads it and renders its title screen.
- IIgs ROM 3 cold-boots synthetic DSK, WOZ1 and WOZ2 boot sectors and transfers
  control to the loaded program. Existing IIe disk-boot tests still pass.
- Official ProDOS 2.4.2 reaches its file menu on the slot-7 block device in
  IIe and IIgs modes. Firmware passes the boot slot in X and preserves X/Y
  on block reads/writes; STATUS alone returns the block count.
- STATEREG, reset vectors, VBL polarity, analog paddle timing, and hidden-page
  rendering have targeted regression coverage.

Run from the repository root:

```sh
node --test computer/appleii/*.test.mjs
TOTAL_REPLAY_IMAGE='/path/to/Total Replay v6.1.hdv' node --test computer/appleii/*.test.mjs
```

To run the optional official ProDOS boot checks, also set `PRODOS_242_DSK` to
the DOS-order ProDOS 2.4.2 release image.

The Total Replay test is skipped unless its image path is supplied. The test
harness uses the repository ROMs, a local module resolver, and a CPU-rendered
legacy canvas. It does not verify browser input, native SHR rendering, or audio.
Floppies are exposed as read-only because their write sequencer is absent.

## Disk image loading

ZIP files are decompressed with a bundled fflate 0.8.2 build. A single image
loads directly; an archive with multiple supported images presents a chooser.
Mac resource-fork files and unrelated archive entries are ignored.

`.2mg` / `.2img` headers are parsed and checked before mounting. DOS-order and
ProDOS-order 140K payloads mount as 5.25-inch disks, with sector conversion for
ProDOS order. Nibble-format 2MG and raw `.nib` images use 35 fixed-size tracks.
Larger ProDOS payloads mount on the existing slot-7 block device (up to 65535
blocks); this does not emulate physical 3.5-inch hardware. Block-image write
protection is honored. Disk comments/creator data are excluded from the payload.

The tests also boot all three 2MG formats from ZIP and load the supplied Total
Replay image through a ZIP/2MG wrapper. Archive-picker logic is tested, but the
native iOS picker still needs device verification.

## Remaining work

- Complete native memory/ROM-bank switching and shadow behavior.
- Complete RTC/PRAM and ADB input/interrupt behavior.
- Verify native DOC audio on iOS hardware and extend remaining peripheral coverage.
- Complete 3.5-inch/SmartPort hardware and floppy writes; validate controller
  timing beyond the boot fixtures.
- Verify sustained gameplay, native IIgs applications, and touch/file-picker
  behavior on iOS Safari. Reaching a game's title does not establish gameplay
  or full software compatibility.

Optional native startup regressions (images are not bundled):

```sh
THEXDER_ZIP='/path/to/Thexder.zip' ARKANOID_IMAGE='/path/to/Arkanoid.2mg' node --test computer/appleii/iigs_interrupt_boot.test.mjs
```

## DOC audio update (2026-09-29)

The DOC now uses the two overhead clock slots, separate waveform-size and
resolution fields, phase-preserving loops, one-shot/swap/sync/AM modes,
control-selected stereo routing, fixed mixer gain, and per-scan PCM delivery.
The behavioral reference is MAME 0.289's ES5503 core. Playback buffers frame
jitter, interpolates output, bounds stale queued audio, and clears queued
sound on Stop/Reset.

All 21 targeted checks passed, including Thexder (30 emulated seconds) and
Arkanoid (70 seconds, with Space input). Both generated changing, finite PCM
without clipping in these captures. Worklet tests cover 44.1 and 48 kHz output.
These are automated signal checks, not a listening comparison or iPhone test.

```sh
THEXDER_ZIP='/path/to/Thexder.zip' ARKANOID_IMAGE='/path/to/Arkanoid.2mg' node --test computer/appleii/iigs_doc.test.mjs computer/appleii/doc_audio_worklet.test.mjs computer/appleii/iigs_audio_integration.test.mjs
```
