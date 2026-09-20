import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROM_CONFIG } from './rom-manifest.js';
import { assembleRegions, verifyROM, crc32, readZip } from './rom-loader.js';
import { PolePosition } from './pole-position.js';
import { PolePositionWSG } from './polepos-wsg.js';
import { BoardScheduler } from './devices.js';
import { Namco06XX, Namco52XX, MB8843 } from '../../chips/namco.js';
import './polepos-voices.js';

const files=new Map();
for(const entry of ROM_CONFIG.files) files.set(entry.name,new Uint8Array(fs.readFileSync(new URL('./roms/'+entry.name,import.meta.url))));

test('MAME 0.289 ROM identities and big-endian CPU placement',async()=>{
  await Promise.all(ROM_CONFIG.files.map(e=>verifyROM(e,files.get(e.name))));
  const r=assembleRegions(files);
  assert.equal(r.sub1[0],files.get('pp3_2.8l')[0]);assert.equal(r.sub1[1],files.get('pp3_1.8m')[0]);
  assert.equal(r.sub2[0],files.get('pp3_6.4l')[0]);assert.equal(r.sub2[1],files.get('pp3_5.4m')[0]);
  assert.equal(r.sub1.slice(0x4000).some(Boolean),false);
  assert.equal(r.bigsprites.slice(0x6000,0x8000).some(Boolean),false);
  assert.equal(r.bigsprites[0x8000],files.get('pp1_18.5m')[0]);
  assert.equal(crc32(new TextEncoder().encode('123456789')),'cbf43926');
  await assert.rejects(()=>verifyROM(ROM_CONFIG.files[0],new Uint8Array(0x2000)),/CRC32/);
  await assert.rejects(()=>readZip(new Uint8Array(30)),/ZIP/);
});

test('06XX first edge, read stretch and level NMI use Pole Position master ticks',()=>{
  const scheduler=new BoardScheduler();const nmi=[];const cs=[];
  const bus=new Namco06XX({masterTicksPerZ80Cycle:8,z80CyclesPerDeviceClock:64,onHostNmi:()=>nmi.push(1),onHostNmiClear:()=>nmi.push(0)});
  bus.setScheduler(scheduler);bus.attachDevice(0,{chipSelect:v=>cs.push(v),rw(){},read:()=>0xa5});
  bus.controlWrite(0x31);scheduler.advanceTo(511);assert.equal(cs.at(-1),0);
  scheduler.advanceTo(512);assert.equal(cs.at(-1),1);assert.equal(nmi.at(-1),0);
  assert.equal(bus.dataRead(0),0xa5);scheduler.advanceTo(1536);assert.equal(nmi.at(-1),1);
  bus.controlWrite(0);assert.equal(nmi.at(-1),0);assert.equal(cs.at(-1),0);
});

test('eight-voice WSG, external custom selection and CLSON',()=>{
  const wsg=new PolePositionWSG(48000,new Uint8Array(256).fill(15));
  wsg.write(7*4+3,0xff);const samples=new Float32Array(32);wsg.render(samples);
  assert(samples.some(v=>v>0));wsg.write(7*4+35,8);wsg.render(samples);assert(samples.every(v=>v===0));
  wsg.write(7*4+35,0);wsg.render(samples,false);assert(samples.every(v=>v===0));
});

test('real ROM boot, coin/gas sequence, shared MCU devices, graphics and finite audio',()=>{
  const regions=assembleRegions(files);const core=PolePosition.create(null,regions);
  assert(core.n51.mcu instanceof MB8843);assert(core.n52 instanceof Namco52XX);
  assert.equal(core.frameCycles,50688);assert.equal(core.n52.readVoiceRom(0x2000),regions['52xx'][0x2000]);
  assert.equal(core.n52.mcu.readSI(),1);assert.equal(core.n53.mcu.readK(),0);
  const pixels=new Uint32Array(256*224), voices=new globalThis.PolePositionVoices(48000,regions.engine);
  let audioPeak=0;for(let i=0;i<1200;i++){
    if(i===600)core.setInput(core.MASK.coin,true);if(i===610)core.setInput(core.MASK.coin,false);
    if(i===650)core.setInput(core.MASK.accel,true);
    core.runFrame();const samples=new Int16Array(1584);voices.mixInto(samples,792,core);
    for(const v of samples)audioPeak=Math.max(audioPeak,Math.abs(v));
  }
  core.renderInto(pixels);assert(new Set(pixels).size>8);assert.equal(core.frameCount,1200);assert.deepEqual(core.unimpl,{});
  assert(audioPeak>0);assert(core.n52.cpu.getPC()>=0);assert(core.n54.cpu.getPC()>=0);
  core.reset();assert.equal(core.frameCount,0);assert(core.n51.isReset());assert(core.n53.isReset());assert(core.n52.isReset());assert(core.n54.isReset());
});
