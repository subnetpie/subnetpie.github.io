(() => {
  const storage=()=>window.__appleIIgsStorage;

  function render(){
    const dialog=document.getElementById('iigsConfigurationDialog'),svc=storage();
    if(!dialog||!svc)return false;

    for(const id of ['iigsDriveTarget0','iigsDriveTarget1']){
      const select=document.getElementById(id),row=select?.closest('.iigs-drive-route');
      if(row)row.hidden=true;
    }

    const storageSection=document.querySelector('#iigsSmartPortSummary')?.closest('section') || dialog.querySelector('.iigs-config-grid section:last-child');
    if(!storageSection)return false;
    const heading=storageSection.querySelector('h3');if(heading)heading.textContent='Storage controllers and drives';
    const note=storageSection.querySelector('.iigs-config-note');
    if(note)note.textContent='Drives are physical endpoints exposed by the installed controller in each slot. Mount media from the Drives control panel.';

    const map=storageSection.querySelector('.iigs-storage-map');
    if(map){
      map.innerHTML=svc.groups().map(g=>`<div><b>Slot ${g.slot} · ${g.label}</b><span>${g.devices.map(d=>`${d.label} — ${d.mediaLabel}`).join('<br>')}</span></div>`).join('');
    }
    return true;
  }

  let tries=0;
  const wait=()=>{if(render())return;if(++tries<100)setTimeout(wait,100);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait,{once:true});else wait();
  window.addEventListener('iigs-storage-registry-ready',wait);
  new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true});
})();
