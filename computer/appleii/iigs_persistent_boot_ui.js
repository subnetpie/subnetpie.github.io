const SETTINGS='subnetpie.apple2.iigs.persistentBoot.v1';
const drives=[
  ['s5d1','Slot 5 · 3.5-inch Drive 1'],['s5d2','Slot 5 · 3.5-inch Drive 2'],
  ['s6d1','Slot 6 · 5.25-inch Drive 1'],['s6d2','Slot 6 · 5.25-inch Drive 2'],
  ['s7d1','Slot 7 · SmartPort Drive 1'],['s7d2','Slot 7 · SmartPort Drive 2'],
  ['s7d3','Slot 7 · SmartPort Drive 3'],['s7d4','Slot 7 · SmartPort Drive 4']
];
function read(){try{const v=JSON.parse(localStorage.getItem(SETTINGS)||'{}');return {boot:v.boot||'auto',keep:v.keep&&typeof v.keep==='object'?v.keep:{}};}catch(_){return {boot:'auto',keep:{}};}}
function write(v){try{localStorage.setItem(SETTINGS,JSON.stringify(v));}catch(_){}}
function install(){
  const dialog=document.getElementById('iigsConfigurationDialog');
  if(!dialog||dialog.querySelector('#iigsPersistentDriveList'))return;
  const section=dialog.querySelector('.iigs-config-grid section:last-child')||dialog.querySelector('section:last-child');
  if(!section)return;
  const box=document.createElement('div');box.id='iigsPersistentDriveList';box.className='iigs-storage-map';
  const title=document.createElement('div');title.innerHTML='<b>Persistent drives</b><span>Restore mounted media after reload</span>';box.append(title);
  for(const [id,name] of drives){
    const row=document.createElement('label');row.style.cssText='display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px;background:#ecece8;border:1px solid #777';
    const text=document.createElement('span');text.textContent=name;text.style.textAlign='left';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!read().keep[id];cb.dataset.persistentDrive=id;
    cb.addEventListener('change',()=>{const s=read();s.keep[id]=cb.checked;write(s);});
    row.append(text,cb);box.append(row);
  }
  section.append(box);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
