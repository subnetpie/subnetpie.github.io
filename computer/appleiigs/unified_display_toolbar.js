(() => {
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  function install(){
    const launcher=document.getElementById('unifiedLauncher');
    const panel=document.getElementById('unifiedMachinePanel');
    if(!launcher||!panel||document.getElementById('unifiedDisplayLauncher'))return false;

    const machine=[...launcher.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Machine controls');
    const joy=[...launcher.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Virtual joystick');
    if(!machine||!joy)return false;

    const display=document.createElement('button');
    display.type='button';
    display.id='unifiedDisplayLauncher';
    display.className='unified-island-action';
    display.setAttribute('aria-label','Display controls');
    display.title='Display controls';
    display.setAttribute('aria-expanded','false');
    display.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>';
    launcher.insertBefore(display,machine);

    const syncExpanded=()=>{
      const tab=panel.querySelector('[data-tab="display"]');
      display.setAttribute('aria-expanded',(!panel.hidden&&tab?.classList.contains('active'))?'true':'false');
    };

    display.addEventListener('click',()=>{
      panel.hidden=false;
      panel.querySelector('[data-tab="display"]')?.click();
      syncExpanded();
    });
    panel.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',syncExpanded));
    document.getElementById('unifiedPanelClose')?.addEventListener('click',()=>display.setAttribute('aria-expanded','false'));

    // Speed belongs to Machine, not Display. Move the existing generated
    // preset container rather than duplicating its state or listeners.
    const speed=panel.querySelector('#unifiedSpeed')?.closest('.unified-section');
    const machinePane=panel.querySelector('[data-panel="machine"]');
    const config=machinePane?.querySelector('#unifiedConfiguration')?.closest('.unified-section');
    if(speed&&machinePane){
      if(config)machinePane.insertBefore(speed,config);
      else machinePane.append(speed);
    }

    syncExpanded();
    return true;
  }

  let tries=0;
  const wait=()=>{if(install())return;if(++tries<120)setTimeout(wait,50);};
  if(document.readyState==='complete')wait();else addEventListener('load',wait,{once:true});
})();
