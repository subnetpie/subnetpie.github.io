// Menus work even while the emulator module is loading.
(() => {
  const menus = [['buttonSettings', 'controls'], ['buttonJoySettings', 'joyControls']]
    .map(([button, panel]) => ({button: document.getElementById(button), panel: document.getElementById(panel)}))
    .filter(menu => menu.button && menu.panel);
  const close = menu => {
    menu.panel.hidden = true;
    menu.button.setAttribute('aria-expanded', 'false');
  };
  for (const menu of menus) {
    menu.button.addEventListener('click', () => {
      const open = menu.panel.hidden;
      menus.forEach(close);
      if (open) {
        menu.panel.hidden = false;
        menu.button.setAttribute('aria-expanded', 'true');
      }
    });
  }
  document.addEventListener('pointerdown', event => {
    for (const menu of menus)
      if (!menu.panel.contains(event.target) && !menu.button.contains(event.target)) close(menu);
  });
  document.addEventListener('keydown', event => {
    const open = menus.find(menu => !menu.panel.hidden);
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopImmediatePropagation();
      close(open); open.button.focus();
    }
  }, true);
})();
