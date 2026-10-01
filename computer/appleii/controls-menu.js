// Keep controls reachable even while the emulator module is loading.
(() => {
  for (const [buttonId, panelId] of [['buttonSettings','controls'], ['buttonJoySettings','joyControls']]) {
  const button=document.getElementById(buttonId);
  const panel=document.getElementById(panelId);
  if (!button || !panel) continue;
  const setOpen=open=>{
    panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
  };
  button.addEventListener('click',()=>setOpen(panel.hidden));
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden && !panel.contains(event.target) && !button.contains(event.target))
      setOpen(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !panel.hidden) {
      event.preventDefault(); event.stopImmediatePropagation();
      setOpen(false); button.focus();
    }
  },true);
  }
})();
