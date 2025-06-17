import { DEFAULTS } from '../definitions.js';
import { getCurrentPage } from '../utils.js';

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

/**
 * Handles panel resizing logic for LatestGamesManager
 * @param {object} uiManager - instance of UIManager
 * @param {HTMLElement} container - the panel container
 * @param {HTMLElement} horizontalHandle - handle for width resizing
 * @param {HTMLElement} bottomHandle - handle for bottom-edge height resizing
 * @param {HTMLElement} topHandle - handle for top-edge height resizing
 */
export function setupResizeHandle(uiManager, container, horizontalHandle, bottomHandle, topHandle) {
  const mode = uiManager.main.viewManager.getDisplayMode();
  const currentPage = getCurrentPage();

  // Horizontal (width) resize
  if (mode === 'wrap') {
    const width = (uiManager.main.panelWidths?.[currentPage]) || uiManager.main.panelWidth;
    container.style.width = width;
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
        uiManager.main.panelWidths = uiManager.main.panelWidths || {};
        uiManager.main.panelWidths[currentPage] = container.style.width;
        uiManager.main.settingsManager.saveSettings();
      }
    );
  } else {
    horizontalHandle.style.display = 'none';
    container.style.width = '';
    horizontalHandle.onmousedown = null;
  }

  const initialHeight = (uiManager.main.panelHeights?.[currentPage]) || DEFAULTS.panelHeight;
  container.style.height = initialHeight;

  // Bottom vertical (height) resize
  if (bottomHandle) {
    bottomHandle.style.display = '';
    setupDragResize(
      bottomHandle,
      (e, prevY) => prevY === undefined ? [e.clientY, container.offsetHeight] : e.clientY - prevY,
      (dy, startHeight) => {
        let newHeightPx = startHeight + dy;
        const maxPx = window.innerHeight * 0.95;
        newHeightPx = Math.max(200, Math.min(newHeightPx, maxPx));
        const newHeightVh = Math.round((newHeightPx / window.innerHeight) * 100 * 10) / 10;
        container.style.height = `${newHeightVh}vh`;
      },
      () => {
        uiManager.main.panelHeights = uiManager.main.panelHeights || {};
        uiManager.main.panelHeights[currentPage] = container.style.height;
        uiManager.main.settingsManager.saveSettings();
      }
    );
  }

  // Top vertical (height) resize
  if (topHandle) {
    topHandle.style.display = '';
    setupDragResize(
      topHandle,
      (e, prevY) => {
        if (prevY === undefined) {
          // Return initial state: mouse Y, container height, and current top position
          const currentTop = parseFloat(container.style.top) || 0;
          return [e.clientY, { height: container.offsetHeight, top: currentTop }];
        }
        return prevY - e.clientY; // Inverted delta for top resize
      },
      (dy, startState) => {
        let newHeightPx = startState.height + dy;
        const maxPx = window.innerHeight * 0.95;
        newHeightPx = Math.max(200, Math.min(newHeightPx, maxPx));
        
        // Calculate the height change
        const heightChange = newHeightPx - startState.height;
        
        // Adjust top position inversely to height change
        const heightChangeVh = (heightChange / window.innerHeight) * 100;
        let newTopVh = startState.top - heightChangeVh;
        
        // Ensure the container doesn't go above the screen
        newTopVh = Math.max(0, newTopVh);
        
        // Apply the changes
        const newHeightVh = Math.round((newHeightPx / window.innerHeight) * 100 * 10) / 10;
        const roundedTopVh = Math.round(newTopVh * 10) / 10;
        
        container.style.height = `${newHeightVh}vh`;
        container.style.top = `${roundedTopVh}vh`;
      },
      () => {
        const currentPage = getCurrentPage();
        
        // Save both height and position
        uiManager.main.panelHeights = uiManager.main.panelHeights || {};
        uiManager.main.panelHeights[currentPage] = container.style.height;
        
        uiManager.main.panelYPosition = uiManager.main.panelYPosition || {};
        const finalTopVh = parseFloat(container.style.top) || 0;
        uiManager.main.panelYPosition[currentPage] = finalTopVh;
        
        uiManager.main.settingsManager.saveSettings();
      }
    );
  }
}
