# Mockingboard v2.2 sound

One Mockingboard is installed in slot 4. In Apple II mode software can detect it
at $C400/$C480. In IIgs mode set slot 4 to **Your Card** in the IIgs Control Panel
(or set bit 4 of $C02D); internal slot ROM selection is respected. Select
Mockingboard/slot 4 in games that have their own sound configuration.

Implemented: two AY-3-8913 generators (six voices), stereo output, tone/noise,
all envelope shapes, register readback/reset, VIA port direction registers,
T1 continuous/one-shot timers, T2 timed interrupts, IFR/IER acknowledgement,
and CPU IRQ routing. Output shares the existing speaker/DOC audio queue and
Safari unlock path. The sound clock stays near 1 MHz in IIgs fast mode.

Scope: v2.2 with empty optional speech sockets. SSI-263 speech, a second card,
VIA external pin handshakes/shift-register modes and T2 external pulse counting
are not emulated. Timing is at instruction boundaries; this is not a claim of
cycle-exact MAME equivalence or tested compatibility with every music player.

Hardware references:
- https://www.reactivemicro.com/product/mockingboard-assembled-or-kit/
- https://wiki.reactivemicro.com/Mockingboard
- https://downloads.reactivemicro.com/Apple%20II%20Items/Hardware/Mockingboard_A/Datasheet/
- https://github.com/mamedev/mame/blob/mame0289/src/devices/bus/a2bus/a2mockingboard.cpp

Validation: `node --test computer/appleii/mockingboard.test.mjs computer/appleii/w65c02_timing.test.mjs`.
Tests cover chip independence, readback, IRQ acknowledgement/reload, stereo PCM,
reset, and register/IRQ routing through both complete motherboard types.
