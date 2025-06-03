import { createElement } from './utils.js';

/**
 * Create a popup with buttons that stays within screen boundaries
 * @param {Array} buttonConfigs - Array of button configuration objects
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {string} className - CSS class name for the popup
 * @returns {HTMLElement} The created popup element
 */
export function createPopup(buttonConfigs, event, className = 'popup') {
  // Remove any existing popup with the same class
  const existingPopup = document.querySelector(`.${className}`);
  if (existingPopup) existingPopup.remove();

  const popup = createElement('div', { className });

  // Create buttons from configurations
  buttonConfigs.forEach(config => {
    const button = createElement('button', {
      className: config.className || 'popup-button',
      textContent: config.text,
      ...(config.dataset && { dataset: config.dataset })
    });

    if (config.onClick) {
      button.addEventListener('click', () => {
        config.onClick();
        popup.remove();
      });
    }

    popup.appendChild(button);
  });

  // Add popup to body temporarily to measure dimensions
  popup.style.visibility = 'hidden';
  document.body.appendChild(popup);

  // Add title to buttons if they are too wide
  popup.querySelectorAll('button').forEach(btn => {
    const isEllipsed = btn.scrollWidth > btn.clientWidth;
    if (isEllipsed) btn.title = btn.textContent;
  });

  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate initial position
  let left = event.clientX;
  let top = event.clientY;

  // Keep popup within screen boundaries with 10px margin
  left = Math.max(10, Math.min(left, viewportWidth - popupRect.width - 10));
  top = Math.max(10, Math.min(top, viewportHeight - popupRect.height - 10));

  // Apply final position and make visible
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = 'visible';

  // Add click-outside-to-close functionality
  const hidePopup = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', hidePopup);
    }
  };

  // Use setTimeout to prevent immediate closure on the same click that opened the popup
  setTimeout(() => {
    document.addEventListener('click', hidePopup);
  }, 0);

  return popup;
}