import { createElement } from '../../utils.js';
import { createCustomTooltip } from '../../tooltip.js';
import { icons } from '../../icons.js';

export function createPanelToggleButton(main) {
  if (document.getElementById('latest-games-panel-toggle')) return;

  const btn = createElement('button', {
    id: 'latest-games-panel-toggle',
    className: 'latest-games-panel-toggle',
    type: 'button',
    innerHTML: main.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed,
  });
  createCustomTooltip(btn, `
    [Клик] (Показать/Скрыть) панель
    [Shift + Клик] (Закрепить/Открепить) панель`
  );

  main.alwaysVisiblePanel && btn.classList.add('always-visible');

  btn.addEventListener('click', (e) => {
    const container = document.getElementById('latest-games-container');
    if (!container) return;

    if (e.shiftKey) {
      main.alwaysVisiblePanel = !main.alwaysVisiblePanel;
      btn.classList.toggle('always-visible', main.alwaysVisiblePanel);
      btn.innerHTML = main.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed;
      container.classList.toggle('visible', main.alwaysVisiblePanel);
      if (!main.alwaysVisiblePanel) main.viewManager.updateContainerLeftOffset();
      main.settingsManager.saveSettings();
    } else {
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