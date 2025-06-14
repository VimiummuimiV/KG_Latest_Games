import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip } from '../../tooltip.js';
import { icons } from '../../icons.js';

export function createPanelToggleButton(main) {
  if (document.getElementById('latest-games-panel-toggle')) return;

  const currentPage = getCurrentPage();
  const isAlwaysVisible = main.alwaysVisiblePanel[currentPage] ?? false;

  const btn = createElement('button', {
    id: 'latest-games-panel-toggle',
    className: 'latest-games-panel-toggle',
    type: 'button',
    innerHTML: isAlwaysVisible ? icons.panelToggleOpened : icons.panelToggleClosed,
  });
  createCustomTooltip(btn, `
    [Клик] (Показать/Скрыть) панель
    [Shift + Клик] (Закрепить/Открепить) панель`
  );

  if (isAlwaysVisible) btn.classList.add('always-visible');

  // Set initial panel visibility
  const container = document.getElementById('latest-games-container');
  if (container) {
    container.classList.toggle('visible', isAlwaysVisible);
    if (!isAlwaysVisible) main.viewManager.updateContainerLeftOffset();
  }

  btn.addEventListener('click', (e) => {
    const container = document.getElementById('latest-games-container');
    if (!container) return;

    const currentPage = getCurrentPage();
    if (e.shiftKey) {
      // Toggle visibility setting for the current page
      main.alwaysVisiblePanel[currentPage] = !main.alwaysVisiblePanel[currentPage];
      const isAlwaysVisible = main.alwaysVisiblePanel[currentPage];
      btn.classList.toggle('always-visible', isAlwaysVisible);
      btn.innerHTML = isAlwaysVisible ? icons.panelToggleOpened : icons.panelToggleClosed;
      container.classList.toggle('visible', isAlwaysVisible);
      if (!isAlwaysVisible) main.viewManager.updateContainerLeftOffset();
      main.settingsManager.saveSettings();
    } else {
      // Normal click toggles visibility without changing settings
      const isVisible = container.classList.contains('visible');
      if (isVisible) {
        if (main.hoverTimeout) {
          clearTimeout(main.hoverTimeout);
          main.hoverTimeout = null;
        }
        container.classList.remove('visible');
        main.viewManager.updateContainerLeftOffset();
      } else {
        main.uiManager.showContainer();
      }
    }
  });

  document.body.appendChild(btn);
}