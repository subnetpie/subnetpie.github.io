const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..');
(async()=>{
for(const name of ['galaga','bosco','scramble','pacman','mspacman']){
 const errors=[];const canvas={width:256,height:256,style:{},addEventListener(){},getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},clearRect(){},fillRect(){},beginPath(){},arc(){},stroke(){},fill(){}}}};
 const doc={readyState:'loading',addEventListener(){},querySelectorAll(){return []},getElementById(id){return id==='gameCanvas'?canvas:null}};
 const win={addEventListener(){},innerWidth:800,innerHeight:600};
 const context=vm.createContext({console:{log(){},warn(){},error(...x){errors.push(x.map(String).join(' '))}},window:win,document:doc,performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},navigator:{maxTouchPoints:0},URL,Blob,fetch:async url=>{
 const file=String(url).split('/').pop();const p=root+'/arcade/'+name+'/'+file;
 try{const b=fs.readFileSync(p);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}catch{return {ok:false,status:404}}
 }});
 const core=new vm.SourceTextModule(fs.readFileSync(root+'/cpu/z80.js','utf8'),{context});
 let s=fs.readFileSync(root+'/arcade/'+name+'/script.js','utf8');
 if(name==='scramble')s=s.split('// ── Boot')[0];
 const klass=name==='galaga'?'GalagaEmulator':name==='bosco'?'BoscoEmulator':name==='scramble'?'ScrambleEmu':name==='mspacman'?'jsMsPacMan':'jspacman';
 s+='\nglobalThis.Emu='+klass+';';if(['galaga','bosco'].includes(name))s+='globalThis.Config=EmulatorConfig;';
 const mod=new vm.SourceTextModule(s,{context});await mod.link(()=>core);await mod.evaluate();
 let emu;
 if(['galaga','bosco'].includes(name)){
  emu=new context.Emu(new context.Config());const loaded=await emu.loadRoms();assert(!loaded.criticalMissing,JSON.stringify(loaded));emu.reset();
  for(let i=0;i<10;i++)emu.step();
 }else if(name==='scramble'){
  emu=new context.Emu('gameCanvas');await emu.init();emu.running=true;for(let i=1;i<=10;i++)emu.stepFrame(i*17);
 }else{
  emu=new context.Emu();if(name==='mspacman')await emu._coldBoot();else {await emu.loadROMS();emu.cpu.reset();}
  for(let i=0;i<50000;i++)emu.cpu.step();
  for(const fn of ['insertCoin1','start1Player'])assert.equal(typeof win[fn],'function');
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS',name,{pc:(emu.cpu||emu.mainCpu).PC,cycles:(emu.cpu||emu.mainCpu).cycles});
}
})().catch(e=>{console.error(e);process.exit(1)});
