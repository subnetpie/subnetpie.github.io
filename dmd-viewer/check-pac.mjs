import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {parsePac} from './dist/pac.mjs';
// A synthetic key and original test fixtures, never a user's PAC or key.
const key=Buffer.from('00112233445566778899aabbccddeeff','hex');
const u16=n=>[n>>8,n&255],u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
const reverse=b=>{b=((b&240)>>4)|((b&15)<<4);b=((b&204)>>2)|((b&51)<<2);return ((b&170)>>1)|((b&85)<<1)};
function chunk(type,data,version){const zipped=gzipSync(data);const padded=Buffer.alloc(Math.ceil(zipped.length/16)*16);zipped.copy(padded);const aes=createCipheriv('aes-128-cbc',key,key);aes.setAutoPadding(false);const encrypted=Buffer.concat([aes.update(padded),aes.final()]);if(version===2)for(let i=0;i<encrypted.length;i+=4){const word=encrypted.slice(i,i+4);const copied=Buffer.from(word);for(let j=0;j<4;j++)encrypted[i+j]=reverse(copied[3-j])}return [...u16(type),...u32(encrypted.length),...encrypted]}
for(const version of [1,2]){const pac=Uint8Array.from([80,65,67,32,version,...chunk(1,readFileSync('dist/samples/test-palette.pal'),version),...chunk(2,readFileSync('dist/samples/test-pattern.vni'),version)]);const decoded=await parsePac(pac,key.toString('hex'));assert.equal(decoded.palettes[0].id,7);assert.equal(decoded.scenes[0].frames[0].data[1],2);assert.equal(decoded.scenes.length,1);await assert.rejects(()=>parsePac(pac,'00000000000000000000000000000000'),/key/);await assert.rejects(()=>parsePac(pac.slice(0,-1),key.toString('hex')),/Truncated/)}
await assert.rejects(()=>parsePac(Uint8Array.from([80,65,67,32,1]),''),/key/);
console.log('Passed: PAC v1/v2 AES-CBC, zero padding, gzip, VNI scenes, incorrect key, missing key, truncated chunks.');
