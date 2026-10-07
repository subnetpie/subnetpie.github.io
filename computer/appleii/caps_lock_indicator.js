// Synchronize the on-screen Apple IIgs Caps Lock lamp with the host keyboard.
// The existing touch Caps key already toggles #buttonIndicator.caps-on; this
// module adds a physical green LED treatment and mirrors hardware Caps Lock.
(() => {
  function install() {
    const caps=document.getElementById('buttonCaps');
    const indicator=document.getElementById('buttonIndicator');
    const led=indicator?.querySelector('.key-led');
    if(!indicator||!led||indicator.dataset.capsLedReady==='1') return;
    indicator.dataset.capsLedReady='1';
    indicator.setAttribute('aria-label','Caps Lock indicator');
    indicator.setAttribute('aria-live','polite');

    const style=document.createElement('style');
    style.textContent=`
      #keyboard1 .indicator-key{
        position:relative;
        background:linear-gradient(135deg,#5b4a39 0%,#4c3e30 52%,#44372a 100%);
      }
      #keyboard1 .indicator-key .key-led{
        display:block;
        width:clamp(12px,1.55vw,20px);
        height:clamp(8px,1vw,13px);
        border-radius:999px;
        border:2px solid #1a211b;
        background:#19311d;
        box-shadow:inset 0 1px 3px #000c,0 0 0 1px #6d6254;
        transition:background .08s linear,box-shadow .08s linear;
      }
      #keyboard1 .indicator-key.caps-on .key-led{
        background:#38f05f;
        box-shadow:inset 0 1px 2px #d8ffe0,0 0 5px #38f05f,0 0 10px #38f05f;
      }
    `;
    document.head.append(style);

    function setCaps(on) {
      const state=!!on;
      indicator.classList.toggle('caps-on',state);
      caps?.classList.toggle('active',state);
      indicator.setAttribute('aria-label',`Caps Lock ${state?'on':'off'}`);
    }

    // Safari exposes the physical Caps Lock latch through getModifierState on
    // ordinary keyboard events as well as the CapsLock key itself.
    const syncPhysical=e=>{
      if(typeof e.getModifierState==='function') setCaps(e.getModifierState('CapsLock'));
    };
    document.addEventListener('keydown',syncPhysical,true);
    document.addEventListener('keyup',syncPhysical,true);

    // The legacy touch handler toggles .caps-on on pointerdown. Observe that
    // class so the green lamp stays in sync without replacing its behavior.
    const observer=new MutationObserver(()=>{
      const on=indicator.classList.contains('caps-on');
      caps?.classList.toggle('active',on);
      indicator.setAttribute('aria-label',`Caps Lock ${on?'on':'off'}`);
    });
    observer.observe(indicator,{attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
