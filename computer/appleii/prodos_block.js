//
// ProDOS block device / hard drive for Apple IIe.
// Generic ProDOS block-device firmware in slot 7; raw .po/.hdv media.
// Keeps Disk II/WOZ in slot 6 completely independent.
//

export class ProDOSBlockDevice {
    constructor(slot, memory) {
        this.slot = slot & 7;
        this.memory = memory;
        this.image = null;
        this.name = "";
        this.dirty = false;
        this.blockCount = 0;

        this.romBase = 0xc000 | (this.slot << 8);
        this.ioBase = 0xc080 | (this.slot << 4);

        this.rom = new Uint8Array(256).fill(0xea);
        this.buildRom();

        this.memory.add_read_hook(this.read.bind(this));
        this.memory.add_write_hook(this.write.bind(this));
    }

    buildRom() {
        // Apple storage-card signature.  These are harmless BIT zp instructions
        // when execution enters at Cn00, while matching the firmware scanner.
        this.rom.set([0x24,0x20,0x24,0x00,0x24,0x03,0x24,0x3c], 0x00);

        // Boot: read ProDOS block 0 to $0800 through our driver, then enter $0801.
        this.rom.set([
            0xa9,0x01,0x85,0x42,       // command = READ
            0xa9,this.slot<<4,0x85,0x43,// unit = slot, drive 1
            0xa9,0x00,0x85,0x44,       // buffer = $0800
            0xa9,0x08,0x85,0x45,
            0xa9,0x00,0x85,0x46,0x85,0x47, // block = 0
            0x20,0x80,0xc0|this.slot,   // JSR Cn80
            0xb0,0x03,                  // error -> RTS
            0x4c,0x01,0x08,             // JMP $0801
            0x60
        ], 0x08);

        // ProDOS driver at Cn80.
        // $C0F0 performs command in $42-$47 and returns error code in A.
        // On success STATUS returns block count through $C0F1/$C0F2 -> X/Y.
        this.rom.set([
            0xad,0xf0,0xc0,             // LDA $C0F0
            0xd0,0x08,                  // BNE error
            0xae,0xf1,0xc0,             // LDX $C0F1
            0xac,0xf2,0xc0,             // LDY $C0F2
            0x18,                        // CLC
            0x60,                        // RTS
            0x38,                        // error: SEC
            0x60
        ], 0x80);

        // ProDOS device metadata. FC/FD are supplied dynamically.
        this.rom[0xfe] = 0x07; // status + read + write
        this.rom[0xff] = 0x80; // driver entry Cn80
    }

    load_image(name, bin) {
        const src = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
        if (!src.length || (src.length & 0x1ff)) {
            console.error("ProDOS block image must be a multiple of 512 bytes");
            return false;
        }
        const blocks = src.length >>> 9;
        if (blocks > 0xffff) {
            console.error("ProDOS 8 block image exceeds 65535 blocks");
            return false;
        }
        this.image = new Uint8Array(src);
        this.name = name;
        this.blockCount = blocks;
        this.dirty = false;
        console.log("mounted ProDOS block device:", name, blocks, "blocks");
        return true;
    }

    reset() {
        // Media remains mounted across reset, like a physical hard drive.
    }

    read(addr) {
        if (addr >= this.romBase && addr <= this.romBase + 0xff) {
            // The system ROM scans slot 7 before Disk II in slot 6. An empty
            // hard drive must not advertise a boot signature: its failed boot
            // cannot RTS because the firmware enters slot ROMs with JMP.
            if (!this.image) return 0;
            const off = addr & 0xff;
            if (off === 0xfc) return this.blockCount & 0xff;
            if (off === 0xfd) return (this.blockCount >>> 8) & 0xff;
            return this.rom[off];
        }

        if (addr === 0xc0f0) return this.execute();
        if (addr === 0xc0f1) return this.blockCount & 0xff;
        if (addr === 0xc0f2) return (this.blockCount >>> 8) & 0xff;
        return undefined;
    }

    write(addr, val) {
        // Reserve the tiny hardware window used by the ROM driver.
        if (addr >= 0xc0f0 && addr <= 0xc0f2) return 0;
        return undefined;
    }

    execute() {
        if (!this.image) return 0x28; // no device

        const command = this.memory._main[0x42];
        const unit = this.memory._main[0x43];
        const buffer = this.memory._main[0x44] | (this.memory._main[0x45] << 8);
        const block = this.memory._main[0x46] | (this.memory._main[0x47] << 8);

        if ((unit & 0x70) !== (this.slot << 4)) return 0x28;

        if (command === 0) return 0; // STATUS
        if (command !== 1 && command !== 2) return 0x27;
        if (block >= this.blockCount) return 0x27;

        const offset = block << 9;
        if (command === 1) {
            for (let i = 0; i < 512; i++)
                this.memory.write((buffer + i) & 0xffff, this.image[offset + i]);
        } else {
            for (let i = 0; i < 512; i++)
                this.image[offset + i] = this.memory.read((buffer + i) & 0xffff);
            this.dirty = true;
        }
        return 0;
    }
}
