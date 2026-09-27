# Apple IIgs support status

Updated 2026-09-27. IIgs support remains experimental, with the compatibility
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

## Verified

35 tests pass with the supplied Total Replay v6.1 HDV image enabled:

- IIgs ROM 3 boots that image after the machine has already run without media.
- The rendered menu shows 519 games. Keyboard search selects Battlezone;
  Return loads it and renders its title screen.
- IIgs ROM 3 cold-boots synthetic DSK, WOZ1 and WOZ2 boot sectors and transfers
  control to the loaded program. Existing IIe disk-boot tests still pass.
- STATEREG, reset vectors, VBL polarity, analog paddle timing, and hidden-page
  rendering have targeted regression coverage.

Run from the repository root:

```sh
node --test computer/appleii/*.test.mjs
TOTAL_REPLAY_IMAGE='/path/to/Total Replay v6.1.hdv' node --test computer/appleii/*.test.mjs
```

The Total Replay test is skipped unless its image path is supplied. The test
harness uses the repository ROMs, a local module resolver, and a CPU-rendered
legacy canvas. It does not verify browser input, native SHR rendering, or audio.
Floppies are exposed as read-only because their write sequencer is absent.

## Remaining work

- Complete native memory/ROM-bank switching and shadow behavior.
- Complete RTC/PRAM and ADB input/interrupt behavior.
- Implement native Ensoniq DOC audio and missing peripherals.
- Complete 3.5-inch/SmartPort hardware and floppy writes; validate controller
  timing beyond the boot fixtures.
- Verify sustained gameplay, native IIgs applications, and touch/file-picker
  behavior on iOS Safari. Reaching a game's title does not establish gameplay
  or full software compatibility.
