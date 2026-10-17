// Compatibility export. ROM bytes are loaded from the raw AppleWin-style ROM tree.
import {loadRom} from "../rom_loader.js?v=20261017-raw-rom1";
export const rom_342_0304_cd = await loadRom(
  new URL("../roms/Apple_IIe/Apple IIe CD Enhanced - 342-0304-A - 2764.bin", import.meta.url),
  0x2000
);
