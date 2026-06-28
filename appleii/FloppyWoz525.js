//
//  apple2e 5.25" floppy disk drive emulator
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  DSK support is nibble-stream based.
//  WOZ 1 and WOZ 2 read-only mount support for 5.25" images.
//  Nibble cache built from WOZ track bitstreams by emulating the
//  Disk II GCR latch: shift bits in, emit a nibble whenever bit 7 sets.
//
//  refs:
//    https://applesaucefdc.com/woz/reference1/
//    https://applesaucefdc.com/woz/reference2/
//    https://ciderpress2.com/formatdoc/Woz-notes.html
//

import {disk16_p5_rom_341_0027} from "https://subnetpie.github.io/appleii/rom/disk16-p5_341-0027.js";

// 6-and-2 translation table  (ProDOS_2_4_2.dsk 8596-85d6)
const write_62 = [
    0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,
    0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,
    0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,
    0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff
];

// DOS 3.3 physical sector interleave  (ProDOS_2_4_2.dsk 8d2b-8d3b)
const sec_int = [0x00,0x0d,0x0b,0x09,0x07,0x05,0x03,0x01,0x0e,0x0c,0x0a,0x08,0x06,0x04,0x02,0x0f];

// WOZ chunk / signature constants (all little-endian uint32)
const WOZ_SIG1   = 0x315A4F57; // "WOZ1"
const WOZ_SIG2   = 0x325A4F57; // "WOZ2"
const CHUNK_INFO = 0x4F464E49; // "INFO"
const CHUNK_TMAP = 0x50414D54; // "TMAP"
const CHUNK_TRKS = 0x534B5254; // "TRKS"

// ---------------------------------------------------------------------------
// Little-endian helpers
// ---------------------------------------------------------------------------
function u16le(a, o) { return  a[o] | (a[o+1] << 8); }
function u32le(a, o) { return (a[o] | (a[o+1] << 8) | (a[o+2] << 16) | (a[o+3] << 24)) >>> 0; }

// ---------------------------------------------------------------------------
// BaseMedium – shared position state for DSK and WOZ media
// ---------------------------------------------------------------------------
class BaseMedium
{
    constructor() {
        this.head_pos = 0;  // current quarter-track position (0..139)
        this.byte_pos = 0;  // current read position in the nibble stream
    }

    set_head_pos(pos) { this.head_pos = pos; }
    reset_rotation()  { this.byte_pos = 0; }
    read_byte()       { return 0; }
}

// ---------------------------------------------------------------------------
// DskMedium – pre-encoded nibble stream for standard .dsk images
// ---------------------------------------------------------------------------
class DskMedium extends BaseMedium
{
    constructor(name, src, sectorEncoder) {
        super();
        this.name = name;
        this.track_bytes = new Array(35);

        for(let t = 0; t < 35; t++) {
            let track = [];
            // Sectors iterated 0..15 ascending so sec_int[] maps to the correct
            // physical interleave.
            for(let s = 0; s < 16; s++) {
                track = track.concat(sectorEncoder(src, t, s));
            }
            this.track_bytes[t] = new Uint8Array(track);
        }
    }

    read_byte() {
        const track = this.track_bytes[this.head_pos >> 2]; // quarter-track → whole-track
        if(!track || !track.length) return 0;
        if(this.byte_pos >= track.length) this.byte_pos = 0;
        return track[this.byte_pos++];
    }
}

// ---------------------------------------------------------------------------
// WozTrack – one track's raw bitstream with a lazy nibble cache
// ---------------------------------------------------------------------------
class WozTrack
{
    constructor(bytes, bitCount) {
        this.bytes    = bytes;
        this.bitCount = bitCount;
        this.nibble_cache = null;
    }

    // Read a single bit from the circular bitstream.
    getBit(bitPos) {
        if(this.bitCount <= 0) return 0;
        bitPos %= this.bitCount;
        return (this.bytes[bitPos >> 3] & (0x80 >> (bitPos & 7))) ? 1 : 0;
    }

