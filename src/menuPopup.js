import { createCustomTooltip } from './tooltip.js';
import { createElement } from './utils.js';

/**
 * Create a popup with buttons that stays within screen boundaries
 * @param {Array} buttonConfigs - Array of button configuration objects
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {string} className - CSS class name for the popup
 * @param {string} header - Optional header text to display at the top
 * @param {boolean} persistent - Whether the popup should remain open after button clicks
 * @returns {HTMLElement} The created popup element
 */
export function createPopup(buttonConfigs, event, className = 'popup', header, persistent = false, focusGroupId = null) {
  // Remove any existing popup with the same class
  const existingPopup = document.querySelector(`.${className}`);
  if (existingPopup) existingPopup.remove();

  const popup = createElement('div', { className });

  // Add header if provided
  if (header) {
    const headerElem = createElement('div', { className: 'popup-header' });
    const headerTitle = createElement('span', {
      className: 'popup-header-title',
      textContent: header
    });
    headerElem.appendChild(headerTitle);
    popup.appendChild(headerElem);
  }

  // Create buttons from configurations
  buttonConfigs.forEach((config, index) => {
    const button = createElement('button', {
      className: config.className || 'popup-button',
      textContent: config.text,
      ...(config.dataset && { dataset: config.dataset })
    });
    button.setAttribute('data-config-index', index);

    if (config.onClick) {
      button.addEventListener('click', () => {
        config.onClick(button);
        if (!persistent) {
          popup.remove();
        }
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

  popup.querySelectorAll('button.active').forEach(btn =>
    createCustomTooltip(btn, 'Словарь уже существует в группе: ' + btn.textContent)
  );

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

  // Highlight and scroll to previously used group
  if (focusGroupId != null) {
    const focusIndex = buttonConfigs.findIndex(c => String(c.dataset?.groupId) === String(focusGroupId));
    const target = focusIndex !== -1 ? popup.querySelector(`button[data-config-index="${focusIndex}"]`) : null;
    if (target) {
      target.classList.add('last-used');
      createCustomTooltip(target, 'Последняя использованная группа');
      popup.scrollTop = target.offsetTop - popup.offsetTop;
    }
  }

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