import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia} from './media.js';

const HZ=1021800;
const SHA='d292836cae9a5e3935b295a3f9c45f6b5c07162365c2c0369c68db89e0ca45e6';

function loadDisk() {
  let b64='';
  for(let i=1;i<=6;i++)
    b64 += readFileSync(new URL(`./test-support/drol-fixture.part${i}`, import.meta.url),'utf8').trim();
  const disk=gunzipSync(Buffer.from(b64,'base64'));
  assert.equal(disk.length,143360);
  assert.equal(createHash('sha256').update(disk).digest('hex'),SHA);
  return new Uint8Array(disk);
}

function hgrHash(m) {
  return createHash('sha1')
    .update(m.legacyMemory._main.subarray(0x2000,0x6000))
    .digest('hex').slice(0,12);
}

function textPreview(m) {
  const rows=[];
  for(let r=0;r<24;r++) {
    let s='';
    for(let c=0;c<40;c++) {
      const a=0x400+(r&7)*128+(r>>3)*40+c;
      const ch=m.legacyMemory._main[a]&0x7f;
      s += ch>=32&&ch<127 ? String.fromCharCode(ch) : ' ';
    }
    rows.push(s);
  }
  return rows.join('|');
}

test('Drol headless timing trace', {timeout:120000}, () => {
  const disk=loadDisk();
  const {board:m,pixels}=createMachine('iie');
  mountMedia(m,decodeMedia('Drol.dsk',disk),0);
  m.reset(true);

  let steps=0,cpuCycles=0;
  const hist=new Uint32Array(256);
  const orig=m.cpu.step.bind(m.cpu);
  m.cpu.step=()=>{
    const pc=m.cpu.register.pc&0xffff;
    hist[m.memory.read(pc)&0xff]++;
    const used=orig();
    steps++;
    cpuCycles+=used;
    return used;
  };

  console.log(`DROL_TRACE disk_sha256=${SHA} hz=${HZ}`);
  for(let sec=1;sec<=30;sec++) {
    const before=m.cycles;
    const beforeSteps=steps;
    const beforeCpu=cpuCycles;
    m.clock(HZ);
    const actual=m.cycles-before;
    const pc=m.cpu.register.pc&0xffff;
    const mode=m.io_manager._text_mode?'TEXT':
      (m.legacyMemory.dms_hires?(m.io_manager._double_hires?'DHGR':'HGR'):'LORES');
    const page=(m.legacyMemory.dms_page2&&!m.legacyMemory.dms_80store)?2:1;
    const pix=createHash('sha1').update(pixels).digest('hex').slice(0,12);
    console.log(
      `DROL_TRACE sec=${sec} requested=${HZ} actual=${actual.toFixed(3)}`+
      ` steps=${steps-beforeSteps} cpuCycles=${cpuCycles-beforeCpu}`+
      ` pc=$${pc.toString(16).padStart(4,'0')} mode=${mode} page=${page}`+
      ` hgr=${hgrHash(m)} pixels=${pix}`
    );
    if(sec%5===0) console.log(`DROL_TEXT sec=${sec} ${textPreview(m)}`);
  }

  const top=[...hist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,24)
    .map(([op,n])=>`$${op.toString(16).padStart(2,'0')}:${n}`).join(' ');
  console.log('DROL_OPCODES '+top);
  console.log(`DROL_TOTAL cycles=${m.cycles} steps=${steps} avgCyclesPerInstruction=${(cpuCycles/steps).toFixed(4)}`);
  assert.ok(steps>0);
});


test('Drol IIgs default-mode speed trace', {timeout:120000}, () => {
  const disk=loadDisk();
  const {board:m}=createMachine('iigs');
  mountMedia(m,decodeMedia('Drol.dsk',disk),0);
  m.reset(true);

  let steps=0,cpuCycles=0;
  const orig=m.cpu.step.bind(m.cpu);
  m.cpu.step=()=>{
    const used=orig();
    steps++;
    cpuCycles+=used;
    return used;
  };

  const MASTER_HZ=2800000;
  console.log(`DROL_IIGS start speed=$${m.memory.speed.toString(16).padStart(2,'0')} fast=${m.memory.isFastCpu()}`);
  for(let sec=1;sec<=12;sec++) {
    const before=m.cycles;
    const beforeSteps=steps;
    const beforeCpu=cpuCycles;
    m.clock(MASTER_HZ);
    const pc=m.cpu.register.pc&0xffff;
    console.log(
      `DROL_IIGS sec=${sec} actualMaster=${(m.cycles-before).toFixed(3)}`+
      ` steps=${steps-beforeSteps} cpuCycles=${cpuCycles-beforeCpu}`+
      ` pc=$${pc.toString(16).padStart(4,'0')}`+
      ` speed=$${m.memory.speed.toString(16).padStart(2,'0')}`+
      ` fast=${m.memory.isFastCpu()}`+
      ` mode=${m.io_manager._text_mode?'TEXT':(m.legacyMemory.dms_hires?'HGR':'LORES')}`
    );
  }
  assert.ok(steps>0);
});
