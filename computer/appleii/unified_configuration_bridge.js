(() => {
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  function openConfiguration(attempt=0){
    const dialog=document.getElementById('iigsConfigurationDialog');
    if(dialog && typeof dialog.openWithConfiguration==='function'){
      document.getElementById('unifiedMachinePanel')?.setAttribute('hidden','');
      dialog.openWithConfiguration();
      return;
    }

    const legacy=document.getElementById('buttonIIgsConfiguration');
    if(legacy){
      document.getElementById('unifiedMachinePanel')?.setAttribute('hidden','');
      legacy.click();
      return;
    }

    if(attempt<40)setTimeout(()=>openConfiguration(attempt+1),50);
    else console.error('[Apple IIgs] System Configuration dialog was not installed');
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#unifiedConfiguration');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openConfiguration();
  },true);
})();
