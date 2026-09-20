import { MB8843 } from "./MB88xx.js";

export class Namco53XX {
  constructor() {
    this.mcu = new MB8843();
    this.portO = 0; this.resetLine = 1;
    this.mcu.readK = () => 0;
    this.mcu.writeO = value => { this.portO = value & 255; };
  }
  loadROM(data) {
    if (data.length !== 0x400) throw new Error('53XX needs a 1024-byte program ROM');
    this.mcu.loadROM(data);
  }
  read() { return this.portO; }
  chipSelect(state) { this.mcu.setIRQ(state); }
  setResetLine(level) {
    const next = level ? 1 : 0;
    if (next !== this.resetLine && !next) this.mcu.reset();
    this.resetLine = next;
  }
  isReset() { return !this.resetLine; }
}
