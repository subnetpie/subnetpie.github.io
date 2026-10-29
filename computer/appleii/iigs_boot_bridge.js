(() => {
  if(new URLSearchParams(location.search).get('machine')==='iie')return;

  function coldBoot(storageId){
    const svc=window.__appleIIgsStorage;
    const ep=svc?.endpoint?.(storageId);
    if(!svc||!ep)return false;
    const target=ep.persistenceId||'auto';

    // Store/apply the target before reset so the machine-level slot-bus policy
    // can seed ROM visibility from the selected physical controller.
    svc.setBoot(target);

    // The legacy reset button treats Shift as a cold IIgs reset. A normal
    // programmatic .click() is a warm reset and does not reliably restart the
    // ROM 03 boot scan after changing physical boot devices.
    const reset=document.getElementById('buttonReset');
    if(reset){
      reset.dispatchEvent(new MouseEvent('click',{
        bubbles:true,
        cancelable:true,
        shiftKey:true,
        view:window
      }));
    } else {
      window.__appleIIgsBoard?.reset?.(true);
    }

    // Controller reset can restore a default drive register. Reapply the
    // chosen unit synchronously before the next requestAnimationFrame.
    queueMicrotask(()=>svc.setBoot(target));
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-storage-boot]');
    if(!button)return;
    const row=button.closest?.('[data-storage-id]');
    if(!row)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    coldBoot(row.dataset.storageId);
  },true);
})();