    // Build (once) a nibble cache by emulating the Disk II GCR latch:
    // shift bits in one at a time; emit a nibble whenever bit 7 is set.
    // This correctly handles nibbles that start on any bit boundary.
    // A second pass of up to 8 bits catches any valid nibble whose bits
    // are split across the track loop boundary.
    buildNibbleCache() {
        if(this.nibble_cache) return this.nibble_cache;
        if(!this.bytes || !this.bitCount) {
            this.nibble_cache = new Uint8Array(0);
            return this.nibble_cache;
        }

        const out = [];
        let cur = 0;

        // Main pass — one full revolution of bits.
        for(let i = 0; i < this.bitCount; i++) {
            cur = ((cur << 1) | this.getBit(i)) & 0xFF;
            if(cur & 0x80) {
                out.push(cur);
                cur = 0;
            }
        }

        // Wrap-around pass — up to 8 extra bits from the start of the stream
        // to complete any nibble that straddles the loop boundary.
        for(let i = 0; i < 8; i++) {
            cur = ((cur << 1) | this.getBit(i)) & 0xFF;
            if(cur & 0x80) {
                out.push(cur);
                break;
            }
        }

        this.nibble_cache = new Uint8Array(out);
        return this.nibble_cache;
    }
}

// ---------------------------------------------------------------------------
// WozMedium – TMAP + per-track WozTrack objects parsed from a WOZ image
// ---------------------------------------------------------------------------
class WozMedium extends BaseMedium
{
    constructor(name) {
        super();
        this.name   = name;
        this.info   = null;
        this.tmap   = new Uint8Array(160).fill(0xFF);
        this.tracks = [];
    }

    // Override set_head_pos to maintain a proportional stream position when
    // the head moves to a different track.  The WOZ spec requires that the
    // bit pointer remain continuous across track changes so that
    // cross-track-sync copy protection works correctly.
    set_head_pos(pos) {
        if(pos === this.head_pos) return;

        const oldId = this.tmap[this.head_pos];
        const newId = this.tmap[pos];
        this.head_pos = pos;

        if(newId === oldId) return;   // TMAP maps both quarter-tracks to the same data

        if(oldId !== 0xFF && newId !== 0xFF) {
            const oldTrack = this.tracks[oldId];
            const newTrack = this.tracks[newId];
            if(oldTrack && newTrack) {
                const oldCache = oldTrack.buildNibbleCache();
                const newCache = newTrack.buildNibbleCache();
                if(oldCache.length && newCache.length) {
                    // Scale byte_pos proportionally to the new track length.
                    this.byte_pos = Math.floor(
                        this.byte_pos * newCache.length / oldCache.length
                    ) % newCache.length;
                    return;
                }
            }
        }

        // Either the old or new track is empty (0xFF) or has no data — reset.
        // The spec recommends treating empty tracks as 51200 bits; for a
        // nibble-stream implementation resetting to 0 is a safe approximation.
        this.byte_pos = 0;
    }

    read_byte() {
        const trackId = this.tmap[this.head_pos];
        if(trackId === 0xFF) return 0;  // empty track → no data

        const track = this.tracks[trackId];
        if(!track) return 0;

        const bytes = track.buildNibbleCache();
        if(!bytes.length) return 0;

        this.byte_pos %= bytes.length;  // safe modulo wrap
        return bytes[this.byte_pos++];
    }

