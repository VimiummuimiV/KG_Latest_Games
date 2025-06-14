// Add margin to avoid edge clipping
const margin = 10;

/**
 * Setup popup positioning, drag functionality, and event handlers for closing
 * @param {HTMLElement} popup - The popup element
 * @param {MouseEvent} event - The mouse event for initial positioning
 * @param {Object} options - Configuration options
 * @param {string[]} options.draggableSelectors - CSS selectors for draggable elements
 * @param {string[]} options.interactiveSelectors - CSS selectors for interactive elements
 * @param {Function} options.onClose - Optional callback when popup is closed
 * @returns {Function} Cleanup function to remove all event listeners
 */
export function setupPopupDrag(popup, event, options = {}) {
  const {
    draggableSelectors = [],
    interactiveSelectors = [],
    onClose = null
  } = options;

  // Add popup to body temporarily to measure dimensions if not already added
  if (!popup.parentNode) {
    popup.style.visibility = 'hidden';
    document.body.appendChild(popup);
  }

  // Helper function to set popup position within viewport bounds
  const setPosition = (left, top) => {
    // Get viewport dimensions in real-time
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const popupRect = popup.getBoundingClientRect();
    const maxLeft = viewportWidth - popupRect.width - margin;
    const maxTop = viewportHeight - popupRect.height - margin;

    const constrainedLeft = Math.max(margin, Math.min(left, maxLeft));
    const constrainedTop = Math.max(margin, Math.min(top, maxTop));

    popup.style.left = `${constrainedLeft}px`;
    popup.style.top = `${constrainedTop}px`;
  };

  // Set initial position
  setPosition(event.clientX, event.clientY);
  popup.style.visibility = 'visible';

  // Store event handlers for cleanup in a single object
  const eventHandlers = {
    clickOutside: null,
    keydown: null,
    popupMouseDown: null,
    currentDrag: null
  };

  // Setup drag functionality on popup itself, but ignore interactive elements
  eventHandlers.popupMouseDown = (e) => {
    // Only allow dragging on specific elements that should support it
    const isDraggable = (target) => {
      // Check if target is the popup itself or a draggable child
      if (target === popup) return true;

      // Allow dragging on specified draggable selectors
      return draggableSelectors.some(selector =>
        target.matches && target.matches(selector)
      );
    };

    // Prevent dragging on interactive elements
    const isInteractive = (target) => {
      return interactiveSelectors.some(selector =>
        target.matches && (target.matches(selector) || target.closest(selector))
      );
    };

    // Ignore if not draggable or is interactive
    if (!isDraggable(e.target) || isInteractive(e.target)) return;
    // Only left mouse button
    if (e.button !== 0) return;

    e.preventDefault();

    // Store initial position and popup position
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseInt(popup.style.left, margin);
    const startTop = parseInt(popup.style.top, margin);

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;

      setPosition(newLeft, newTop);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      eventHandlers.currentDrag = null;
    };

    eventHandlers.currentDrag = { onMouseMove, onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  popup.addEventListener('mousedown', eventHandlers.popupMouseDown);

  // Set cursor style for draggable areas
  popup.style.cursor = 'move';

  // Setup event handlers for closing popup
  const hidePopup = (e) => {
    if (e && e.type === 'keydown' && e.key !== 'Escape') return;

    // Call onClose callback if provided
    if (onClose) {
      onClose();
    }

    // Remove all event listeners
    cleanup();

    popup.remove();
  };

  // Cleanup function to remove all event listeners
  const cleanup = () => {
    if (eventHandlers.clickOutside) {
      document.removeEventListener('click', eventHandlers.clickOutside);
    }
    if (eventHandlers.keydown) {
      document.removeEventListener('keydown', eventHandlers.keydown);
    }
    if (eventHandlers.popupMouseDown) {
      popup.removeEventListener('mousedown', eventHandlers.popupMouseDown);
    }
    if (eventHandlers.currentDrag) {
      document.removeEventListener('mousemove', eventHandlers.currentDrag.onMouseMove);
      document.removeEventListener('mouseup', eventHandlers.currentDrag.onMouseUp);
    }
  };

  eventHandlers.clickOutside = (e) => {
    if (!popup.contains(e.target)) {
      hidePopup(e);
    }
  };

  eventHandlers.keydown = (e) => {
    if (e.key === 'Escape') {
      hidePopup(e);
    }
  };

  // Setup event listeners with a slight delay to avoid immediate triggering
  requestAnimationFrame(() => {
    document.addEventListener('click', eventHandlers.clickOutside);
    document.addEventListener('keydown', eventHandlers.keydown);
  });

  // Return cleanup function for manual cleanup if needed
  return cleanup;
}