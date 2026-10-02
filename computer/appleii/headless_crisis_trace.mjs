#!/usr/bin/env node
// Headless Apple II / Disk II tracer. Usage:
// node headless_crisis_trace.mjs "/path/to/Crisis Mountain.dsk" [instructions]
import fs from "node:fs";
import path from "node:path";
import {Memory} from "./memory.js";
import {W65C02S} from "./w65c02s.js";
import {Floppy525} from "./FloppyWoz525.js";
import {rom_342_0304_cd} from "./rom/342-0304-cd.js";
import {rom_342_0303_ef} from "./rom/342-0303-ef.js";

const diskPath=process.argv[2];
if(!diskPath) throw new Error("usage: node headless_crisis_trace.mjs disk.dsk [instructions]");
const limit=Number(process.argv[3]||20_000_000);
const image=fs.readFileSync(diskPath);
if(image.length!==143360) throw new Error("expected 143360-byte DSK");

const mem=new Memory(rom_342_0304_cd,rom_342_0303_ef);
let cycles=0, instructions=0, currentPC=0;
const cpu=new W65C02S(mem);
const diskEvents=[], memoryEvents=[], pcHits=new Map();
const interesting=a => (a>=0xb600&&a<=0xb7ff)||(a>=0xbd00&&a<=0xbfff)||(a>=0xc0e0&&a<=0xc0ef);

mem.add_read_hook(addr=>{
  if(interesting(addr)) memoryEvents.push({i:instructions,c:cycles,pc:currentPC,t:"R",a:addr});
  return undefined;
});
mem.add_write_hook((addr,val)=>{
  if(interesting(addr)) memoryEvents.push({i:instructions,c:cycles,pc:currentPC,t:"W",a:addr,v:val});
  return undefined;
});

const floppy=new Floppy525(6,mem,()=>{},()=>cycles);
floppy.setTrace(e=>diskEvents.push({i:instructions,c:cycles,pc:currentPC,...e}));
if(!floppy.load_image(0,path.basename(diskPath),image,{volume:254,format:"dsk"}))
  throw new Error("Disk II rejected image");

mem.reset();
cpu.reset();
// Enter the slot-6 Disk II boot ROM exactly where Apple II firmware dispatches it.
cpu.register.pc=0xc600;

while(instructions<limit) {
  currentPC=cpu.register.pc;
  if((currentPC>=0xb600&&currentPC<=0xb7ff)||(currentPC>=0xbd00&&currentPC<=0xbfff))
    pcHits.set(currentPC,(pcHits.get(currentPC)||0)+1);
  const used=cpu.step();
  if(used<0) break;
  cycles+=used;
  instructions++;
}

const outDir=path.resolve(process.cwd(),"crisis-trace");
fs.mkdirSync(outDir,{recursive:true});
const snap=(start,end,name)=>{
  const b=Buffer.alloc(end-start);
  for(let a=start;a<end;a++) b[a-start]=mem.read(a);
  fs.writeFileSync(path.join(outDir,name),b);
};
snap(0,0x10000,"crisis-boot-ram.bin");
snap(0xb600,0xb800,"crisis-b6-b7.bin");
snap(0xbd00,0xc000,"crisis-bd00-bfff.bin");
fs.writeFileSync(path.join(outDir,"crisis-memory-rw.jsonl"),memoryEvents.map(x=>JSON.stringify(x)).join("\n")+"\n");
fs.writeFileSync(path.join(outDir,"crisis-disk-rw.jsonl"),diskEvents.map(x=>JSON.stringify(x)).join("\n")+"\n");
fs.writeFileSync(path.join(outDir,"crisis-pc-hits.json"),JSON.stringify(Object.fromEntries([...pcHits].map(([k,v])=>["$"+k.toString(16).padStart(4,"0"),v])),null,2));
fs.writeFileSync(path.join(outDir,"summary.json"),JSON.stringify({
 disk:path.basename(diskPath),instructions,cycles,pc:"$"+cpu.register.pc.toString(16).padStart(4,"0"),
 registers:{a:cpu.register.a,x:cpu.register.x,y:cpu.register.y,sp:cpu.register.sp,p:cpu.register.flag.value},
 memoryEvents:memoryEvents.length,diskEvents:diskEvents.length,interestingPCs:pcHits.size
},null,2));
console.log(JSON.stringify({outDir,instructions,cycles,pc:cpu.register.pc,memoryEvents:memoryEvents.length,diskEvents:diskEvents.length},null,2));
