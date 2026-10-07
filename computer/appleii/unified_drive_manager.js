(() => {
  if(new URLSearchParams(location.search).get('ui')!=='unified')return;

  const inputFor={0:'filedialogInsert',1:'filedialogInsert2',2:'filedialogInsert3',3:'filedialogInsert4'};
  const routeLabel={
    s5d1:'Slot 5 · 3.5-inch D1',s5d2:'Slot 5 · 3.5-inch D2',
    s6d1:'Slot 6 · 5.25-inch D1',s6d2:'Slot 6 · 5.25-inch D2',
    s7d1:'Slot 7 · SmartPort D1',s7d2:'Slot 7 · SmartPort D2',
    s7d3:'Slot 7 · SmartPort D3',s7d4:'Slot 7 · SmartPort D4'
  };
  const bootIds=Object.keys(routeLabel);
  const qs=(s,r=document)=>r.querySelector(s);
  const board=()=>window.__appleIIgsBoard;
  const persistence=()=>window.__appleIIgsPersistence;

  function driveState(drive){
    const b=board(),block=b?.prodosBlock?.drives?.[drive],floppy=b?.floppy525?._disks?.[drive];
    let target=null;
    if(drive>=2)target='s7d'+(drive+1);
    else if(block?.image)target=(block.physical==='35'?'s5d':'s7d')+(drive+1);
    else if(floppy?.medium)target='s6d'+(drive+1);

    const dom=document.getElementById('driveName'+drive)?.textContent?.trim();
    const name=dom&&dom!=='Empty'?dom:
      block?.image&&block.name?block.name.split('/').pop():
      floppy?.medium&&floppy.name?floppy.name.split('/').pop():'Empty';
    return {target,name,mounted:name!=='Empty',block};
  }

  function driveRow(drive){
    const n=drive+1,label=drive>=2?'SmartPort D'+n:'Drive '+n;
    const boot=drive===0?'<button type="button" class="unified-drive-action" data-drive-boot>Load & Boot</button>':'';
    return `<article class="unified-drive-row" data-unified-drive="${drive}">
      <div class="unified-drive-summary"><span class="unified-drive-led" aria-hidden="true"></span><div class="unified-drive-copy">
        <div class="unified-drive-title">${label}</div><div class="unified-drive-file" ${drive<2?`id="unifiedDrive${drive}"`:''} data-drive-name>Empty</div>
        <div class="unified-drive-route" data-drive-route>${drive>=2?'Slot 7 · SmartPort D'+n:'Auto route'}</div>
      </div></div>
      <div class="unified-drive-actions">${boot}
        <button type="button" class="unified-drive-action" data-drive-insert="${drive}">Insert</button>
        <button type="button" class="unified-drive-action unified-drive-eject" data-drive-eject="${drive}">Eject</button>
        <button type="button" class="unified-drive-action unified-drive-more" data-drive-more aria-expanded="false">Options</button>
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
    if(!pane||pane.dataset.driveUi==='1')return false;
    pane.dataset.driveUi='1';
    pane.innerHTML=`
      <div class="unified-section unified-drive-boot"><label class="unified-setting-row"><span>Boot from</span><select id="unifiedBootFrom"></select></label></div>
      <div id="unifiedDriveRows">${[0,1,2,3].map(driveRow).join('')}</div>
      <p class="unified-note unified-drive-hint">Drive 1/2 route automatically: 5.25 → Slot 6, 3.5 → Slot 5, hard disk → Slot 7.</p>`;

    const boot=qs('#unifiedBootFrom',pane);
    boot.add(new Option('Automatic','auto'));
    bootIds.forEach(id=>boot.add(new Option(routeLabel[id],id)));
    boot.addEventListener('change',()=>persistence()?.setBoot?.(boot.value));

    pane.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-drive-boot')){document.getElementById('filedialog1')?.click();return;}
      if(button.dataset.driveInsert!==undefined){document.getElementById(inputFor[Number(button.dataset.driveInsert)])?.click();return;}
      if(button.dataset.driveEject!==undefined){document.getElementById('ejectDrive'+button.dataset.driveEject)?.click();setTimeout(sync,0);return;}
      if(button.dataset.driveDownload!==undefined){document.getElementById('saveDrive'+button.dataset.driveDownload)?.click();return;}
      if(button.hasAttribute('data-drive-more')){
        const details=qs('[data-drive-details]',button.closest('[data-unified-drive]'));
        details.hidden=!details.hidden;button.setAttribute('aria-expanded',details.hidden?'false':'true');
      }
    });

    pane.addEventListener('change',event=>{
      if(event.target.dataset.driveProtect!==undefined){
        const source=document.getElementById('protectDrive'+event.target.dataset.driveProtect);
        if(source){source.checked=event.target.checked;source.dispatchEvent(new Event('change',{bubbles:true}));}
        sync();return;
      }
      if(event.target.dataset.drivePersist!==undefined){
        const {target}=driveState(Number(event.target.dataset.drivePersist));
        if(target)persistence()?.setKeep?.(target,event.target.checked).finally?.(sync);
      }
    });

    const media=document.getElementById('mediaDialog');
    if(media)new MutationObserver(sync).observe(media,{subtree:true,childList:true,attributes:true,characterData:true});
    ['iigs-persistent-settings-changed','iigs-persistent-drives-restored','unified-drives-show'].forEach(name=>window.addEventListener(name,sync));
    Object.values(inputFor).concat('filedialog1').forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(sync,75)));
    sync();return true;
  }

  function sync(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]');if(!pane)return;
    const settings=persistence()?.settings?.()||{boot:'auto',keep:{}};
    const boot=qs('#unifiedBootFrom',pane);if(boot&&boot.value!==settings.boot)boot.value=settings.boot||'auto';

    for(let drive=0;drive<4;drive++){
      const row=qs(`[data-unified-drive="${drive}"]`,pane);if(!row)continue;
      const {target,name,mounted,block}=driveState(drive);
      qs('[data-drive-name]',row).textContent=name;
      qs('[data-drive-route]',row).textContent=target?routeLabel[target]:(drive<2?'Auto route':'Slot 7 · SmartPort D'+(drive+1));
      row.classList.toggle('mounted',mounted);

      const eject=qs('[data-drive-eject]',row),more=qs('[data-drive-more]',row),details=qs('[data-drive-details]',row);
      eject.disabled=!mounted;more.hidden=!mounted;
      if(!mounted){more.setAttribute('aria-expanded','false');details.hidden=true;}

      const protect=qs('[data-drive-protect]',row),download=qs('[data-drive-download]',row),keep=qs('[data-drive-persist]',row);
      protect.checked=!!block?.writeProtected;protect.disabled=!block?.image;
      download.disabled=!block?.image;
      keep.disabled=!target;keep.checked=!!(target&&settings.keep?.[target]);
      qs('[data-drive-status]',row).textContent=document.getElementById('writeStatus'+drive)?.textContent?.trim()||'';
    }
  }

  let tries=0;
  const wait=()=>{if(install())return;if(++tries<80)setTimeout(wait,100);};
  if(document.readyState==='complete')wait();else addEventListener('load',wait,{once:true});
})();