    // ------------------------------------------------------------------
    // Static factory — parse a WOZ 1 or WOZ 2 image from an ArrayBuffer
    // or Uint8Array and return a ready-to-use WozMedium.
    // ------------------------------------------------------------------
    static fromWoz(name, bin) {
        // Accept either ArrayBuffer (FileReader result) or Uint8Array.
        const src = (bin instanceof Uint8Array) ? bin : new Uint8Array(bin);
        if(src.length < 12) throw new Error("WOZ: file too small");

        const sig   = u32le(src, 0);
        const isWoz1 = sig === WOZ_SIG1;
        const isWoz2 = sig === WOZ_SIG2;
        if(!isWoz1 && !isWoz2) throw new Error("WOZ: invalid signature");

        const medium = new WozMedium(name);
        let infoOffs = -1, infoSize = 0;
        let tmapOffs = -1, tmapSize = 0;
        let trksOffs = -1, trksSize = 0;

        // Walk the chunk list starting at byte 12 (after the 12-byte file header).
        let p = 12;
        while(p + 8 <= src.length) {
            const id       = u32le(src, p);
            const size     = u32le(src, p + 4);
            const dataOffs = p + 8;
            if(dataOffs + size > src.length) break;

            if     (id === CHUNK_INFO) { infoOffs = dataOffs; infoSize = size; }
            else if(id === CHUNK_TMAP) { tmapOffs = dataOffs; tmapSize = size; }
            else if(id === CHUNK_TRKS) { trksOffs = dataOffs; trksSize = size; }

            p = dataOffs + size;
        }

        if(infoOffs < 0 || tmapOffs < 0 || trksOffs < 0)
            throw new Error("WOZ: missing required chunk (INFO/TMAP/TRKS)");

        // --- INFO chunk ---
        medium.info = {
            version:        src[infoOffs + 0],
            disk_type:      src[infoOffs + 1],  // 1 = 5.25", 2 = 3.5"
            write_protected: src[infoOffs + 2] !== 0,
            synchronized:   src[infoOffs + 3] !== 0,
            cleaned:        src[infoOffs + 4] !== 0
        };
        if(medium.info.disk_type !== 1)
            throw new Error("WOZ: only 5.25\" disk images are supported");

        // --- TMAP chunk (160 bytes, identical layout for WOZ1 and WOZ2 5.25") ---
        if(tmapSize < 160) throw new Error("WOZ: TMAP chunk too small");
        medium.tmap.set(src.subarray(tmapOffs, tmapOffs + 160));

        // --- TRKS chunk ---
        if(isWoz1) {
            // WOZ1: each track occupies a fixed 6656-byte slot.
            // Layout per slot: 6646 bytes of bit data, then bytesUsed (u16), bitCount (u16).
            let q = trksOffs;
            for(let i = 0; i < 35 && q + 6656 <= trksOffs + trksSize; i++, q += 6656) {
                const bytesUsed = u16le(src, q + 6646);
                const bitCount  = u16le(src, q + 6648);
                if(bytesUsed === 0 || bitCount === 0) {
                    medium.tracks[i] = null;
                    continue;
                }
                medium.tracks[i] = new WozTrack(src.slice(q, q + bytesUsed), bitCount);
            }
        } else {
            // WOZ2: TRKS chunk opens with up to 160 × 8-byte TRK descriptors.
            // Each descriptor: startBlock (u16), blockCount (u16), bitCount (u32).
            // startBlock * 512 is a file-absolute byte offset.
            for(let i = 0; i < 160; i++) {
                const d = trksOffs + i * 8;
                if(d + 8 > trksOffs + trksSize) break;

                const startBlock = u16le(src, d + 0);
                const blockCount = u16le(src, d + 2);
                const bitCount   = u32le(src, d + 4);

                if(startBlock === 0 || blockCount === 0 || bitCount === 0) {
                    medium.tracks[i] = null;
                    continue;
                }

                const byteOffs  = startBlock * 512;
                const byteLen   = blockCount * 512;
                if(byteOffs + byteLen > src.length) {
                    medium.tracks[i] = null;
                    continue;
                }

                const bytesUsed = (bitCount + 7) >> 3;
                medium.tracks[i] = new WozTrack(src.slice(byteOffs, byteOffs + bytesUsed), bitCount);
            }
        }

        return medium;
    }
}

// ---------------------------------------------------------------------------
// Disk – one physical drive: head position, motor state, mounted medium
// ---------------------------------------------------------------------------
class Disk
{
    constructor(num, led_cb) {
        this.num    = num;
        this.led_cb = led_cb;

        this.name          = "";
        this.write_protect = false;
        this.motor_on      = false;
        this.medium        = null;

        // Stepper state
        this.phase_num_last = 0;
        this.head_pos       = 0;  // 0..139 quarter-track positions
    }

    read() {
        if(!this.medium) return 0;
        this.medium.set_head_pos(this.head_pos);
        return this.medium.read_byte();
    }

