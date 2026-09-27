# Apple IIgs support status

Updated 2026-09-27. IIgs support is experimental and incomplete.

## Implemented in this update

- Instruction-level 65C816 decoding for all 256 opcodes, native/emulation
  modes, register widths, decimal arithmetic, interrupts, and block moves.
- IIgs ROM reset/compatibility mapping, preserving language-card RAM reads.
- Slow-bank peripheral mirrors, basic ADB command responses and FIFO,
  and IWM mode/status handling for startup.
- Regression tests for CPU modes, arithmetic, block moves, stack boundaries,
  ROM reset vectors, ADB initialization, and IWM empty-drive status.

## Validation and limits

The repository tests cover representative CPU semantics plus existing IIe,
WOZ, VBL polling, and touch-layout regressions. The opcode sweep checks decode
coverage; it does not establish full CPU correctness or bus-cycle accuracy.
Earlier headless ROM testing reached the Apple IIgs ROM 3 startup display.
The latest IWM changes have not been verified through a complete IIgs disk boot.

Total Replay previously reached its game menu in IIe mode. Total Replay boot
and gameplay in IIgs mode remain unverified. Automated touch-layout tests do
not replace testing file selection, joystick input, and zoom on iOS Safari.

## Remaining work

- Complete native memory/ROM-bank switching and shadow behavior.
- Complete RTC/PRAM, ADB input/interrupt behavior, native video timing and VBL.
- Complete and validate IIgs disk-controller/SmartPort boot paths.
- Implement native Ensoniq DOC audio and other missing peripherals.
- Validate real ROM startup, disk loading, Total Replay, and mobile input
  end to end before declaring IIgs support complete.
