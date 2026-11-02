(() => {
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  function closeUnifiedPanel(){
    const panel=document.getElementById('unifiedMachinePanel');
    if(panel)panel.hidden=true;
    document.querySelectorAll('#unifiedLauncher [aria-expanded="true"]').forEach(el=>el.setAttribute('aria-expanded','false'));
  }

  function openConfiguration(attempt=0){
    const dialog=document.getElementById('iigsConfigurationDialog');
    if(dialog && typeof dialog.openWithConfiguration==='function'){
      closeUnifiedPanel();
      dialog.openWithConfiguration();
      return;
    }

    const legacy=document.getElementById('buttonIIgsConfiguration');
    if(legacy){
      closeUnifiedPanel();
      legacy.click();
      return;
    }

    if(attempt<40)setTimeout(()=>openConfiguration(attempt+1),50);
    else console.error('[Apple IIgs] System Configuration dialog was not installed');
  }

  function moveSpeedToMachine(attempt=0){
    const panel=document.getElementById('unifiedMachinePanel');
    const machine=panel?.querySelector('[data-panel="machine"]');
    const display=panel?.querySelector('[data-panel="display"]');
    const speedGrid=panel?.querySelector('#unifiedSpeed');
    const speedSection=speedGrid?.closest('.unified-section');
    if(!panel||!machine||!display||!speedSection){
      if(attempt<40)setTimeout(()=>moveSpeedToMachine(attempt+1),50);
      return;
    }
    if(speedSection.parentElement!==machine){
      const configSection=machine.querySelector('#unifiedConfiguration')?.closest('.unified-section');
      if(configSection)configSection.insertAdjacentElement('beforebegin',speedSection);
      else machine.append(speedSection);
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#unifiedConfiguration');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openConfiguration();
  },true);

  if(document.readyState==='complete')moveSpeedToMachine();
  else addEventListener('load',()=>moveSpeedToMachine(),{once:true});
})();
