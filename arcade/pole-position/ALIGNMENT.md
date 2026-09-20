# Pole Position integration

Entry point: `index.html`, `script.js`, `style.css`, matching Bosconian's module-entry structure. `Index.html` redirects to the lowercase entry for old links. ROMs are loaded relative to `./roms/`, which resolves to https://subnetpie.github.io/arcade/pole-position/roms/ on the published site.

## MAME reference

Pinned to **MAME 0.289**, set **polepos** (Namco):

- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/polepos.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/polepos_v.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/polepos_a.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/namco.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/namco06.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/namco51.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/namco52.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/namco53.cpp
- https://github.com/mamedev/mame/blob/mame0289/src/mame/namco/namco54.cpp

This is an instruction-level JavaScript adaptation, not the MAME emulator or a claim of complete MAME conformance. The imported Z8002 interpreter is retained; no complete opcode/flag conformance suite has been run. Unknown opcode telemetry is available as `core.unimpl`.

## Shared devices and board differences

`../../cpu/z80.js` is the active Z80. `../../chips/namco.js` contains the MB88xx, 06XX, 51XX, 52XX and 54XX classes extracted from Bosconian; Bosconian now imports those same definitions. Its class bodies and board wiring were preserved. The shared module retains Bosco clock defaults for existing users. Pole Position steps MCU instructions directly at its own 12 Z80 cycles per MCU cycle and configures the 06XX clock explicitly.

| Hardware | Pole Position wiring |
| --- | --- |
| Master / CPU clocks | 24.576 MHz / 3.072 MHz |
| Raster | 384 clocks × 264 lines, 256 × 224 visible |
| CPU cycles per field | 50,688 (192 per line), 60.606060… Hz |
| 06XX slots | 51XX, 53XX, 52XX, 54XX |
| MCU reset | LS259 Q1, active low |
| Z8002 reset | Q4 / Q5, active low |
| WSG / engine enable | Q2 |
| 52XX | Linear 0x8000-byte voice region, SI high; not Bosco's sample decoder |
| 53XX | Steering delta/change and DSWA, K=0 |
| 51XX | DSWB, IN0, VBLANK timer input |
| WSG | Eight voices, 64 registers, four speaker volumes folded to mono |

Bosco's 50XX and starfield are not Pole Position devices. Its three-voice WSG and analog audio filters are not substituted for Pole Position's sound circuits. Imported `Z80.js` and `namco-wsg.js` remain provenance copies, not active dependencies. The debugger source is retained but its external framework is not enabled in the player.

The scheduler retains instruction overshoot across frames, uses the shared 06XX's first-edge/read-stretch/level-NMI behavior, and clears level IRQ when Q0 is lowered. Video fixes include plane significance, PROM-controlled transparency, opaque background tiles, palette banks, and scroll-address mirrors.

Audio uses the imported discrete voice/noise/engine mixer. Its analog approximations remain; host mixing uses per-frame WSG register state, while MCU DAC writes carry instruction timestamps. Output is mono, not a four-speaker cabinet simulation. ADC conversion is immediate and steering/pedals are digital browser controls. Watchdog timing and NVRAM persistence are not implemented. These limits prevent a blanket claim of cycle-accurate MAME equivalence.

## Correct ROM mapping

`rom-manifest.js` was generated from the pinned driver and device-ROM declarations. All files require exact length, CRC32 and SHA-1 before assembly. Missing critical files stop startup. The unused sync PROM is optional.

- `pp3_2.8l` / `pp3_1.8m`: **sub1**, even / odd bytes, stride 2, starting at 0/1.
- `pp3_6.4l` / `pp3_5.4m`: **sub2**, even / odd bytes, stride 2, starting at 0/1.
- `pp3_28.1f`: characters; `pp1_29.1e`: background tiles.
- `pp3_25.1n` / `pp3_26.1m`: small sprites.
- Big sprite planes preserve holes at 0x6000–0x7fff and 0xe000–0xffff.
- Road ROMs are 0x2000, 0x2000 and 0x1000 bytes; scaling is a separate region.
- `pp1-13.8e` / `pp1-14.9e`: unused video address-decoder PROMs in `proms`.
- `pp1-5.3b`: WSG waveform PROM.
- `pp1_15.6a` / `pp1_16.5a`: engine sample ROMs, not MCU programs.
- `pp2_11.2e`, `pp2_12.2f`, `pp2_13.1e`: 52XX speech data.
- `51xx.bin`, `52xx.bin`, `53xx.bin`, `54xx.bin`: separate 0x400-byte MCU programs. The 54XX CRC is `ee7357e0`.

The four MCU firmware files were extracted from https://emulators.org/emulator/pole-position/src/rom/polepos-roms.js and verified against the exact MAME 0.289 device-ROM SHA-1s. The 51XX, 52XX and 54XX contents also match the existing Bosconian files. Firmware provenance is distinct from JavaScript licensing.

## MiSTer packs

The player accepts individual ROM files and stored/deflated ROM ZIPs, including multiple device ZIPs. ROMs renamed in a MiSTer pack can match by size and CRC, followed by SHA-1 verification. Only the supported `polepos` ROM revision is accepted; a pack's MAME version label does not override byte identity.

An MRA is a recipe, not a ROM. This loader uses the original ZIP members and MAME's region layout; it does not apply FPGA padding, patches or bus transforms. A flattened `.rom` image is not accepted without a separately implemented adapter for that exact MRA layout. Use the source ROM ZIPs referenced by the MRA. No generic MRA/image compatibility is claimed.

## Checks

```
node --test cpu/z80.test.mjs
node --experimental-vm-modules cpu/projects.test.cjs
node --test arcade/pole-position/integration.test.mjs
```

The Pole Position checks verify all ROM identities, region lanes/holes, 06XX edges, WSG voice 8 and enable/mux behavior, real-ROM execution with coin/gas inputs, generated graphics, nonzero audio and reset. They do not certify every game scene or subjective audio fidelity.
