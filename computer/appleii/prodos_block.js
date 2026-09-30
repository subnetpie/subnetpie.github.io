//
// Dual removable block devices: ProDOS and standard/extended SmartPort.
// Generic ProDOS block-device firmware in slot 7; raw .po/.hdv media.
// Keeps Disk II/WOZ in slot 6 completely independent.
//

export class ProDOSBlockDevice {
    constructor(slot, memory) {
        this.slot = slot & 7;
        this.memory = memory;
        this.drives = Array.from({length:2}, () => ({image:null,name:'',dirty:false,writeProtected:false,blockCount:0,changed:false}));
        this.enabled = false;
        this.statusDrive = 0;
        this.smartStack = 0;
        this.smartCount = 0;
        // Preserve the drive-1 API used by boot code and diagnostics.
        for(const key of Object.keys(this.drives[0])) Object.defineProperty(this,key,{
            get:()=>this.drives[0][key], set:value=>{this.drives[0][key]=value;}
        });
        this.trace = null;
        this.writeListener = null;

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
        this.rom.set([0x24,0x20,0x24,0x00,0x24,0x03,0x24,0x00], 0x00);

        // Boot: read ProDOS block 0 to $0800 through our driver, then enter $0801.
        this.rom.set([
            0xa9,0x01,0x85,0x42,       // command = READ
            0xa9,this.slot<<4,0x85,0x43,// unit = slot, drive 1
            0xa9,0x00,0x85,0x44,       // buffer = $0800
            0xa9,0x08,0x85,0x45,
            0xa9,0x00,0x85,0x46,0x85,0x47, // block = 0
            0x20,0x80,0xc0|this.slot,   // JSR Cn80
            0xb0,0x07,                  // error -> RTS
            0xa2,this.slot<<4,          // boot convention: X = slot * 16
            0x86,0x43,                  // ProDOS boot sector expects unit/slot in $43
            0x4c,0x01,0x08,             // JMP $0801
            0x60
        ], 0x08);

        // ProDOS driver at Cn80.
        // $C0F0 performs command in $42-$47 and returns error code in A.
        // On success STATUS returns block count through $C0F1/$C0F2 -> X/Y.
        this.rom.set([
            0xad,0xf0,0xc0,             // LDA $C0F0
            0xd0,0x0e,                  // BNE error
            0xa5,0x42,                  // STATUS alone returns block count
            0xd0,0x06,                  // read/write preserve X and Y
            0xae,0xf1,0xc0,             // LDX $C0F1
            0xac,0xf2,0xc0,             // LDY $C0F2
            0xa9,0x00,                  // successful command returns A = 0
            0x18,                        // CLC
            0x60,                        // RTS
            0x38,                        // error: SEC
            0x60
        ], 0xa0);
        // Standard SmartPort entry is three bytes beyond the ProDOS entry.
        this.rom.set([0x4c,0xa0,0xc0|this.slot],0x80);
        this.rom.set([
            0xba,                       // TSX: emulation-mode caller stack
            0x8e,0xf3,0xc0,            // STX $C0F3
            0xad,0xf4,0xc0,            // execute inline SmartPort request
            0xae,0xf5,0xc0,0xac,0xf6,0xc0, // transfer count X/Y
            0xc9,0x01,0x60             // CMP #1: carry iff error; RTS
        ],0x83);

        // ProDOS device metadata. FC/FD are supplied dynamically.
        // Keep the legacy second-drive flag consistent with execute(), which
        // exposes distinct $70 and $F0 units. ProDOS 16 v1.3
        // assumes the boot slot has a pair when reordering its device list;
        // advertising only one entry leaves a byte on its return stack.
        this.rom[0xfb] = 0x80; // extended SmartPort; no RAM-card, SCSI, or reserved flags
        this.rom[0xfe] = 0x17; // legacy drive pair + status/read/write
        this.rom[0xff] = 0x80; // driver entry Cn80
    }

    load_image(name, bin, options = {}, drive = 0) {
        const disk = this.drives[drive];
        if(!disk) throw new Error("Invalid drive");
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
        this.enabled = true;
        disk.physical = options.physical;
        disk.image = new Uint8Array(src);
        disk.writeProtected = !!options.writeProtected;
        disk.name = name;
        disk.blockCount = blocks;
        disk.dirty = false;
        disk.changed = true;
        disk.persistenceKey = options.persistenceKey || null;
        console.log("mounted ProDOS block device:", name, blocks, "blocks");
        return true;
    }

    eject(drive = 0) {
        const disk = this.drives[drive];
        disk.changed = !!disk.image;
        disk.image = null;
        disk.name = '';
        disk.blockCount = 0;
        disk.dirty = false;
        disk.writeProtected = false;
    }

    reset() {
        // Media remains mounted; a boot starts a fresh change-detection session.
        this.enabled=this.drives.some(d=>d.image);
        for(const disk of this.drives)disk.changed=false;
    }

    setTrace(fn) { this.trace = fn; }
    setWriteListener(fn) { this.writeListener = typeof fn === 'function' ? fn : null; }
    notifyWrite(drive, disk, block) {
        if(this.writeListener) this.writeListener(drive, disk, block);
    }

