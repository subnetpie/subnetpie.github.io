(() => {
  const storage=()=>window.__appleIIgsStorage;

  function disableLegacyRouting(){
    const b=window.__appleIIgsBoard;
    if(!b?.iigsEnabled)return false;
    if(b.prodosBlock)b.prodosBlock._iigsDriveTargets=null;
    if(b.floppy525)b.floppy525._iigsDriveTargets=null;
    b.memory?.floppy35Drives?.forEach(d=>{d._iigsDriveTargets=null;});
    return true;
  }

  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}

  function render(){
    const dialog=document.getElementById('iigsConfigurationDialog'),svc=storage();
    if(!dialog||!svc)return false;

    for(const id of ['iigsDriveTarget0','iigsDriveTarget1']){
      const select=document.getElementById(id),row=select?.closest('.iigs-drive-route');
      if(row&&!row.hidden)row.hidden=true;
    }

    const storageSection=document.querySelector('#iigsSmartPortSummary')?.closest('section') || dialog.querySelector('.iigs-config-grid section:last-child');
    if(!storageSection)return false;
    setText(storageSection.querySelector('h3'),'Storage controllers and drives');
    setText(storageSection.querySelector('.iigs-config-note'),'Drives are physical endpoints exposed by the installed controller in each slot. Mount media from the Drives control panel.');

    const map=storageSection.querySelector('.iigs-storage-map');
    if(map){
      const html=svc.groups().map(g=>`<div><b>Slot ${g.slot} · ${g.label}</b><span>${g.devices.map(d=>`${d.label} — ${d.mediaLabel}`).join('<br>')}</span></div>`).join('');
      if(map.innerHTML!==html)map.innerHTML=html;
    }
    return true;
  }

  let uiTries=0,boardTries=0;
  const waitUI=()=>{if(render())return;if(++uiTries<100)setTimeout(waitUI,100);};
  const waitBoard=()=>{if(disableLegacyRouting())return;if(++boardTries<100)setTimeout(waitBoard,50);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{waitUI();waitBoard();},{once:true});
  else{waitUI();waitBoard();}
  window.addEventListener('iigs-storage-registry-ready',waitUI);
  window.addEventListener('iigs-storage-changed',render);
})();
