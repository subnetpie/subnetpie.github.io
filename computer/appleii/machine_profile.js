const PROFILE_KEY='subnetpie.apple2.machineProfile.v1';
const SLOT_KEY='subnetpie.apple2.iigs.configuration.v1';
const SLOT4_KEY='subnetpie.apple2.iigs.slot4.v1';
const BOOT_KEY='subnetpie.apple2.iigs.persistentBoot.v1';

export const DRIVE_IDS=Object.freeze(['s5d1','s5d2','s6d1','s6d2','s7d1','s7d2','s7d3','s7d4']);

export function defaultMachineProfile(){
  return {
    version:1,
    id:'default-iigs',
    name:'Apple IIgs',
    machine:'iigs',
    rom:'rom03',
    revision:0,
    slots:{1:'empty',2:'empty',3:'empty',4:'mouse',5:'iigs35',6:'disk2',7:'smartport'},
    boot:{mode:'auto',driveId:null},
    drives:Object.fromEntries(DRIVE_IDS.map(id=>[id,{persistent:false,disk:null}])),
    updatedAt:null
  };
}

function safeParse(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}
}

export function migrateLegacyProfile(){
  const out=defaultMachineProfile();
  const slot=safeParse(SLOT_KEY);
  if(slot?.slots&&typeof slot.slots==='object'){
    for(const n of [1,2,3,4,5,6,7])if(typeof slot.slots[n]==='string')out.slots[n]=slot.slots[n];
  }
  try{
    const slot4=localStorage.getItem(SLOT4_KEY);
    if(['mouse','mockingboard','none'].includes(slot4))out.slots[4]=slot4;
  }catch(_){}
  const boot=safeParse(BOOT_KEY)||{};
  const driveId=DRIVE_IDS.includes(boot.boot)?boot.boot:null;
  out.boot={mode:driveId?'drive':'auto',driveId};
  const keep=boot.keep&&typeof boot.keep==='object'?boot.keep:{};
  for(const id of DRIVE_IDS)out.drives[id].persistent=!!keep[id];
  out.updatedAt=new Date().toISOString();
  return out;
}

export function loadMachineProfile(){
  const saved=safeParse(PROFILE_KEY);
  if(saved?.version===1&&saved.machine){
    const base=defaultMachineProfile();
    return {
      ...base,...saved,
      slots:{...base.slots,...saved.slots},
      boot:{...base.boot,...saved.boot},
      drives:Object.fromEntries(DRIVE_IDS.map(id=>[id,{...base.drives[id],...(saved.drives?.[id]||{})}]))
    };
  }
  const migrated=migrateLegacyProfile();
  saveMachineProfile(migrated);
  return migrated;
}

export function saveMachineProfile(profile){
  const base=defaultMachineProfile();
  const normalized={
    ...base,...profile,
    version:1,
    slots:{...base.slots,...profile?.slots},
    boot:{...base.boot,...profile?.boot},
    drives:Object.fromEntries(DRIVE_IDS.map(id=>[id,{...base.drives[id],...(profile?.drives?.[id]||{})}])),
    updatedAt:new Date().toISOString()
  };
  try{localStorage.setItem(PROFILE_KEY,JSON.stringify(normalized));}catch(_){}
  return normalized;
}

export function syncLegacySettingsFromProfile(profile){
  const p=saveMachineProfile(profile);
  try{
    const existing=safeParse(SLOT_KEY)||{};
    localStorage.setItem(SLOT_KEY,JSON.stringify({...existing,version:1,slots:{...p.slots}}));
    localStorage.setItem(SLOT4_KEY,['mouse','mockingboard','none'].includes(p.slots[4])?p.slots[4]:'none');
    const keep={};for(const id of DRIVE_IDS)keep[id]=!!p.drives[id]?.persistent;
    localStorage.setItem(BOOT_KEY,JSON.stringify({boot:p.boot.mode==='drive'&&DRIVE_IDS.includes(p.boot.driveId)?p.boot.driveId:'auto',keep}));
  }catch(_){}
  return p;
}

export function setDriveDisk(profile,driveId,disk){
  if(!DRIVE_IDS.includes(driveId))throw new Error('Invalid drive id');
  const next=structuredClone(profile||loadMachineProfile());
  next.drives[driveId]={...next.drives[driveId],disk:disk||null};
  return saveMachineProfile(next);
}
