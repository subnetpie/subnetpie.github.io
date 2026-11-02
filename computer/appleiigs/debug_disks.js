import {exportHardDrive} from "./disk_export.js?v=20260930-disk-save";
// Editing workspaces are snapshots. Never write through to mounted/persistent media.
export function createDiskWorkspaces(board) {
 const floppies=new Map(),workspaces=new Map();let serial=0;
 const load=board.floppy525.load_image;
 board.floppy525.load_image=function(drive,name,bytes,options={}) {
  const ok=load.call(this,drive,name,bytes,options);
  if(ok)floppies.set(drive,{medium:this._disks[drive].medium,name,format:options.format||(/\.nib$/i.test(name)?'nib':'dsk'),data:new Uint8Array(bytes).slice()});
  return ok;
 };
 const number=(value,min,max)=>{if(!Number.isInteger(value)||value<min||value>max)throw Error(`Expected integer ${min}–${max}`);return value;};
 const byteArray=value=>{if(!Array.isArray(value)||!value.length||value.length>4096||value.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('Expected 1–4096 byte values');return Uint8Array.from(value);};
 const get=id=>{const w=workspaces.get(id);if(!w)throw Error('Unknown disk workspace');return w;};
 const info=w=>({workspace:w.id,name:w.name,format:w.format,length:w.data.length,revision:w.revision,modified:w.undo.length>0,undoCount:w.undo.length});
 function open({device}) {
  if(workspaces.size>=2)throw Error('Close an editing workspace before opening another (limit 2).');
  const match=/^(smartport|iigs35|disk2):d([1-4])$/.exec(device||'');if(!match)throw Error('Use a physical device ID such as disk2:d1');
  const [,type,unit]=match,index=Number(unit)-1;let data,name,format;
  if(type==='smartport') {const disk=board.prodosBlock.drives[index];if(!disk?.image||disk.physical==='35')throw Error('No hard disk mounted');data=disk.image;name=disk.name;format='po';}
  if(type==='iigs35') {const media=board.memory.floppy35Drives?.[index]?.media;if(!media?.data)throw Error('No 3.5-inch disk mounted');data=media.data;name=media.name;format='po';}
  if(type==='disk2') {
   const saved=floppies.get(index),disk=board.floppy525._disks[index];
   if(!saved||saved.medium!==disk?.medium)throw Error('Reinsert this floppy to capture its source bytes for editing.');
   if(saved.format!=='dsk'||saved.data.length!==143360)throw Error('Sector editing supports DSK/DO/PO/2MG; WOZ and NIB are not supported.');
   ({data,name}=saved);format='dsk';
  }
  if(data.length>32*1024*1024)throw Error('Disk exceeds 32 MB workspace limit');
  const w={id:'disk-'+(++serial),name:name.split(/[\\/]/).pop(),format,data:data.slice(),revision:0,undo:[]};workspaces.set(w.id,w);return info(w);
 }
 return {
  execute(method,args={}) {
   if(method==='open_disk_workspace')return open(args);
   if(method==='list_disk_workspaces')return {workspaces:[...workspaces.values()].map(info)};
   const w=get(args.workspace);
   if(method==='close_disk_workspace'){workspaces.delete(w.id);return {closed:w.id};}
   if(method==='read_disk') {
    const offset=number(args.offset??0,0,w.data.length-1),length=number(args.length??256,1,4096);
    if(offset+length>w.data.length)throw Error('Read exceeds disk');return {...info(w),offset,bytes:Array.from(w.data.subarray(offset,offset+length))};
   }
   if(method==='patch_disk') {
    if(args.revision!==w.revision)throw Error('Workspace revision changed; read again before patching.');
    const offset=number(args.offset,0,w.data.length-1),expected=byteArray(args.expected),replacement=byteArray(args.bytes);
    if(expected.length!==replacement.length||offset+expected.length>w.data.length)throw Error('Patch length mismatch or out of bounds');
    if(!expected.every((v,i)=>w.data[offset+i]===v))throw Error('Original bytes do not match; no changes applied.');
    if(w.undo.length>=16)throw Error('Undo limit reached (16 patches); download and reopen the edited disk to continue.');
    w.undo.push({offset,before:expected,after:replacement});w.data.set(replacement,offset);w.revision++;return info(w);
   }
   if(method==='undo_disk_patch') {
    if(args.revision!==w.revision)throw Error('Workspace revision changed');const patch=w.undo.pop();if(!patch)throw Error('Nothing to undo');w.data.set(patch.before,patch.offset);w.revision++;return info(w);
   }
   throw Error('Unknown disk operation');
  },
  snapshot(id) {
   const w=get(id);
   if(w.format==='po' && /\.(2mg|2img)$/i.test(w.name)){
    const file=exportHardDrive({prodosBlock:{drives:[{image:w.data,name:w.name,blockCount:w.data.length/512}]}},0);
    return {...info(w),data:file.data,name:file.name.replace('-saved.2mg','-modified.2mg')};
   }
   return {...info(w),data:w.data.slice(),name:w.name.replace(/\.[^.]+$/,'')+'-modified.'+w.format};
  }
 };
}
