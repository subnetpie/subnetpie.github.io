(() => {
  if(new URLSearchParams(location.search).get('ui')!=='unified')return;

  const inputFor={0:'filedialogInsert',1:'filedialogInsert2',2:'filedialogInsert3',3:'filedialogInsert4'};
  const routeLabel={
    s5d1:'Slot 5 · 3.5-inch Drive 1',s5d2:'Slot 5 · 3.5-inch Drive 2',
    s6d1:'Slot 6 · 5.25-inch Drive 1',s6d2:'Slot 6 · 5.25-inch Drive 2',
    s7d1:'Slot 7 · SmartPort Drive 1',s7d2:'Slot 7 · SmartPort Drive 2',
    s7d3:'Slot 7 · SmartPort Drive 3',s7d4:'Slot 7 · SmartPort Drive 4'
  };

  const qs=(s,r=document)=>r.querySelector(s);
  const click=id=>{const e=document.getElementById(id);if(e){e.click();return true;}return false;};
  function board(){return window.__appleIIgsBoard;}
  function persistence(){return window.__appleIIgsPersistence;}

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

  function driveCard(drive){
    const number=drive+1;
    const boot=drive===0?'<button type="button" class="unified-drive-button" data-drive-boot="0">Boot / Restart</button>':'';
    return `<article class="unified-drive-card" data-unified-drive="${drive}">
      <div class="unified-drive-card-head">
        <div class="unified-drive-led" aria-hidden="true"></div>
        <div class="unified-drive-copy">
          <div class="unified-drive-route" data-drive-route>${drive>=2?'Slot 7 · SmartPort Drive '+number:'Drive '+number+' · Auto route'}</div>
          <div class="unified-drive-file" ${drive<2?`id="unifiedDrive${drive}"`:''} data-drive-name>Empty</div>
        </div>
      </div>
      <div class="unified-drive-button-row">
        ${boot}
        <button type="button" class="unified-drive-button" data-drive-insert="${drive}">${drive===0?'Insert / Change':'Insert'}</button>
        <button type="button" class="unified-drive-button unified-drive-eject" data-drive-eject="${drive}">Eject</button>
      </div>
      <div class="unified-drive-options" data-drive-options>
        <label class="unified-switch-row"><span>Write protect</span><input type="checkbox" data-drive-protect="${drive}"></label>
        <button type="button" class="unified-drive-button unified-drive-download" data-drive-download="${drive}">Download image</button>
      </div>
      <label class="unified-switch-row unified-persist-row"><span><b>Keep mounted</b><small data-drive-persist-note>Restore this media after reload</small></span><input type="checkbox" data-drive-persist="${drive}"></label>
      <div class="unified-drive-status" data-drive-status></div>
    </article>`;
  }

  function install(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]');
    if(!pane||pane.dataset.fullDriveManager==='1')return false;
    pane.dataset.fullDriveManager='1';
    pane.innerHTML=`
      <div class="unified-section unified-boot-section">
        <h3>Startup</h3>
        <label class="unified-select-row"><span>Boot from</span><select id="unifiedBootFrom"></select></label>
        <p class="unified-note">Drive 1 and Drive 2 auto-route by image type: 5.25-inch → Slot 6, 800K 3.5-inch → Slot 5, hard-disk/SmartPort → Slot 7.</p>
      </div>
      <div class="unified-section"><h3>Drives</h3><div id="unifiedDriveCards">
        ${driveCard(0)}${driveCard(1)}${driveCard(2)}${driveCard(3)}
      </div></div>`;

    const boot=qs('#unifiedBootFrom',pane);
    boot.add(new Option('Automatic — normal slot scan','auto'));
    for(const id of ['s5d1','s5d2','s6d1','s6d2','s7d1','s7d2','s7d3','s7d4'])boot.add(new Option(routeLabel[id],id));
    boot.addEventListener('change',()=>persistence()?.setBoot?.(boot.value));

    pane.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.driveBoot!==undefined){document.getElementById('filedialog1')?.click();return;}
      if(b.dataset.driveInsert!==undefined){document.getElementById(inputFor[Number(b.dataset.driveInsert)])?.click();return;}
      if(b.dataset.driveEject!==undefined){click('ejectDrive'+b.dataset.driveEject);setTimeout(sync,0);return;}
      if(b.dataset.driveDownload!==undefined){click('saveDrive'+b.dataset.driveDownload);return;}
    });

    pane.addEventListener('change',e=>{
      const p=e.target.dataset.driveProtect;
      if(p!==undefined){
        const source=document.getElementById('protectDrive'+p);
        if(source){source.checked=e.target.checked;source.dispatchEvent(new Event('change',{bubbles:true}));}
        sync();return;
      }
      const keep=e.target.dataset.drivePersist;
      if(keep!==undefined){
        const d=Number(keep),target=routeFor(d);
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
      const card=qs(`[data-unified-drive="${drive}"]`,pane);if(!card)continue;
      const target=routeFor(drive),name=mediaName(drive);
      const route=qs('[data-drive-route]',card),file=qs('[data-drive-name]',card);
      if(route)route.textContent=target?routeLabel[target]:(drive<2?'Drive '+(drive+1)+' · Auto route':'Slot 7 · SmartPort Drive '+(drive+1));
      if(file)file.textContent=name;
      card.classList.toggle('mounted',name!=='Empty');

      const eject=qs('[data-drive-eject]',card);if(eject)eject.disabled=name==='Empty';
      const block=board()?.prodosBlock?.drives?.[drive];
      const blockOptions=!!block?.image;
      const options=qs('[data-drive-options]',card);if(options)options.hidden=!blockOptions;
      const protect=qs('[data-drive-protect]',card);if(protect)protect.checked=!!block?.writeProtected;
      const download=qs('[data-drive-download]',card);if(download)download.disabled=!blockOptions;

      const keep=qs('[data-drive-persist]',card),note=qs('[data-drive-persist-note]',card);
      if(keep){
        keep.disabled=!target;
        keep.checked=!!(target&&settings.keep?.[target]);
      }
      if(note)note.textContent=target?'Restore '+routeLabel[target]+' after reload':'Mount media first to choose its physical drive';

      const status=qs('[data-drive-status]',card);
      const sourceStatus=document.getElementById('writeStatus'+drive)?.textContent?.trim();
      if(status)status.textContent=sourceStatus||'';
    }
  }

  let tries=0;
  const wait=()=>{if(install())return;if(++tries<80)setTimeout(wait,100);};
  if(document.readyState==='complete')wait();else addEventListener('load',wait,{once:true});
})();