    // Advance the stepper motor on each phase-ON event.
    // set_phase() is called only for phase-ON soft-switch accesses (odd ops);
    // phase-OFF events (even ops) are ignored by select(), so each call here
    // represents one half-track step = 2 quarter-track units.
    //
    // The phase number is 0..3 (4-phase stepper, wraps).  A delta of +1 or -1
    // means the adjacent coil was energised — step in that direction.  A delta
    // of magnitude > 2 means the phase counter wrapped (e.g. 3→0 = +1 forward,
    // 0→3 = -1 backward); the threshold of 2 correctly identifies these cases.
    set_phase(phase_num) {
        const delta = phase_num - this.phase_num_last;
        this.phase_num_last = phase_num;

        const step = (delta < -2) ? 1 : (delta > 2) ? -1 : delta;
        this.head_pos = Math.max(0, Math.min(139, this.head_pos + step * 2));

        if(this.medium) this.medium.set_head_pos(this.head_pos);
    }

    set_led(state) {
        this.motor_on = (state !== 0);
        this.led_cb(this.num, this.motor_on);
    }

    mount_medium(name, medium) {
        this.name   = name;
        this.medium = medium;
        this.write_protect = (medium && medium.info) ? !!medium.info.write_protected : false;
        if(this.medium) {
            this.medium.set_head_pos(this.head_pos);
            this.medium.reset_rotation();
        }
    }

    reset() {
        this.motor_on      = false;
        this.phase_num_last = 0;
        this.head_pos       = 0;
        if(this.medium) {
            this.medium.set_head_pos(0);
            this.medium.reset_rotation();
        }
        this.led_cb(this.num, false);
    }
}

