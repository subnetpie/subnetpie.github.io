# Apple II / IIgs ROM resources

Raw ROM/PROM images used by the emulator. This tree follows the ROM resource naming/layout used by AppleWin-rs at commit `3dc43f3c859aba9aa2a4c04d8762c676784544df` where it matches the hardware currently emulated here.

Source layout reference:
`AaronSaikovski/AppleWin-rs/roms`

## Runtime set

- `Apple2e_Enhanced_Video.rom` — Enhanced IIe character/video ROM
- `Apple_IIe/Apple IIe CD Enhanced - 342-0304-A - 2764.bin`
- `Apple_IIe/Apple IIe EF Enhanced - 342-0303-A - 2764.bin`
- `Apple_IIe/Apple IIe Enhanced Video ROM - 342-0265-A - US 1983.bin`
- `disk2_16sec.fw` — Disk II 16-sector P5 boot ROM
- `disk2fw.bin` — AppleWin-compatible alias of the same Disk II ROM
- `Apple_IIgs/Apple IIGS ROM 3 Banks FC-FD - 341-0728.bin`
- `Apple_IIgs/Apple IIGS ROM 3 Banks FF-FE - 341-0748.bin`

Project device firmware retained alongside the AppleWin-style resources:

- `341-0344a.bin` — Apple II Memory Expansion Card
- `341s0632-2.bin`
- `344s0047.bin`

ROM bytes must live here as binary resources. JavaScript may load ROMs but must not embed ROM byte arrays.
