// Apple IIgs ADB keyboard presentation for the existing virtual keyboard.
// Keep the original element IDs so script.js key bindings continue to work.
(() => {
  if(new URLSearchParams(location.search).get('machine') === 'iie') return;

  const keyboard=document.getElementById('keyboard1');
  if(!keyboard || keyboard.dataset.iigsLayout==='1') return;
  keyboard.dataset.iigsLayout='1';
  keyboard.setAttribute('aria-label','Apple IIgs keyboard');
  keyboard.classList.add('iigs-keyboard');

  const rows=[...keyboard.querySelectorAll('.kb-row')];
  if(rows.length<5) return;
  const bottom=rows[4];
  const get=id=>document.getElementById(id);

  // Match the compact Apple IIgs keyboard photographed by the user.
  // The backslash key belongs beside the cursor cluster on the bottom row.
  // Existing IDs are intentionally preserved for input compatibility.
  const caps=get('buttonCaps');
  const option=get('buttonSolidApple');
  const apple=get('buttonOpenApple');
  const grave=get('buttonGrave');
  const space=get('buttonSpace');
  const backslash=get('buttonBackslash');
  const left=get('buttonLarr');
  const up=get('buttonUarr');
  const down=get('buttonDarr');
  const right=get('buttonRarr');
  const indicator=get('buttonIndicator');

  if(caps) caps.innerHTML='<span>caps</span><span>lock</span>';
  if(option) {
    option.textContent='option';
    option.className='KBbutton iigs-option-key modifier-key';
    option.setAttribute('aria-label','Option');
  }
  if(apple) {
    apple.innerHTML='<span class="iigs-apple"></span><span class="iigs-command">⌘</span>';
    apple.className='KBbutton iigs-command-key modifier-key';
    apple.setAttribute('aria-label','Apple Command');
  }
  if(grave) grave.innerHTML='<span>~</span><span>`</span>';
  if(backslash) backslash.innerHTML='<span>|</span><span>\\</span>';
  if(indicator) indicator.remove();

  [caps,option,apple,grave,space,backslash,left,up,down,right]
    .filter(Boolean).forEach(key=>bottom.appendChild(key));

  // Lower-case legends and tall/wide modifier labels follow the actual IIgs cap style.
  const labels={
    buttonEsc:'esc',buttonTab:'tab',buttonCtrl:'control',buttonCR:'return',
    buttonShift:'shift',buttonShiftRight:'shift',buttonDel:'delete'
  };
  for(const [id,label] of Object.entries(labels)) {
    const key=get(id); if(key) key.textContent=label;
  }

  const style=document.createElement('style');
  style.id='iigsKeyboardLayoutStyle';
  style.textContent=`
    #keyboard1.iigs-keyboard {
      width:calc(100% - 12px); left:6px;
      padding:clamp(5px,.8vw,10px);
      border:clamp(3px,.45vw,6px) solid #b5b4aa;
      border-radius:12px;
      background:linear-gradient(#d8d7cf,#c6c5bd);
      box-shadow:inset 0 2px #f7f6ef, inset 0 -2px #99988f, 0 3px 8px #0006;
    }
    #keyboard1.iigs-keyboard .kb-row {
      gap:clamp(2px,.32vw,5px);
      margin-bottom:clamp(3px,.38vw,6px);
      align-items:stretch;
    }
    #keyboard1.iigs-keyboard .KBbutton {
      height:clamp(43px,5.45vw,72px);
      padding:2px 3px;
      border:1px solid #77776f;
      border-radius:clamp(5px,.55vw,8px);
      background:linear-gradient(145deg,#fbfbf7 0%,#e9e8e1 55%,#d0cfc7 100%);
      color:#242424;
      opacity:1;
      font:italic 500 clamp(11px,1.35vw,20px)/1.02 "Helvetica Neue",Arial,sans-serif;
      text-transform:none;
      box-shadow:
        inset 2px 2px 1px #fff,
        inset -2px -3px 2px #aaa9a2,
        1px 2px 1px #5e5d58;
    }
    #keyboard1.iigs-keyboard .KBbutton:active,
    #keyboard1.iigs-keyboard .KBbutton.pressed,
    #keyboard1.iigs-keyboard .modifier-key.active {
      transform:translate(1px,2px);
      box-shadow:inset 1px 1px 2px #aaa, 0 1px #555;
    }
    #keyboard1.iigs-keyboard .dual {gap:1px;}
    #keyboard1.iigs-keyboard .dual span:first-child {font-size:.86em;}
    #keyboard1.iigs-keyboard .key-wide-esc {flex:1.08 1 0;justify-content:flex-start;padding-left:.5em;}
    #keyboard1.iigs-keyboard .key-wide-delete {flex:1.65 1 0;justify-content:flex-end;padding-right:.55em;font-size:.72em;}
    #keyboard1.iigs-keyboard .key-wide-tab {flex:1.55 1 0;justify-content:flex-start;padding-left:.45em;font-size:.78em;}
    #keyboard1.iigs-keyboard .key-wide-ctrl {flex:1.72 1 0;justify-content:flex-start;padding-left:.4em;font-size:.72em;}
    #keyboard1.iigs-keyboard .key-wide-return {flex:1.88 1 0;justify-content:flex-end;padding-right:.55em;font-size:.72em;}
    #keyboard1.iigs-keyboard .key-wide-shift {flex:2.08 1 0;justify-content:flex-start;padding-left:.5em;font-size:.72em;}
    #keyboard1.iigs-keyboard .key-space {flex:5.3 1 0;max-width:none;}
    #keyboard1.iigs-keyboard .caps-key {flex:1.15 1 0;flex-direction:column;align-items:flex-start;padding-left:.32em;font-size:.67em;}
    #keyboard1.iigs-keyboard .iigs-option-key {flex:1.55 1 0;align-items:flex-end;justify-content:flex-start;padding:.35em;font-size:.66em;}
    #keyboard1.iigs-keyboard .iigs-command-key {flex:2.2 1 0;flex-direction:row;gap:.45em;font-style:normal;}
    #keyboard1.iigs-keyboard .iigs-command-key .iigs-apple {font-size:1.15em;}
    #keyboard1.iigs-keyboard .iigs-command-key .iigs-command {font-size:1.05em;}
    #keyboard1.iigs-keyboard #buttonGrave {flex:.9 1 0;}
    #keyboard1.iigs-keyboard #buttonBackslash {flex:.95 1 0;}
    #keyboard1.iigs-keyboard .arrow-key {flex:.9 1 0;font-style:normal;font-size:clamp(15px,1.75vw,26px);}
    #keyboard1.iigs-keyboard .kb-row:last-child {align-items:flex-end;}

    @media (orientation:portrait) {
      #keyboard1.iigs-keyboard {left:3px;width:calc(100% - 6px);padding:4px;}
      #keyboard1.iigs-keyboard .kb-row {gap:2px;margin-bottom:3px;}
      #keyboard1.iigs-keyboard .KBbutton {height:clamp(35px,9.2vw,45px);font-size:clamp(8px,2.45vw,12px);border-radius:5px;}
      #keyboard1.iigs-keyboard .key-wide-delete,
      #keyboard1.iigs-keyboard .key-wide-tab,
      #keyboard1.iigs-keyboard .key-wide-ctrl,
      #keyboard1.iigs-keyboard .key-wide-return,
      #keyboard1.iigs-keyboard .key-wide-shift {font-size:clamp(7px,1.9vw,10px);}
      #keyboard1.iigs-keyboard .arrow-key {font-size:clamp(12px,3vw,17px);}
    }
  `;
  document.head.appendChild(style);
})();
