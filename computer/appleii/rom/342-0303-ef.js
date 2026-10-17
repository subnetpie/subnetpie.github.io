// Compatibility export. ROM bytes are loaded from the raw AppleWin-style ROM tree.
import {loadRom} from "../rom_loader.js?v=20261017-raw-rom1";
export const rom_342_0303_ef = await loadRom(
  new URL("../roms/Apple_IIe/Apple IIe EF Enhanced - 342-0303-A - 2764.bin", import.meta.url),
  0x2000
);
