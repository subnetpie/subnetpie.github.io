// Independent emulator and joystick settings menus.
(() => {
  const definitions = [
    ['buttonSettings', 'controls'],
    ['buttonJoySettings', 'joyControls']
  ];
  const menus = definitions
    .map(([buttonId,panelId]) => ({
      button: document.getElementById(buttonId),
      panel: document.getElementById(panelId)
    }))
    .filter(({button,panel}) => button && panel);

  const close = ({button,panel}) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded','false');
  };
  const open = menu => {
    menus.forEach(other => { if(other !== menu) close(other); });
    menu.panel.hidden = false;
    menu.button.setAttribute('aria-expanded','true');
  };

  menus.forEach(menu => {
    close(menu);
    menu.button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if(menu.panel.hidden) open(menu);
      else close(menu);
    });
  });

  document.addEventListener('pointerdown', event => {
    menus.forEach(menu => {
      if(!menu.panel.hidden &&
         !menu.panel.contains(event.target) &&
         !menu.button.contains(event.target)) close(menu);
    });
  });

  document.addEventListener('keydown', event => {
    if(event.key !== 'Escape') return;
    const menu=menus.find(({panel}) => !panel.hidden);
    if(!menu) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(menu);
    menu.button.focus();
  }, true);
})();
