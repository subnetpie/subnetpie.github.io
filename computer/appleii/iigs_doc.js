// Ensoniq ES5503 DOC bus/register model for the Apple IIgs.
// The DOC exposes 64K of wave/register RAM through the IIgs sound glue.
// Oscillator execution/mixing can be layered on this device without changing
// the machine-visible address/data protocol.
export class IIgsDOC {
  constructor(irq = null) {
    this.ram = new Uint8Array(0x10000);
    this.irq = irq;
    this.reset();
  }

  reset() {
    this.address = 0;
    this.control = 0;
    this.irqPending = false;
    this.updateIRQ();
  }

  updateIRQ() {
    if(this.irq) this.irq(this.irqPending);
  }

  setAddressLow(v) { this.address = (this.address & 0xff00) | (v & 0xff); }
  setAddressHigh(v) { this.address = (this.address & 0x00ff) | ((v & 0xff) << 8); }
  addressLow() { return this.address & 0xff; }
  addressHigh() { return (this.address >>> 8) & 0xff; }

  setControl(v) { this.control = v & 0xff; }
  getControl() { return this.control; }

  // IIgs sound glue auto-increments the DOC address when control bit 5 is set.
  advance() {
    if(this.control & 0x20) this.address = (this.address + 1) & 0xffff;
  }

  readData() {
    const v = this.ram[this.address];
    this.advance();
    return v;
  }

  writeData(v) {
    this.ram[this.address] = v & 0xff;
    this.advance();
  }
}
