// Compatibility export. ROM bytes are loaded from the raw AppleWin-style ROM tree.
import {loadRom} from "../rom_loader.js?v=20261017-raw-rom1";
export const rom_342_0265_a = await loadRom(
  new URL("../roms/Apple2e_Enhanced_Video.rom", import.meta.url),
  0x1000
);
