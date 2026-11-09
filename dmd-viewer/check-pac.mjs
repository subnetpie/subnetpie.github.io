import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {parsePac,PAC_COMPATIBILITY_KEY} from './dist/pac.mjs';
// Original fixtures, never game assets or user-specific keys.
const customKey=Buffer.from('00112233445566778899aabbccddeeff','hex');
const u16=n=>[n>>8,n&255],u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
const reverse=b=>{b=((b&240)>>4)|((b&15)<<4);b=((b&204)>>2)|((b&51)<<2);return ((b&170)>>1)|((b&85)<<1)};
function chunk(type,data,version,key,pkcs7){const zipped=gzipSync(data);let payload=zipped;const aes=createCipheriv('aes-128-cbc',key,key);if(!pkcs7){payload=Buffer.alloc(Math.ceil(zipped.length/16)*16);zipped.copy(payload);aes.setAutoPadding(false)}const encrypted=Buffer.concat([aes.update(payload),aes.final()]);if(version===2)for(let i=0;i<encrypted.length;i+=4){const word=Buffer.from(encrypted.subarray(i,i+4));for(let j=0;j<4;j++)encrypted[i+j]=reverse(word[3-j])}return [...u16(type),...u32(encrypted.length),...encrypted]}
const pal=Buffer.concat([readFileSync('dist/samples/test-palette.pal'),Buffer.from([...u16(1),...u32(123),1,...u16(7),...u32(12)])]);
for(const version of [1,2])for(const pkcs7 of [false,true])for(const automatic of [false,true]){const key=automatic?Buffer.from(PAC_COMPATIBILITY_KEY,'hex'):customKey;const pac=Uint8Array.from([80,65,67,32,version,...chunk(1,pal,version,key,pkcs7),...chunk(2,readFileSync('dist/samples/test-pattern.vni'),version,key,pkcs7)]);const override=automatic?'':key.toString('hex');const decoded=await parsePac(pac,override);assert.equal(decoded.palettes[0].id,7);assert.equal(decoded.scenes[0].frames[0].data[1],2);assert.equal(decoded.scenes.length,1);assert.equal(decoded.scenes[0].mode,1);assert.equal(decoded.scenes[0].colors.length,4);await assert.rejects(()=>parsePac(pac,'00000000000000000000000000000000'),/key/);await assert.rejects(()=>parsePac(pac.slice(0,-1),override),/Truncated/)}
await assert.rejects(()=>parsePac(Uint8Array.from([80,65,67,32,1]),'invalid'),/key/);
console.log('Passed: PAC v1/v2, zero/PKCS#7 padding, automatic/custom keys, VNI palette/mode mapping, incorrect keys, and truncated chunks.');
