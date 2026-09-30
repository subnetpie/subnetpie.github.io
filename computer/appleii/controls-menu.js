// Keep controls reachable even while the emulator module is loading.
(() => {
  const button=document.getElementById('buttonSettings');
  const panel=document.getElementById('controls');
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
})();
