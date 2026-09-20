import { ROM_CONFIG } from './rom-manifest.js';

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
export async function verifyROM(entry, data) {
  if (data.length !== entry.size) throw new Error(`${entry.name}: expected ${entry.size} bytes, got ${data.length}`);
  if (crc32(data) !== entry.crc32) throw new Error(`${entry.name}: CRC32 mismatch (wrong ROM revision or corrupt file)`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  const sha1 = [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
  if (sha1 !== entry.sha1) throw new Error(`${entry.name}: SHA-1 mismatch`);
}
export function assembleRegions(files, config = ROM_CONFIG) {
  const regions = Object.fromEntries(Object.entries(config.regions).map(([name,size]) => [name,new Uint8Array(size)]));
  for (const entry of config.files) {
    const data = files.get(entry.name);
    if (!data) { if (entry.critical) throw new Error(`Missing ${entry.name}`); continue; }
    const target = regions[entry.target];
    if (data.length !== entry.size || entry.offset + (data.length - 1) * entry.stride >= target.length) throw new Error(`Invalid region placement: ${entry.name}`);
    for (let i = 0; i < data.length; i++) target[entry.offset + i * entry.stride] = data[i];
  }
  return regions;
}

// Read the central directory, supporting stored and deflated ZIPs (including
// entries using data descriptors). No filename is written to the filesystem.
export async function readZip(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  for (; end >= Math.max(0, data.length - 65557); end--) if (view.getUint32(end,true) === 0x06054b50) break;
  if (end < 0 || view.getUint32(end,true) !== 0x06054b50) throw new Error('Invalid ZIP directory');
  if (view.getUint16(end+4,true) || view.getUint16(end+6,true)) throw new Error('Split ZIPs are unsupported');
  const count = view.getUint16(end+10,true);
  let offset = view.getUint32(end+16,true), total = 0;
  const files = new Map();
  for (let n=0; n<count; n++) {
    if (view.getUint32(offset,true) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags=view.getUint16(offset+8,true), method=view.getUint16(offset+10,true);
    const packed=view.getUint32(offset+20,true), size=view.getUint32(offset+24,true);
    const nameLen=view.getUint16(offset+28,true), extra=view.getUint16(offset+30,true), comment=view.getUint16(offset+32,true);
    const local=view.getUint32(offset+42,true);
    const name=new TextDecoder().decode(data.subarray(offset+46,offset+46+nameLen)).split('/').pop();
    offset += 46+nameLen+extra+comment;
    if (!name) continue;
    total += size;
    if (flags & 1 || size > 8*1024*1024 || total > 32*1024*1024) throw new Error('Encrypted or oversized ZIP entry');
    if (view.getUint32(local,true)!==0x04034b50) throw new Error('Invalid ZIP local header');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if (start+packed>data.length) throw new Error('Truncated ZIP');
    let bytes=data.slice(start,start+packed);
    if (method === 8) {
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks=[]; let length=0;
      for (;;) { const {done,value}=await reader.read(); if(done)break; length+=value.length;
        if(length>size){await reader.cancel();throw new Error('ZIP expands beyond declared size');} chunks.push(value); }
      bytes=new Uint8Array(length);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    } else if (method !== 0) throw new Error(`Unsupported ZIP compression: ${method}`);
    if(bytes.length!==size)throw new Error(`Truncated ZIP entry: ${name}`);
    const expected=view.getUint32(offset-(46+nameLen+extra+comment)+16,true).toString(16).padStart(8,'0');
    if(crc32(bytes)!==expected)throw new Error(`ZIP checksum mismatch: ${name}`);
    files.set(name,bytes);
  }
  return files;
}

export class ROMLoader {
  constructor(config=ROM_CONFIG) { this.config=config; this.local=new Map(); }
  async addFiles(selected) {
    for(const file of selected) {
      if(file.size>32*1024*1024)throw new Error('Select individual arcade ROM ZIPs, not a complete ROM collection');
      if(/\.(mra|rom)$/i.test(file.name))throw new Error('Select the source ROM ZIPs named by the MRA. Flattened FPGA images need their exact MRA mapping.');
      const data=new Uint8Array(await file.arrayBuffer());
      if(/\.zip$/i.test(file.name))for(const [name,bytes] of await readZip(data))this.local.set(name,bytes);
      else this.local.set(file.name,data);
    }
  }
  async load(report=()=>{}) {
    const validated=new Map(), errors=[];
    await Promise.all(this.config.files.map(async entry=>{
      try {
        let data=this.local.get(entry.name);
        // MiSTer sets can rename identical ROMs: identify by size and CRC.
        if(!data)data=[...this.local.values()].find(x=>x.length===entry.size && crc32(x)===entry.crc32);
        if(!data) {
          const response=await fetch(new URL(entry.name,new URL(this.config.baseUrl,import.meta.url)));
          if(!response.ok)throw new Error(`${entry.name}: HTTP ${response.status}`);
          data=new Uint8Array(await response.arrayBuffer());
        }
        await verifyROM(entry,data);validated.set(entry.name,data);report(`Verified ${validated.size}/${this.config.files.length} ROMs`);
      }catch(error){if(entry.critical)errors.push(error.message);}
    }));
    if(errors.length)throw new Error(errors.join('\n'));
    return assembleRegions(validated,this.config);
  }
}
