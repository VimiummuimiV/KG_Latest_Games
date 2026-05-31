import { createElement, getCurrentPage } from '../../utils.js';

export function createHoverArea(main) {
  if (!main.hoverAreaEnabled) return;
  const hoverArea = createElement('div', { id: 'latest-games-hover-area' });
  hoverArea.addEventListener('mouseenter', () => showContainer(main));
  hoverArea.addEventListener('mouseleave', () => hideContainer(main));
  document.body.appendChild(hoverArea);
}

export function syncHoverArea(main) {
  const hoverArea = document.getElementById('latest-games-hover-area');
  if (main.hoverAreaEnabled && !hoverArea) createHoverArea(main);
  else if (!main.hoverAreaEnabled && hoverArea) hoverArea.remove();
}

export function toggleHoverArea(main) {
  main.hoverAreaEnabled = !main.hoverAreaEnabled;
  if (main.hoverAreaEnabled) {
    createHoverArea(main);
  } else {
    document.getElementById('latest-games-hover-area')?.remove();
  }
  main.settingsManager.saveSettings();
}

export function showContainer(main) {
  main.isHovered = true;
  if (main.hoverTimeout) clearTimeout(main.hoverTimeout);
  main.hoverTimeout = null;
  const container = document.getElementById('latest-games-container');
  if (container) {
    const wasVisible = container.classList.contains('visible');
    container.classList.add('visible');
    container.style.left = '0';
    if (main.viewManager.getDisplayMode() === 'wrap') {
      container.style.top = `${main.panelYPosition}vh`;
    }
    container.scrollTop = main.previousScrollPosition;
    // Only retrigger animation if panel was hidden before
    if (!wasVisible) {
      const previousGame = container.querySelector('.latest-game.previous-game');
      if (previousGame) {
        previousGame.style.animation = 'none';
        setTimeout(() => previousGame.style.animation = '', 10);
      }
    }
  }
}

export function hideContainer(main) {
  const currentPage = getCurrentPage();
  const isAlwaysVisible = main.alwaysVisiblePanel[currentPage] ?? false;
  
  if (isAlwaysVisible) return;
  
  main.isHovered = false;
  if (main.hoverTimeout) clearTimeout(main.hoverTimeout);
  main.hoverTimeout = setTimeout(() => {
    if (!main.isHovered) {
      const container = document.getElementById('latest-games-container');
      if (container) {
        container.classList.remove('visible');
        main.viewManager.updateContainerLeftOffset();
      }
    }
  }, main.hidePanelDelay);
}
