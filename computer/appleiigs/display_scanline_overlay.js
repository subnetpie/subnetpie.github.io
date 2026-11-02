(() => {
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  let enabled=false;
  let overlay=null;

  function ensureOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='iigsScanlineOverlay';
    overlay.setAttribute('aria-hidden','true');
    Object.assign(overlay.style,{
      position:'fixed',
      zIndex:'25',
      pointerEvents:'none',
      display:'none',
      background:'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,.18) 3px, rgba(0,0,0,.18) 4px)'
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function place(){
    const screen=document.getElementById('screen');
    const layer=ensureOverlay();
    if(!screen||!enabled){layer.style.display='none';return;}
    const r=screen.getBoundingClientRect();
    Object.assign(layer.style,{
      display:'block',
      left:r.left+'px',
      top:r.top+'px',
      width:r.width+'px',
      height:r.height+'px',
      borderRadius:getComputedStyle(screen).borderRadius||'0'
    });
  }

  function setEnabled(value){
    enabled=!!value;
    document.body.classList.toggle('iigs-scanlines',enabled);
    place();
    const source=document.getElementById('buttonScanlines');
    if(source)source.setAttribute('aria-pressed',enabled?'true':'false');
  }

  function toggle(){setEnabled(!enabled);}

  // Capture the source button before its legacy handler. The legacy renderer
  // flags remain available for Apple II compatibility modes; this overlay is
  // the presentation-layer equivalent for IIgs SHR.
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#buttonScanlines'))requestAnimationFrame(toggle);
  },true);

  addEventListener('resize',place);
  window.visualViewport?.addEventListener('resize',place);
  window.visualViewport?.addEventListener('scroll',place);
  new ResizeObserver(place).observe(document.getElementById('screen'));

  window.__appleIIgsScanlines={get enabled(){return enabled;},setEnabled,toggle};
})();
