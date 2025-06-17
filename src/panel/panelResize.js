import { DEFAULTS } from '../definitions.js';

// Handles panel resizing logic for LatestGamesManager
export function setupResizeHandle(uiManager, container, horizontalHandle, verticalHandle) {
  const mode = uiManager.main.viewManager.getDisplayMode();
  // Horizontal (width) resize
  if (mode === 'wrap') {
    container.style.width = uiManager.main.panelWidth;
    horizontalHandle.style.display = '';
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
    horizontalHandle.onmousedown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = container.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };
  } else {
    horizontalHandle.style.display = 'none';
    container.style.width = '';
    horizontalHandle.onmousedown = null;
  }

  // Vertical (height) resize
  if (verticalHandle) {
    container.style.height = uiManager.main.panelHeight || DEFAULTS.panelHeight;
    verticalHandle.style.display = '';
    let isDraggingY = false, startY, startHeight;
    const onMouseMoveY = (e) => {
      if (!isDraggingY) return;
      const dy = e.clientY - startY;
      let newHeightPx = startHeight + dy;
      const maxPx = window.innerHeight * 0.95;
      newHeightPx = Math.max(200, Math.min(newHeightPx, maxPx));
      const newHeightVh = Math.round((newHeightPx / window.innerHeight) * 100 * 10) / 10;
      container.style.height = `${newHeightVh}vh`;
    };
    const onMouseUpY = () => {
      if (!isDraggingY) return;
      isDraggingY = false;
      document.removeEventListener('mousemove', onMouseMoveY);
      document.removeEventListener('mouseup', onMouseUpY);
      uiManager.main.panelHeight = container.style.height;
      uiManager.main.settingsManager.saveSettings();
    };
    verticalHandle.onmousedown = (e) => {
      if (e.button !== 0) return;
      isDraggingY = true;
      startY = e.clientY;
      startHeight = container.offsetHeight;
      document.addEventListener('mousemove', onMouseMoveY);
      document.addEventListener('mouseup', onMouseUpY);
      e.preventDefault();
    };
  }
}
