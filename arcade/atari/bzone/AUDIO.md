# Battlezone audio — MAME 0.289

The former approximate synthesizer has been replaced with ports of the Battlezone
circuit and POKEY audio paths from the `mame0289` tag. All effects are driven by the
ROM's writes to $1820–$182F and $1840; there are no guessed per-effect samples,
extra music tracks, or independent UFO/missile oscillators.

## Circuit mapping

| Source | Implementation |
| --- | --- |
| Engine | R5–R11/C11/C13 voltage ramp, CV-controlled 555, 4–15 and 6–15 counters, four equal 33k taps, 0.47 µF mixer capacitor |
| Shell | 6 kHz 16-bit noise, rising-edge divider, 4066 charge/discharge network, 4.7 µF envelope, custom op-amp filter |
| Explosion | Noise bits 11–14 NAND and divider, 10 µF envelope, custom op-amp filter |
| Radar/UFO/missile and other ROM-programmed tones | Four POKEY channels at 1,512,000 Hz; distortion polynomial gating, borrow delays, joined timers, high-pass sampling, STIMER and SKCTL |
| Output | MAME's nonlinear POKEY resistor DAC and 10k/15 nF RC stage; Battlezone resistor mixer, 0.1 µF coupling capacitor, 48000/32768 normalization |

The R11 adjustment uses MAME's default 40%: 49 kohm. Both shell and explosion
loud/soft filters follow **D1**, including MAME 0.289's explicit shell wiring to
`BZ_INP_EXPLOLS`; D3 is decoded but unused in that version's circuit. D5 mutes the
whole final mix. D6 remains the start-lamp bit, not an audio trigger.

## Timing

POKEY advances once per CPU clock, including between register writes. Discrete
nodes run at the browser audio sample rate. The playback callback drains a sample
queue with two callback blocks of startup buffering. It does not advance a second
sound timeline. The RAF loop accumulates elapsed time to retain the existing
41.015625 Hz frame cadence on 60/120 Hz displays. NMI instruction overhead and
instruction overshoot carry into the next 6144-cycle interval rather than adding
extra CPU time every interrupt.

## Validation

Run from the repository root:

```
node --test arcade/bzone/audio.test.mjs arcade/bzone/audio-rom.test.mjs
```

- 2,097,152 raw POKEY output states match the original MAME clock and polynomial
  methods across all 256 AUDCTL settings, all distortion modes, joined counters,
  and filters. The expected digest comes from the compiled C++ oracle below.
- A direct comparison of 960,000 envelope/filter/CV/555 node values against the
  original C++ STEP methods had maximum absolute difference 2.93e-10. Sampled
  reference values are checked into `test-support/discrete-reference.json`.
- Scheduler/playback tests cover 60/120 Hz displays and 44100/48000 Hz audio, with
  no buffer underruns or overruns in the simulated five-second runs.
- A headless 30-second run with the repository's Battlezone ROMs boots, inserts a
  coin, starts, fires, and drives forward. It produces 41,308 POKEY writes, reaches
  engine/rev/shell/explosion latch states, and produces finite audio with peak
  0.9804 and no queue overflows.

This establishes component-level correspondence, **not bit-identical complete
MAME WAV output**. The browser performs its own final resampling; POKEY is averaged
into browser-rate samples. CPU bus writes use the existing instruction-level
6502 timestamps. Browser/device audio output has not been auditioned on iPad.
Only the Battlezone-connected POKEY audio path is ported; serial/pot/keyboard
peripherals are not implemented by `pokey-audio.js`.

## Sources and reproducible C++ oracles

Pinned upstream files:

- https://github.com/mamedev/mame/blob/mame0289/src/mame/atari/bzone_a.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/atari/bzone.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/pokey.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/pokey.h
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/disc_flt.hxx
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/disc_dev.hxx
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/disc_wav.hxx
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/disc_mth.hxx

`test-support/mame-pokey-reference.py` extracts the original clock and polynomial
methods from a supplied `pokey.cpp`, then builds a standalone oracle with g++.
Its binary stdout SHA-256 is
`f2063c2c2f4c6fa9e1e0e5ece3bed8896514517146bce908ec58e96289098d05`.
`test-support/mame-discrete-reference.py` takes a directory containing
`bzone_a.cpp`, `disc_flt.hxx`, and `disc_dev.hxx` and extracts the original STEP
bodies. Its stdout consists of 192000 rows of five native-endian doubles: shell
filter, explosion filter, CV, 555 output, and 555 capacitor voltage.

The port retains the upstream BSD-3-Clause licensing; see `LICENSE-MAME`.
