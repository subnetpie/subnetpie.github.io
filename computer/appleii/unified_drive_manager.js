(() => {
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  const qs=(s,r=document)=>r.querySelector(s);
  const storage=()=>window.__appleIIgsStorage;
  const persistence=()=>window.__appleIIgsPersistence;

  function row(ep){
    return `<article class="unified-drive-row" data-storage-id="${ep.id}">
      <input type="file" data-storage-input hidden>
      <div class="unified-drive-summary">
        <span class="unified-drive-led" aria-hidden="true"></span>
        <div class="unified-drive-copy">
          <div class="unified-drive-title">${ep.label}</div>
          <div class="unified-drive-file" data-drive-name>Empty</div>
          <div class="unified-drive-route">${ep.mediaLabel} · ${ep.accept}</div>
        </div>
      </div>
      <div class="unified-drive-actions">
        <button type="button" class="unified-drive-action" data-storage-insert>Insert</button>
        <button type="button" class="unified-drive-action" data-storage-boot>Boot</button>
        <button type="button" class="unified-drive-action unified-drive-eject" data-storage-eject>Eject</button>
        <button type="button" class="unified-drive-action unified-drive-more" data-storage-more aria-expanded="false">Options</button>
      </div>
      <div class="unified-drive-details" data-storage-details hidden>
        <label class="unified-setting-row"><span>Write protect</span><input type="checkbox" data-storage-protect></label>
        <label class="unified-setting-row"><span>Keep mounted</span><input type="checkbox" data-storage-persist></label>
        <button type="button" class="unified-action unified-drive-download" data-storage-download>Download image</button>
        <div class="unified-drive-status" data-storage-status></div>
      </div>
    </article>`;
  }

  function group(g){
    return `<section class="unified-storage-group" data-controller="${g.controller}">
      <div class="unified-storage-head">
        <div><strong>Slot ${g.slot}</strong><span>${g.label}</span></div>
        <span>${g.devices.length} drive${g.devices.length===1?'':'s'}</span>
      </div>
      <div class="unified-storage-devices">${g.devices.map(row).join('')}</div>
    </section>`;
  }

  function bootLabel(ep){return `Slot ${ep.slot} · ${ep.label}`;}

  function install(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]'),svc=storage();
    if(!pane||!svc||pane.dataset.driveUi==='registry')return false;
    pane.dataset.driveUi='registry';
    pane.innerHTML=`
      <div class="unified-section unified-drive-boot">
        <label class="unified-setting-row"><span>Boot from</span><select id="unifiedBootFrom"></select></label>
        <p class="unified-note">Choose a physical device. ROM 03 uses the installed controller and slot rather than an auto-routed generic drive.</p>
      </div>
      <div id="unifiedDriveRows">${svc.groups().map(group).join('')}</div>`;

    const boot=qs('#unifiedBootFrom',pane);
    boot.add(new Option('Automatic · normal slot scan','auto'));
    svc.endpoints().forEach(ep=>boot.add(new Option(bootLabel(ep),ep.persistenceId)));
    boot.addEventListener('change',()=>svc.setBoot(boot.value));

    pane.addEventListener('click',event=>{
      const button=event.target.closest('button'),r=event.target.closest('[data-storage-id]');
      if(!button||!r)return;
      const id=r.dataset.storageId;
      if(button.hasAttribute('data-storage-insert')){qs('[data-storage-input]',r)?.click();return;}
      if(button.hasAttribute('data-storage-eject')){svc.eject(id);sync();return;}
      if(button.hasAttribute('data-storage-download')){try{svc.download(id);}catch(err){alert(err?.message||String(err));}return;}
      if(button.hasAttribute('data-storage-boot')){
        const ep=svc.endpoint(id);svc.setBoot(ep?.persistenceId||'auto');
        document.getElementById('buttonReset')?.click();return;
      }
      if(button.hasAttribute('data-storage-more')){
        const details=qs('[data-storage-details]',r);details.hidden=!details.hidden;
        button.setAttribute('aria-expanded',details.hidden?'false':'true');
      }
    });

    pane.addEventListener('change',async event=>{
      const r=event.target.closest('[data-storage-id]');if(!r)return;
      const id=r.dataset.storageId;
      if(event.target.hasAttribute('data-storage-input')){
        const file=event.target.files?.[0];if(!file)return;
        try{await svc.mountFile(id,file);}catch(err){alert(err?.message||String(err));}
        event.target.value='';sync();return;
      }
      if(event.target.hasAttribute('data-storage-protect')){svc.setWriteProtected(id,event.target.checked);sync();return;}
      if(event.target.hasAttribute('data-storage-persist')){await svc.setKeep(id,event.target.checked);sync();}
    });

    ['iigs-storage-changed','iigs-persistent-settings-changed','iigs-persistent-drives-restored','unified-drives-show'].forEach(name=>window.addEventListener(name,sync));
    sync();return true;
  }

  function sync(){
    const pane=qs('#unifiedMachinePanel [data-panel="drives"]'),svc=storage();if(!pane||!svc)return;
    const settings=persistence()?.settings?.()||{boot:'auto',keep:{}};
    const boot=qs('#unifiedBootFrom',pane);if(boot&&boot.value!==settings.boot)boot.value=settings.boot||'auto';

    // Controller slots can change after a configuration restart. If so, rebuild
    // the registry view rather than leaving stale Slot labels on screen.
    const expected=svc.groups().map(g=>`${g.controller}:${g.slot}`).join('|');
    const rendered=[...pane.querySelectorAll('[data-controller]')].map(g=>`${g.dataset.controller}:${g.querySelector('.unified-storage-head strong')?.textContent?.replace('Slot ','')}`).join('|');
    if(rendered&&expected!==rendered){pane.dataset.driveUi='';install();return;}

    for(const ep of svc.endpoints()){
      const r=qs(`[data-storage-id="${ep.id}"]`,pane);if(!r)continue;
      const s=svc.state(ep.id);if(!s)continue;
      qs('[data-drive-name]',r).textContent=s.mounted?s.name:'Empty';
      r.classList.toggle('mounted',s.mounted);
      const eject=qs('[data-storage-eject]',r),bootButton=qs('[data-storage-boot]',r),more=qs('[data-storage-more]',r),details=qs('[data-storage-details]',r);
      eject.disabled=!s.mounted;bootButton.disabled=!s.mounted;more.hidden=!s.mounted;
      if(!s.mounted){more.setAttribute('aria-expanded','false');details.hidden=true;}
      const protect=qs('[data-storage-protect]',r),download=qs('[data-storage-download]',r),keep=qs('[data-storage-persist]',r);
      protect.checked=!!s.writeProtected;protect.disabled=!s.mounted||!s.writable;
      download.disabled=!s.mounted||!(ep.controller==='smartport'||ep.controller==='iigs35');
      keep.checked=!!settings.keep?.[ep.persistenceId];
      keep.disabled=!s.mounted;
      qs('[data-storage-status]',r).textContent=!s.mounted?'':s.dirty?'Modified in this session.':s.writeProtected?'Mounted read-only.':'Mounted and writable.';
    }
  }

  let tries=0;
  const wait=()=>{if(install())return;if(++tries<120)setTimeout(wait,100);};
  if(document.readyState==='complete')wait();else addEventListener('load',wait,{once:true});
  window.addEventListener('iigs-storage-registry-ready',wait,{once:true});
})();