    read(addr) {
        if (addr >= this.romBase && addr <= this.romBase + 0xff) {
            // The system ROM scans slot 7 before Disk II in slot 6. An empty
            // hard drive must not advertise a boot signature: its failed boot
            // cannot RTS because the firmware enters slot ROMs with JMP.
            // Once started, keep firmware present through hot ejection.
            if (!this.enabled) return 0;
            const off = addr & 0xff;
            if (off === 0xfc) return this.blockCount & 0xff;
            if (off === 0xfd) return (this.blockCount >>> 8) & 0xff;
            return this.rom[off];
        }

        if (addr === 0xc0f4) return this.executeSmartPort();
        if (addr === 0xc0f5) return this.smartCount & 255;
        if (addr === 0xc0f6) return this.smartCount >>> 8;
        if (addr === 0xc0f0) return this.execute();
        if (addr === 0xc0f1) return this.drives[this.statusDrive].blockCount & 0xff;
        if (addr === 0xc0f2) return (this.drives[this.statusDrive].blockCount >>> 8) & 0xff;
        return undefined;
    }

    write(addr, val) {
        // Reserve the tiny hardware window used by the ROM driver.
        if(addr===0xc0f3)this.smartStack=val;
        if (addr >= 0xc0f0 && addr <= 0xc0f6) return 0;
        return undefined;
    }

    // Apple IIgs Firmware Reference, SmartPort: standard calls use bank-zero
    // pointers; extended calls use long pointers and five inline bytes.
    executeSmartPort() {
        const read=a=>this.memory.read(a&0xffffff);
        const word=a=>read(a)|(read(a+1)<<8);
        const stack=n=>0x100|((this.smartStack+n)&255);
        const ret=read(stack(1))|(read(stack(2))<<8);
        const rawCommand=read(ret+1), extended=!!(rawCommand&0x40);
        const command=rawCommand&~0x40;
        const long=a=>(word(a)+(word(a+2)*65536))>>>0;
        const list=extended?long(ret+2):word(ret+2), next=(ret+(extended?5:3))&0xffff;
        this.memory.write(stack(1),next&255);this.memory.write(stack(2),next>>>8);
        this.smartCount=0;
        if(![0,1,2,4].includes(command))return 1; // unsupported command
        if(read(list)!==3)return 4; // parameter count
        const unit=read(list+1), buffer=extended?long(list+2):word(list+2);
        const argument=list+(extended?6:4), code=read(argument);
        const bufferAddress=i=>(buffer+i)&(extended?0xffffff:0xffff);
        const output=bytes=>{
            bytes.forEach((v,i)=>this.memory.write(bufferAddress(i),v));
            this.smartCount=bytes.length;
        };
        if(unit===0) {
            if(command===0 && code===0) {output([2,0x40,0,0,0,0,0,0]);return 0;}
            if(command===4 && code===0) {for(const disk of this.drives)disk.changed=false;return 0;}
            return 0x21;
        }
        const disk=this.drives[unit-1];
        if(!disk)return 0x28;
        if(command===4) {
            if(code!==0)return 0x21;
            disk.changed=false;return 0;
        }
        if(command===0) {
            if(code!==0 && code!==3)return 0x21;
            // An empty removable drive remains discoverable; online is bit 4.
            const status=0xa0|(disk.writeProtected?4:0x40)|(disk.image?0x10:0);
            const bytes=[status,disk.blockCount&255,disk.blockCount>>>8,0];
            if(extended)bytes.push(0);
            if(code===3) {
                const id='EMU DISK '+unit;
                bytes.push(id.length,...Array.from(id.padEnd(16),c=>c.charCodeAt(0)),disk.physical==='35'?1:2,0xc0,0,1);
            }
            output(bytes);
            if(code===0 && disk.changed) {disk.changed=false;return 0x2e;}
            return 0;
        }
        if(disk.changed) {disk.changed=false;return 0x2e;}
        if(!disk.image)return 0x2f;
        const block=extended?long(argument):word(argument)|(read(argument+2)<<16);
        if(block>=disk.blockCount)return 0x2d;
        if(command===2 && disk.writeProtected)return 0x2b;
        for(let i=0;i<512;i++) {
            if(command===1)this.memory.write(bufferAddress(i),disk.image[block*512+i]);
            else disk.image[block*512+i]=read(bufferAddress(i));
        }
        if(command===2) {
            disk.dirty=true;
            this.notifyWrite(unit-1,disk,block);
        }
        this.smartCount=512;return 0;
    }

    execute() {

        // ProDOS block-device entry uses the zero-page parameter list at
        // $42-$47. Bit 7 selects the independent second drive.
        const command = this.memory.read(0x42);
        const unit = this.memory.read(0x43);
        this.statusDrive = unit >>> 7;
        const disk = this.drives[this.statusDrive];
        if(!disk.image && command!==0) return 0x2f; // removable drive is offline
        const buffer = this.memory.read(0x44) | (this.memory.read(0x45) << 8);
        const block = this.memory.read(0x46) | (this.memory.read(0x47) << 8);

        // Unit bits 4-6 select the slot; bit 7 is the drive number and must
        // not participate in slot validation.
        if (this.trace) this.trace({command, unit, buffer, block, blocks:disk.blockCount});
        if ((unit & 0x70) !== ((this.slot & 7) << 4)) return 0x28;

        if (command === 0) return 0; // STATUS
        if (command !== 1 && command !== 2) return 0x27;
        if (command === 2 && disk.writeProtected) return 0x2b;
        if (block >= disk.blockCount) return 0x27;

        const offset = block << 9;
        if (command === 1) {
            for (let i = 0; i < 512; i++)
                this.memory.write((buffer + i) & 0xffff, disk.image[offset + i]);
        } else {
            for (let i = 0; i < 512; i++)
                disk.image[offset + i] = this.memory.read((buffer + i) & 0xffff);
            disk.dirty = true;
            this.notifyWrite(this.statusDrive,disk,block);
        }
        return 0;
    }
}
