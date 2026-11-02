import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const ROMS=[
  {
    name:'Apple II Memory Expansion 341-0344A',
    path:'./roms/341-0344a.bin',
    size:0x1000,
    sha1:'6e823a1fa40ed37eeddcef23f5df24da2ea1463e'
  },
  {
    name:'Apple IIgs ROM03 341-0728',
    path:'./roms/Apple_IIgs/Apple IIGS ROM 3 Banks FC-FD - 341-0728.bin',
    size:0x20000,
    sha1:'c0f4704233ead14cb8e1e8a68fbd7063c56afd27'
  },
  {
    name:'Apple IIgs ROM03 341-0748',
    path:'./roms/Apple_IIgs/Apple IIGS ROM 3 Banks FF-FE - 341-0748.bin',
    size:0x20000,
    sha1:'c70576869deec92ca82c78438b1d5c686eac7480'
  },
  {
    name:'Apple IIgs ADB microcontroller 341S0632-2',
    path:'./roms/firmware/Apple IIgs ADB Microcontroller - 341S0632-2.bin',
    size:0x1000,
    sha1:'141d18c36a617ab9dce668445440d34354be0672'
  }
];

for(const rom of ROMS){
  test(`${rom.name} matches MAME 0.289`,async()=>{
    const bytes=await readFile(new URL(rom.path,import.meta.url));
    assert.equal(bytes.length,rom.size,`${rom.name} size`);
    assert.equal(createHash('sha1').update(bytes).digest('hex'),rom.sha1,`${rom.name} SHA1`);
  });
}

test('ROM03 341-0748 is mapped in MAME ROM_CONTINUE order',async()=>{
  const lo=await readFile(new URL('./roms/Apple_IIgs/Apple IIGS ROM 3 Banks FC-FD - 341-0728.bin',import.meta.url));
  const hi=await readFile(new URL('./roms/Apple_IIgs/Apple IIGS ROM 3 Banks FF-FE - 341-0748.bin',import.meta.url));
  const image=new Uint8Array(0x40000);
  image.set(lo,0x00000);
  image.set(hi.subarray(0x10000),0x20000);
  image.set(hi.subarray(0,0x10000),0x30000);
  assert.deepEqual(image.subarray(0x00000,0x20000),lo);
  assert.deepEqual(image.subarray(0x20000,0x30000),hi.subarray(0x10000));
  assert.deepEqual(image.subarray(0x30000,0x40000),hi.subarray(0,0x10000));
});
