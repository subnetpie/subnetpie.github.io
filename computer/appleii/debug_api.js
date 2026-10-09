// Debug operations run between animation callbacks, never on the audio thread.
export function createDebugAPI({board,screen,pause,resume,isRunning,render,devices=()=>null,canControl=()=>false}) {
 const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(`Expected integer ${min}–${max}`);return v;};
 const status=()=>({machine:board.iigsEnabled?'iigs':'iie',running:isRunning(),cycles:board.cycles,registers:JSON.parse(JSON.stringify(board.cpu.register)),video:{shr:!!board.video_iigs?.isSuperHires(),newVideo:board.video_iigs?.newVideo,width:screen.width,height:screen.height},controlEnabled:canControl()});
 return Object.freeze({
  async execute(method,args={}) {
   if(['pause','resume','step','capture_trace'].includes(method)&&!canControl())throw Error('Enable remote execution control in the emulator first.');
   switch(method) {
    case 'get_status':return status();
    case 'get_devices':return {slots:board.iigsConfiguration?.slots||{},devices:devices()||{smartport:board.prodosBlock.drives.map((d,i)=>({drive:i+1,name:d.name,blocks:d.blockCount,writeProtected:d.writeProtected,dirty:d.dirty})),floppy525:board.floppy525._disks.map(d=>({name:d.name})),floppy35:board.memory.floppy35Drives?.map(d=>({name:d.media?.name||''}))}};
    case 'read_memory': {
     // Physical backing stores only: inspecting I/O must not acknowledge IRQs,
     // switch banks, read a disk byte, or change keyboard strobes.
     const regions=board.iigsEnabled?{ram:board.memory.ram,e0:board.memory.slowE0,e1:board.memory.slowE1,rom:board.memory.rom}:{main:board.legacyMemory._main,aux:board.legacyMemory._aux};
     const bytes=regions[args.region];if(!bytes)throw Error('Unavailable memory region. Use ram/e0/e1/rom for IIgs, main/aux for IIe.');
     const offset=integer(args.offset??0,0,bytes.length-1),length=integer(args.length??256,1,4096);
     if(offset+length>bytes.length)throw Error('Read exceeds memory region');
     return {region:args.region,offset,length,bytes:Array.from(bytes.subarray(offset,offset+length)),physical:true};
    }
    case 'capture_screen':render();return {mimeType:'image/png',data:screen.toDataURL('image/png').split(',')[1],width:screen.width,height:screen.height};
    case 'pause':pause();return status();
    case 'resume':if(!isRunning())resume();return status();
    case 'step':case 'capture_trace': {
     const count=integer(args.count??1,1,1000);pause();const trace=[];const start=performance.now();let completed=0;
     for(;completed<count;completed++) {
      if(performance.now()-start>50)break;
      if(method==='capture_trace')trace.push({cycles:board.cycles,registers:JSON.parse(JSON.stringify(board.cpu.register))});
      // A one-cycle budget executes one instruction and advances all peripherals.
      board.clock(1);
     }
     render();return {requested:count,completed,...status(),...(method==='capture_trace'?{trace}:{})};
    }
    default:throw Error('Unknown debug operation');
   }
  }
 });
}
