// Handles Y positioning logic for LatestGamesManager panel
export function setupYPositioning(uiManager, container) {
  const mode = uiManager.main.viewManager.getDisplayMode();
  if (mode === 'wrap') {
    uiManager.updateContainerYPosition();
    let isDraggingY = false, startY, startTop;

    const onMouseMoveY = (e) => {
      if (!isDraggingY) return;
      const dy = e.clientY - startY;
      const newTopVh = startTop + (dy / window.innerHeight) * 100;
      const containerHeight = container.offsetHeight;
      const maxTopVh = Math.max(0, ((window.innerHeight - containerHeight) / window.innerHeight) * 100);
      const clampedTopVh = Math.max(0, Math.min(newTopVh, maxTopVh));
      const roundedTopVh = Math.round(clampedTopVh * 10) / 10;
      container.style.top = `${roundedTopVh}vh`;
    };

    const onMouseUpY = () => {
      if (!isDraggingY) return;
      isDraggingY = false;
      document.removeEventListener('mousemove', onMouseMoveY);
      document.removeEventListener('mouseup', onMouseUpY);
      const finalRect = container.getBoundingClientRect();
      uiManager.main.panelYPosition = Math.round(((finalRect.top / window.innerHeight) * 100) * 10) / 10;
      uiManager.main.settingsManager.saveSettings();
    };

    const enableYDrag = (e) => {
      if (e.button !== 0) return;
      const ignoreSelectors = [
        '.latest-game',
        '.group-tab',
        '.control-button',
        '.resize-handle',
        '#latest-games-search-input'
      ];
      if (ignoreSelectors.some(selector => e.target.closest(selector))) return;
      isDraggingY = true;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      startTop = (rect.top / window.innerHeight) * 100;
      document.addEventListener('mousemove', onMouseMoveY);
      document.addEventListener('mouseup', onMouseUpY);
      e.preventDefault();
    };

    container.addEventListener('mousedown', enableYDrag);
  } else {
    container.style.top = '';
  }
}
