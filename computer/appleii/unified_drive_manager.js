(() => {
  if(new URLSearchParams(location.search).get('ui')!=='unified')return;

  const inputFor={0:'filedialogInsert',1:'filedialogInsert2',2:'filedialogInsert3',3:'filedialogInsert4'};
  const routeLabel={
    s5d1:'Slot 5 · 3.5-inch D1',s5d2:'Slot 5 · 3.5-inch D2',
    s6d1:'Slot 6 · 5.25-inch D1',s6d2:'Slot 6 · 5.25-inch D2',
    s7d1:'Slot 7 · SmartPort D1',s7d2:'Slot 7 · SmartPort D2',
    s7d3:'Slot 7 · SmartPort D3',s7d4:'Slot 7 · SmartPort D4'
  };
  const bootIds=['s5d1','s5d2','s6d1','s6d2','s7d1','s7d2','s7d3','s7d4'];
  const qs=(s,r=document)=>r.querySelector(s);
  const click=id=>{const e=document.getElementById(id);if(e){e.click();return true;}return false;};
  const board=()=>window.__appleIIgsBoard;
  const persistence=()=>window.__appleIIgsPersistence;

  function routeFor(drive){
    if(drive>=2)return 's7d'+(drive+1);
    const b=board();
    const block=b?.prodosBlock?.drives?.[drive];
    if(block?.image)return block.physical==='35'?'s5d'+(drive+1):'s7d'+(drive+1);
    const floppy=b?.floppy525?._disks?.[drive];
    if(floppy?.medium)return 's6d'+(drive+1);
    return null;
  }

  function mediaName(drive){
    const dom=document.getElementById('driveName'+drive)?.textContent?.trim();
    if(dom&&dom!=='Empty')return dom;
    const b=board();
    const block=b?.prodosBlock?.drives?.[drive];
    if(block?.image&&block.name)return block.name.split('/').pop();
    const floppy=b?.floppy525?._disks?.[drive];
    if(floppy?.medium&&floppy.name)return floppy.name.split('/').pop();
    return 'Empty';
  }

  function driveRow(drive){
    const n=drive+1;
    const label=drive>=2?'SmartPort D'+n:'Drive '+n;
    const boot=drive===0?'<button type="button" class="unified-drive-action" data-drive-boot="0">Load & Boot</button>':'';
    return `<article class="unified-drive-row" data-unified-drive="${drive}">
      <div class="unified-drive-summary">
        <span class="unified-drive-led" aria-hidden="true"></span>
        <div class="unified-drive-copy">
          <div class="unified-drive-title">${label}</div>
          <div class="unified-drive-file" ${drive<2?`id="unifiedDrive${drive}"`:''} data-drive-name>Empty</div>
          <div class="unified-drive-route" data-drive-route>${drive>=2?'Slot 7 · SmartPort D'+n:'Auto route'}</div>
        </div>
      </div>
      <div class="unified-drive-actions">
        ${boot}
        <button type="button" class="unified-drive-action" data-drive-insert="${drive}">Insert</button>
        <button type="button" class="unified-drive-action unified-drive-eject" data-drive-eject="${drive}">Eject</button>
        <button type="button" class="unified-drive-action unified-drive-more" data-drive-more="${drive}" aria-expanded="false">Options</button>
      </div>
      <div class="unified-drive-details" data-drive-details hidden>
        <label class="unified-setting-row"><span>Write protect</span><input type="checkbox" data-drive-protect="${drive}"></label>
        <label class="unified-setting-row"><span>Keep mounted</span><input type="checkbox" data-drive-persist="${drive}"></label>
        <button type="button" class="unified-action unified-drive-download" data-drive-download="${drive}">Download image</button>
        <div class="unified-drive-status" data-drive-status></div>
      </div>
    </article>`;
  }

  function install(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]');
    if(!pane||pane.dataset.fullDriveManager==='1')return false;
    pane.dataset.fullDriveManager='1';
    pane.innerHTML=`
      <div class="unified-section unified-drive-boot">
        <label class="unified-setting-row"><span>Boot from</span><select id="unifiedBootFrom"></select></label>
      </div>
      <div id="unifiedDriveRows">${driveRow(0)}${driveRow(1)}${driveRow(2)}${driveRow(3)}</div>
      <p class="unified-note unified-drive-hint">Drive 1/2 route automatically: 5.25 → Slot 6, 3.5 → Slot 5, hard disk → Slot 7.</p>`;

    const boot=qs('#unifiedBootFrom',pane);
    boot.add(new Option('Automatic','auto'));
    for(const id of bootIds)boot.add(new Option(routeLabel[id],id));
    boot.addEventListener('change',()=>persistence()?.setBoot?.(boot.value));

    pane.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.driveBoot!==undefined){document.getElementById('filedialog1')?.click();return;}
      if(b.dataset.driveInsert!==undefined){document.getElementById(inputFor[Number(b.dataset.driveInsert)])?.click();return;}
      if(b.dataset.driveEject!==undefined){click('ejectDrive'+b.dataset.driveEject);setTimeout(sync,0);return;}
      if(b.dataset.driveDownload!==undefined){click('saveDrive'+b.dataset.driveDownload);return;}
      if(b.dataset.driveMore!==undefined){
        const row=b.closest('[data-unified-drive]');
        const details=qs('[data-drive-details]',row);
        const open=details.hidden;
        details.hidden=!open;b.setAttribute('aria-expanded',open?'true':'false');
      }
    });

    pane.addEventListener('change',e=>{
      const protect=e.target.dataset.driveProtect;
      if(protect!==undefined){
        const source=document.getElementById('protectDrive'+protect);
        if(source){source.checked=e.target.checked;source.dispatchEvent(new Event('change',{bubbles:true}));}
        sync();return;
      }
      const keep=e.target.dataset.drivePersist;
      if(keep!==undefined){
        const target=routeFor(Number(keep));
        if(target)persistence()?.setKeep?.(target,e.target.checked).finally?.(()=>sync());
      }
    });

    const source=document.getElementById('mediaDialog');
    if(source)new MutationObserver(sync).observe(source,{subtree:true,childList:true,attributes:true,characterData:true});
    window.addEventListener('iigs-persistent-settings-changed',sync);
    window.addEventListener('iigs-persistent-drives-restored',sync);
    for(const id of ['filedialog1','filedialogInsert','filedialogInsert2','filedialogInsert3','filedialogInsert4'])
      document.getElementById(id)?.addEventListener('change',()=>setTimeout(sync,75));
    sync();
    return true;
  }

  function sync(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]');if(!pane)return;
    const service=persistence(),settings=service?.settings?.()||{boot:'auto',keep:{}};
    const boot=qs('#unifiedBootFrom',pane);if(boot&&boot.value!==settings.boot)boot.value=settings.boot||'auto';

    for(let drive=0;drive<4;drive++){
      const row=qs(`[data-unified-drive="${drive}"]`,pane);if(!row)continue;
      const target=routeFor(drive),name=mediaName(drive),mounted=name!=='Empty';
      const route=qs('[data-drive-route]',row),file=qs('[data-drive-name]',row);
      if(route)route.textContent=target?routeLabel[target]:(drive<2?'Auto route':'Slot 7 · SmartPort D'+(drive+1));
      if(file)file.textContent=name;
      row.classList.toggle('mounted',mounted);

      const eject=qs('[data-drive-eject]',row);if(eject)eject.disabled=!mounted;
      const more=qs('[data-drive-more]',row);if(more){more.hidden=!mounted;if(!mounted)more.setAttribute('aria-expanded','false');}
      const details=qs('[data-drive-details]',row);if(details&&!mounted)details.hidden=true;

      const block=board()?.prodosBlock?.drives?.[drive];
      const protect=qs('[data-drive-protect]',row);if(protect){protect.checked=!!block?.writeProtected;protect.disabled=!block?.image;}
      const download=qs('[data-drive-download]',row);if(download)download.disabled=!block?.image;
      const keep=qs('[data-drive-persist]',row);if(keep){keep.disabled=!target;keep.checked=!!(target&&settings.keep?.[target]);}

      const status=qs('[data-drive-status]',row);
      const sourceStatus=document.getElementById('writeStatus'+drive)?.textContent?.trim();
      if(status)status.textContent=sourceStatus||'';
    }
  }

  let tries=0;
  const wait=()=>{if(install())return;if(++tries<80)setTimeout(wait,100);};
  if(document.readyState==='complete')wait();else addEventListener('load',wait,{once:true});
})();
