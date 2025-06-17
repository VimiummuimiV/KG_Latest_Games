import { DEFAULTS } from '../definitions.js';

function setupDragResize(handle, getStart, onMove, onEnd) {
  let isDragging = false, startCoord, startSize;
  const onMouseMove = (e) => {
    if (!isDragging) return;
    const delta = getStart(e, startCoord);
    onMove(delta, startSize);
  };
  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    onEnd();
  };
  handle.onmousedown = (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    [startCoord, startSize] = getStart(e);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };
}

// Handles panel resizing logic for LatestGamesManager
export function setupResizeHandle(uiManager, container, horizontalHandle, verticalHandle) {
  const mode = uiManager.main.viewManager.getDisplayMode();
  // Horizontal (width) resize
  if (mode === 'wrap') {
    container.style.width = uiManager.main.panelWidth;
    horizontalHandle.style.display = '';
    setupDragResize(
      horizontalHandle,
      (e, prevX) => prevX === undefined ? [e.clientX, container.offsetWidth] : e.clientX - prevX,
      (dx, startWidth) => {
        let newWidthPx = startWidth + dx;
        const maxPx = window.innerWidth * 0.95;
        newWidthPx = Math.max(350, Math.min(newWidthPx, maxPx));
        const newWidthVw = Math.round((newWidthPx / window.innerWidth) * 100 * 10) / 10;
        container.style.width = `${newWidthVw}vw`;
      },
      () => {
        uiManager.main.panelWidth = container.style.width;
        uiManager.main.settingsManager.saveSettings();
      }
    );
  } else {
    horizontalHandle.style.display = 'none';
    container.style.width = '';
    horizontalHandle.onmousedown = null;
  }

  // Vertical (height) resize
  if (verticalHandle) {
    container.style.height = uiManager.main.panelHeight || DEFAULTS.panelHeight;
    verticalHandle.style.display = '';
    setupDragResize(
      verticalHandle,
      (e, prevY) => prevY === undefined ? [e.clientY, container.offsetHeight] : e.clientY - prevY,
      (dy, startHeight) => {
        let newHeightPx = startHeight + dy;
        const maxPx = window.innerHeight * 0.95;
        newHeightPx = Math.max(200, Math.min(newHeightPx, maxPx));
        const newHeightVh = Math.round((newHeightPx / window.innerHeight) * 100 * 10) / 10;
        container.style.height = `${newHeightVh}vh`;
      },
      () => {
        uiManager.main.panelHeight = container.style.height;
        uiManager.main.settingsManager.saveSettings();
      }
    );
  }
}
