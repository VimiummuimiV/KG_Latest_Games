import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent } from '../../tooltip.js';
import { icons } from '../../icons.js';
import { DEFAULTS } from '../../definitions.js';

function generatePanelToggleTooltipText(main) {
  const container = document.getElementById('latest-games-container');
  const currentPage = getCurrentPage();
  const isAlwaysVisible = main.alwaysVisiblePanel[currentPage] ?? false;
  const showHideText = container && container.classList.contains('visible') ? 'Скрыть' : 'Показать';
  const pinUnpinText = isAlwaysVisible ? 'Открепить' : 'Закрепить';
  
  return `
    [Клик] ${showHideText} панель
    [Shift + Клик] ${pinUnpinText} панель
    [Ctrl + Клик] Изменить задержку скрытия панели
    (${main.hidePanelDelay ?? DEFAULTS.hidePanelDelay} мс)
  `;
}

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
  
  const container = document.getElementById('latest-games-container');
  
  const updatePanelToggleTooltip = () => {
    updateTooltipContent(btn, generatePanelToggleTooltipText(main));
  };
  
  btn.addEventListener('mouseenter', updatePanelToggleTooltip);
  
  createCustomTooltip(btn, generatePanelToggleTooltipText(main));
  
  if (isAlwaysVisible) btn.classList.add('always-visible');
  
  // Set initial panel visibility
  if (container) {
    container.classList.toggle('visible', isAlwaysVisible);
    if (!isAlwaysVisible) main.viewManager.updateContainerLeftOffset();
  }
  
  btn.addEventListener('click', (e) => {
    const container = document.getElementById('latest-games-container');
    if (!container) return;
    
    const currentPage = getCurrentPage();
    if (e.ctrlKey) {
      const currentDelay = main.hidePanelDelay ?? DEFAULTS.hidePanelDelay;
      const input = prompt('Изменить задержку автоскрытия панели в миллисекундах:', currentDelay);
      const delay = parseInt(input, 10);
      if (!isNaN(delay) && delay >= 0) {
        main.hidePanelDelay = delay;
        main.settingsManager.saveSettings();
      } else if (input !== null) {
        alert('Пожалуйста, введите корректное значение задержки.');
      }
      return;
    }
    
    if (e.shiftKey) {
      // Toggle visibility setting for the current page
      main.alwaysVisiblePanel[currentPage] = !main.alwaysVisiblePanel[currentPage];
      const isAlwaysVisible = main.alwaysVisiblePanel[currentPage];
      btn.classList.toggle('always-visible', isAlwaysVisible);
      btn.innerHTML = isAlwaysVisible ? icons.panelToggleOpened : icons.panelToggleClosed;
      container.classList.toggle('visible', isAlwaysVisible);
      if (!isAlwaysVisible) main.viewManager.updateContainerLeftOffset();
      main.settingsManager.saveSettings();
      updatePanelToggleTooltip();
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
      updatePanelToggleTooltip();
    }
  });
  
  document.body.appendChild(btn);
}