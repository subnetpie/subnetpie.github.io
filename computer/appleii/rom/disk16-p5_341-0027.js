// Compatibility export. ROM bytes are loaded from the raw AppleWin-style ROM tree.
import {loadRom} from "../rom_loader.js?v=20261017-raw-rom1";
export const disk16_p5_rom_341_0027 = await loadRom(
  new URL("../roms/disk2_16sec.fw", import.meta.url),
  0x100
);