// ---------------------------------------------------------------------------
// Floppy525 – Disk II controller card emulation (slot 6 by default)
// ---------------------------------------------------------------------------
export class Floppy525
{
    constructor(slot, memory, led_cb) {
        this._slot    = slot & 0x07;
        this._mem     = memory;
        this._led_cb  = led_cb;            // cb(driveNum: 0|1, state: bool)

        // Soft-switch address ranges for the selected slot:
        //   $C0x0-$C0xF  drive select / data  (x = 8 + slot)
        //   $Cs00-$CsFF  controller ROM       (s = slot)
        this._addr_sel = 0xc080 | (this._slot << 4);  // e.g. $C0E0 for slot 6
        this._addr_io  = 0xc000 | (this._slot << 8);  // e.g. $C600 for slot 6

        this._write_disk = false;

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));

        this._disks       = [new Disk(0, led_cb), new Disk(1, led_cb)];
        this._active_disk = this._disks[0];
    }

    // -----------------------------------------------------------------------
    // Memory hooks
    // -----------------------------------------------------------------------
    read(addr) {
        if((addr & 0xf800) !== 0xc000) return undefined;

        if((addr & 0xfff0) === this._addr_sel)
            return this.select(addr & 0x000f, false);

        if((addr & 0xff00) === this._addr_io)
            return disk16_p5_rom_341_0027[addr & 0xff];

        return undefined;
    }

    write(addr, val) {
        if((addr & 0xf800) !== 0xc000) return undefined;

        if((addr & 0xfff0) === this._addr_sel)
            return this.select(addr & 0x000f, true);

        if((addr & 0xff00) === this._addr_io)
            return 0;  // writes to ROM space are silently consumed

        return undefined;
    }

    // -----------------------------------------------------------------------
    // Soft-switch dispatcher  (Disk II ref manual p.6-2)
    // -----------------------------------------------------------------------
    select(op, io_write) {
        switch(op) {
            case 0x08:  // Q0..Q3 off / motor off
                this._disks[0].set_led(false);
                this._disks[1].set_led(false);
                break;

            case 0x09:  // motor on (selected drive)
                this._active_disk.set_led(true);
                break;

            case 0x0a:  // engage drive 1
                this._disks[1].set_led(false);
                this._active_disk = this._disks[0];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;

            case 0x0b:  // engage drive 2
                this._disks[0].set_led(false);
                this._active_disk = this._disks[1];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;

            case 0x0c:  // Q6L — data strobe; read returns the data latch
                if(!io_write) return this._active_disk.read();
                break;

            case 0x0d:  // Q6H — latch data (write-mode data byte; ignored for now)
                break;

            case 0x0e:  // Q7L — latch is input (read mode)
            case 0x0f:  // Q7H — latch is output (write mode)
                this._write_disk = (op & 0x01) !== 0;
                break;

            default:    // 0x00-0x07 — phase magnet control
                // Only odd addresses energise a phase; even addresses de-energise
                // (the head only steps on a rising edge, so we ignore de-energise).
                if(op & 0x01) this._active_disk.set_phase((op >> 1) & 0x03);
                break;
        }
        return 0;
    }

    // -----------------------------------------------------------------------
    // Disk image loaders
    // -----------------------------------------------------------------------

    // Load a standard 140 KB DSK/PO/DO image.
    load_disk(num, name, bin) {
        console.log(`loading disk ${num + 1}: ${name}`);
        if(bin.byteLength !== 143360) {
            console.log(`error: invalid disk image size ${bin.byteLength} (expected 143360)`);
            return false;
        }
        const src    = new Uint8Array(bin);
        const medium = new DskMedium(name, src, this.sector_62encode.bind(this));
        this._disks[num].mount_medium(name, medium);
        return true;
    }

    // Load a WOZ 1 or WOZ 2 image.
    load_woz(num, name, bin) {
        console.log(`loading woz disk ${num + 1}: ${name}`);
        try {
            const medium = WozMedium.fromWoz(name, bin);
            this._disks[num].mount_medium(name, medium);
            return true;
        } catch(err) {
            console.log("error loading WOZ:", err.message);
            return false;
        }
    }

    // Auto-detect format from the file signature and dispatch accordingly.
    load_image(num, name, bin) {
        // Normalise to Uint8Array so the signature read is always safe,
        // whether the caller passes an ArrayBuffer or a Uint8Array.
        const sigBytes = (bin instanceof Uint8Array) ? bin : new Uint8Array(bin);
        if(sigBytes.length < 4) return false;

        const sig = u32le(sigBytes, 0);
        if(sig === WOZ_SIG1 || sig === WOZ_SIG2)
            return this.load_woz(num, name, bin);

        return this.load_disk(num, name, bin);
    }

    // -----------------------------------------------------------------------
    // 6-and-2 sector encoder for DSK images
    // -----------------------------------------------------------------------
    sector_62encode(src, trk, sec_ni) {
        // Address field prologue + gap
        let res = [0xff,0x3f,0xcf,0xf3,0xfc, 0xff,0x3f,0xcf,0xf3,0xfc,
                   0xff,0x3f,0xcf,0xf3,0xfc, 0xff,0x3f,0xcf,0xf3,0xfc];

        const vol  = 0xfe;
        const sec  = sec_int[sec_ni];
        const csum = vol ^ trk ^ sec;

        res = res.concat([0xd5, 0xaa, 0x96]);
        res = res.concat([(vol  >> 1) | 0xaa,  vol | 0xaa]);
        res = res.concat([(trk  >> 1) | 0xaa,  trk | 0xaa]);
        res = res.concat([(sec  >> 1) | 0xaa,  sec | 0xaa]);
        res = res.concat([(csum >> 1) | 0xaa, csum | 0xaa]);
        res = res.concat([0xde, 0xaa, 0xeb]);

        // Inter-field gap
        res = res.concat([0xff,0x3f,0xcf,0xf3,0xfc, 0xff,0x3f,0xcf,0xf3,0xfc]);

        // Data field
        res = res.concat([0xd5, 0xaa, 0xad]);

        const data62 = [];
        const offs   = (trk << 12) | (sec_ni << 8);
        for(let i = 255, i2 = 83; i >= 0; i--, i2 = i % 86) {
            const val   = src[i + offs];
            data62[i + 86] = val >> 2;
            data62[i2]     = (data62[i2] << 2) | ((val & 0x01) << 1) | ((val & 0x02) >> 1);
        }

        let last_val = 0;
        for(let i = 0; i < 342; i++) {
            const val = data62[i];
            res.push(write_62[val ^ last_val]);
            last_val = val;
        }
        res.push(write_62[last_val]);
        res = res.concat([0xde, 0xaa, 0xeb]);

        return res;
    }

    reset() {
        this._disks[0].reset();
        this._disks[1].reset();
        this._active_disk = this._disks[0];
        this._write_disk  = false;
    }
}
