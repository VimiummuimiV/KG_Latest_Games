import { createCustomTooltip } from './tooltip.js';
import { createElement } from './utils.js';

/**
 * Create a popup with buttons that stays within screen boundaries
 * @param {Array} buttonConfigs - Array of button configuration objects
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {string} className - CSS class name for the popup
 * @param {string} header - Optional header text to display at the top
 * @returns {HTMLElement} The created popup element
 */
export function createPopup(buttonConfigs, event, className = 'popup', header) {
  // Remove any existing popup with the same class
  const existingPopup = document.querySelector(`.${className}`);
  if (existingPopup) existingPopup.remove();

  const popup = createElement('div', { className });

  // Add header if provided
  if (header) {
    const headerElem = createElement('div', {
      className: 'popup-header',
      textContent: header
    });
    popup.appendChild(headerElem);
  }

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
    isEllipsed && createCustomTooltip(btn, btn.textContent);
  });

  // Calculate and set position
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 10;

  let left = Math.max(margin, Math.min(event.clientX, viewportWidth - popupRect.width - margin));
  let top = Math.max(margin, Math.min(event.clientY, viewportHeight - popupRect.height - margin));

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = 'visible';

  // Define a function to hide popup and remove event listeners
  const hidePopup = (e) => {
    if (e && e.type === 'keydown' && e.key !== 'Escape') return;
    popup.remove();
    document.removeEventListener('click', clickOutsideHandler);
    document.removeEventListener('keydown', keydownHandler);
  };

  const clickOutsideHandler = (e) => {
    if (!popup.contains(e.target)) {
      hidePopup(e);
    }
  };

  const keydownHandler = (e) => {
    if (e.key === 'Escape') {
      hidePopup(e);
    }
  };

  requestAnimationFrame(() => {
    document.addEventListener('click', clickOutsideHandler);
    document.addEventListener('keydown', keydownHandler);
  });

  return popup;
}