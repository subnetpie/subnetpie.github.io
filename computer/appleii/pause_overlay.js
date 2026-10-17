const canvas=document.getElementById('screen');
const runButton=document.getElementById('buttonRunStop');

if(canvas && runButton && !document.getElementById('pauseOverlay')){
  const overlay=document.createElement('div');
  overlay.id='pauseOverlay';
  overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{
    position:'fixed',
    zIndex:'9000',
    pointerEvents:'none',
    display:'none',
    alignItems:'center',
    justifyContent:'center'
  });

  const symbol=document.createElement('div');
  Object.assign(symbol.style,{
    display:'flex',
    alignItems:'stretch',
    justifyContent:'center'
  });
  for(let i=0;i<2;i++){
    const bar=document.createElement('span');
    Object.assign(bar.style,{
      display:'block',
      background:'#fff',
      borderRadius:'0.08em'
    });
    symbol.append(bar);
  }
  overlay.append(symbol);
  document.body.append(overlay);

  let hasRun=runButton.textContent.trim().toLowerCase()==='stop';

  function position(){
    const rect=canvas.getBoundingClientRect();
    overlay.style.left=rect.left+'px';
    overlay.style.top=rect.top+'px';
    overlay.style.width=rect.width+'px';
    overlay.style.height=rect.height+'px';

    const size=Math.max(18,Math.min(rect.width,rect.height)/8);
    symbol.style.width=size+'px';
    symbol.style.height=size+'px';
    symbol.style.gap=(size*0.22)+'px';
    for(const bar of symbol.children)bar.style.width=(size*0.28)+'px';
  }

  function sync(){
    const state=runButton.textContent.trim().toLowerCase();
    if(state==='stop')hasRun=true;
    overlay.style.display=(hasRun && state==='run')?'flex':'none';
    if(overlay.style.display!=='none')position();
  }

  new MutationObserver(sync).observe(runButton,{childList:true,subtree:true,characterData:true});
  new ResizeObserver(position).observe(canvas);
  window.addEventListener('resize',position,{passive:true});
  window.visualViewport?.addEventListener('resize',position,{passive:true});
  window.visualViewport?.addEventListener('scroll',position,{passive:true});
  sync();
}
