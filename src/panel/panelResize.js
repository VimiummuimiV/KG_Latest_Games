// Handles panel resizing logic for LatestGamesManager
export function setupResizeHandle(uiManager, container, handle) {
  const mode = uiManager.main.viewManager.getDisplayMode();
  if (mode === 'wrap') {
    container.style.width = uiManager.main.panelWidth;
    handle.style.display = '';
    let isDragging = false, startX, startWidth;
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      let newWidthPx = startWidth + dx;
      const maxPx = window.innerWidth * 0.95;
      newWidthPx = Math.max(350, Math.min(newWidthPx, maxPx));
      const newWidthVw = Math.round((newWidthPx / window.innerWidth) * 100 * 10) / 10;
      container.style.width = `${newWidthVw}vw`;
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      uiManager.main.panelWidth = container.style.width;
      uiManager.main.settingsManager.saveSettings();
    };
    handle.onmousedown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = container.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };
  } else {
    handle.style.display = 'none';
    container.style.width = '';
    handle.onmousedown = null;
  }
}
