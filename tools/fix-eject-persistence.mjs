import fs from 'node:fs';

function replace(path, oldText, newText, label) {
  let s=fs.readFileSync(path,'utf8');
  if(!s.includes(oldText)) throw new Error(`${label} not found in ${path}`);
  s=s.replace(oldText,newText);
  fs.writeFileSync(path,s);
}

replace('computer/appleii/iigs_storage_registry.js',
`function eject(id){
  const ep=endpoint(id),b=board();if(!ep||!b)return false;
  if(ep.controller==='iigs35')b.memory?.floppy35Drives?.[ep.index]?.eject();
  else if(ep.controller==='disk2'){
    const disk=b.floppy525?._disks?.[ep.index];if(disk){disk.medium=null;disk.name='';}
  }else b.prodosBlock?.eject(ep.index);
  delete physicalMedia()[ep.id];
  window.dispatchEvent(new CustomEvent('iigs-storage-changed',{detail:{id:ep.id,action:'eject'}}));
  return true;
}`,
`async function eject(id){
  const ep=endpoint(id),b=board();if(!ep||!b)return false;
  if(ep.controller==='iigs35')b.memory?.floppy35Drives?.[ep.index]?.eject();
  else if(ep.controller==='disk2'){
    const disk=b.floppy525?._disks?.[ep.index];if(disk){disk.medium=null;disk.name='';}
  }else b.prodosBlock?.eject(ep.index);
  delete physicalMedia()[ep.id];
  candidates.delete(ep.persistenceId);
  // Physical eject also clears the saved mount. Otherwise Keep mounted can
  // silently restore an image the user explicitly ejected.
  await setKeep(ep.persistenceId,false);
  window.dispatchEvent(new CustomEvent('iigs-storage-changed',{detail:{id:ep.id,action:'eject'}}));
  return true;
}`,'registry eject');

replace('computer/appleii/unified_drive_manager.js',
"    pane.addEventListener('click',event=>{",
"    pane.addEventListener('click',async event=>{",'drive click handler');
replace('computer/appleii/unified_drive_manager.js',
"      if(button.hasAttribute('data-storage-eject')){svc.eject(id);sync();return;}",
"      if(button.hasAttribute('data-storage-eject')){await svc.eject(id);sync();return;}",'drive eject handler');

replace('computer/appleii/controls-menu.js',
"storage:'./iigs_storage_registry.js?v=20261007-physical2'",
"storage:'./iigs_storage_registry.js?v=20261017-eject-clean1'",'storage cache key');
replace('computer/appleii/controls-menu.js',
"drive:'./unified_drive_manager.js?v=20261007-drive-manager7'",
"drive:'./unified_drive_manager.js?v=20261017-eject-clean1'",'drive cache key');
replace('computer/appleii/index.html',
'./controls-menu.js?v=20261017-slotbus3',
'./controls-menu.js?v=20261017-eject-clean1','controls-menu cache key');
