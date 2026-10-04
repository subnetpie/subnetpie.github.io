# Mockingboard v2.2 sound

One Mockingboard with two SSI-263 speech sockets populated is installed in slot 4. In Apple II mode software can detect it
at $C400/$C480. In IIgs mode set slot 4 to **Your Card** in the IIgs Control Panel
(or set bit 4 of $C02D); internal slot ROM selection is respected. Select
Mockingboard/slot 4 in games that have their own sound configuration.

Implemented: two AY-3-8913 generators (six voices), stereo output, tone/noise,
all envelope shapes, register readback/reset, VIA port direction registers,
T1 continuous/one-shot timers, T2 timed interrupts, IFR/IER acknowledgement,
and CPU IRQ routing. Output shares the existing speaker/DOC audio queue and
Safari unlock path. The sound clock stays near 1 MHz in IIgs fast mode.

Speech support: writes at $C440 drive the primary SSI-263 and VIA B CA1;
$C420 drives the secondary chip and VIA A CA1. Speech writes also retain the
VIA register aliases. Phoneme completion runs on emulated time, even with
audio locked or muted. Speech is mixed with AY, speaker and DOC audio.

The speech backend uses Chris Foxwell’s recordings distributed with AppleWin
(GPL-2.0-or-later); see vendor/SSI263-NOTICE.md. Duration, rate, amplitude,
power-down and completion interrupts are implemented. Inflection/articulation
registers are stored but their analog response is not synthesized; filter
frequency is approximated. Resampling phonemes to duration also changes their
pitch. This is recognizable sample-based speech, not analog-chip fidelity.
Phoneme 1 substitutes phoneme 2, matching the source sample set.

Scope limitations: SC-01 speech, a second card,
VIA external pin handshakes/shift-register modes and T2 external pulse counting
are not emulated. Timing is at instruction boundaries; this is not a claim of
cycle-exact MAME equivalence or tested compatibility with every music player.

Hardware references:
- https://www.reactivemicro.com/product/mockingboard-assembled-or-kit/
- https://wiki.reactivemicro.com/Mockingboard
- https://downloads.reactivemicro.com/Apple%20II%20Items/Hardware/Mockingboard_A/Datasheet/
- https://github.com/mamedev/mame/blob/mame0289/src/devices/bus/a2bus/a2mockingboard.cpp

Validation: `node --test computer/appleii/ssi263.test.mjs computer/appleii/mockingboard.test.mjs computer/appleii/w65c02_timing.test.mjs`.
Tests cover chip independence, readback, IRQ acknowledgement/reload, stereo PCM,
reset, and register/IRQ routing through both complete motherboard types.
