# Apple II / IIgs ROM Images

This directory is for raw ROM/PROM images only. Emulator source must load ROM bytes from files in this directory; ROM contents should not be embedded in JavaScript modules.

## Canonical filenames

### Apple IIe Enhanced

- `3420265A.bin` — character generator ROM
- `342_0304_CD.bin` — system ROM C/D half
- `342_0303_EF.bin` — system ROM E/F half

### Disk II 16-sector interface

- `341-0027.bin` — P5 boot ROM
- `341-0028.bin` — P6 state-machine PROM

### Disk II 13-sector interface

These are retained only if 13-sector controller emulation is enabled again.

- `341-0009.bin` — P5 boot ROM
- `341-0010.bin` — P6 state-machine PROM

### Apple IIgs

- `341-0728.bin` — IIgs ROM 03 image half
- `341-0748.bin` — IIgs ROM 03 image half
- `341s0632-2.bin` — IIgs peripheral/firmware ROM currently present in the project
- `344s0047.bin` — IIgs peripheral/firmware ROM currently present in the project

### Apple II Memory Expansion Card

- `341-0344a.bin` — 4 KiB card firmware ROM

## Migration status

Raw images already present in the repository:

- `341-0344a.bin`
- `341s0632-2.bin`
- `344s0047.bin`
- IIgs ROM images currently stored as extensionless `341-0728` and `341-0748`; these should be replaced by the canonical `.bin` filenames above.

Legacy JavaScript ROM modules still required by current emulator code until their raw replacements are added:

- `342-0265-a.js` -> `3420265A.bin`
- `342-0304-cd.js` -> `342_0304_CD.bin`
- `342-0303-ef.js` -> `342_0303_EF.bin`
- `disk16-p5_341-0027.js` -> `341-0027.bin`

Once the corresponding raw files are present, update the loaders and delete the legacy JavaScript modules.

## Historical source notes

The original project documentation referenced the Apple II ROM archive at Asimov for the Apple IIe and Disk II images. Preserve verified original dump names and checksums when adding replacements.