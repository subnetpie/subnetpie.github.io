import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {extractDmdZip} from './dist/zip.mjs';
function crc32(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0}
const u16=n=>[n&255,n>>8&255],u32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24];
function zip(data,method=8){const name=Buffer.from('pin2dmd.pal'),body=method===8?deflateRawSync(data):data,crc=crc32(data);const local=[...u32(0x04034b50),...u16(20),...u16(0),...u16(method),0,0,0,0,...u32(crc),...u32(body.length),...u32(data.length),...u16(name.length),0,0,...name,...body];const dir=[...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(method),0,0,0,0,...u32(crc),...u32(body.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,...u32(0),...u32(0),...name];return Uint8Array.from([...local,...dir,...u32(0x06054b50),0,0,0,0,...u16(1),...u16(1),...u32(dir.length),...u32(local.length),0,0])}
const pal=readFileSync('dist/samples/test-palette.pal');
for(const method of [0,8]){const entries=await extractDmdZip(zip(pal,method));assert.deepEqual(entries[0].data,new Uint8Array(pal));assert.equal(entries[0].name,'pin2dmd.pal')}
const bad=zip(pal,0);bad[30+'pin2dmd.pal'.length]^=1;await assert.rejects(()=>extractDmdZip(bad),/checksum/);
await assert.rejects(()=>extractDmdZip(zip(pal).subarray(0,-1)),/supported ZIP/);
console.log('Passed: stored/deflated ZIP entries, CRC checks, and truncated ZIP rejection.');
