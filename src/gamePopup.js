import { createCustomTooltip } from './tooltip.js';
import { createElement } from './utils.js';
import { visibilities, timeouts } from './definitions.js';
import { generateGameLink } from './gameUtils.js';

const visibilityTypes = Object.keys(visibilities);

/**
 * Create a game-specific popup with links to all game types and all timeouts.
 * Shows every combination regardless of the current game parameters.
 * After the subheader for each type, a container for type buttons is created and each button is appended inside.
 * @param {Object} game - The game object containing parameters
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {string} className - CSS class name for the popup (default: 'game-popup')
 * @returns {HTMLElement} The created popup element
 */
export function createGamePopup(game, event, className = 'game-popup') {
  const popup = createElement('div', { className });

  const headerElem = createElement('div', {
    className: 'popup-header',
    textContent: 'Выбрать'
  });
  popup.appendChild(headerElem);

  // For each game type, create a subheader and a container for all timeout buttons
  visibilityTypes.forEach(type => {
    const groupHeader = createElement('div', {
      className: 'popup-subheader',
      textContent: visibilities[type]
    });
    popup.appendChild(groupHeader);

    // Create a container for buttons for this type
    const typeButtonsContainer = createElement('div', { className: 'timeouts-container' });

    timeouts.forEach(timeout => {
      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type: type,
          timeout: timeout
        }
      };
      const link = generateGameLink(modifiedGame);
      const btn = createElement('a', {
        href: link,
        className: 'game-popup-button',
        textContent: timeout
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = link;
      });
      typeButtonsContainer.appendChild(btn);
    });

    // Append the container for buttons after the subheader
    popup.appendChild(typeButtonsContainer);
  });

  // Add popup to body temporarily to measure dimensions
  popup.style.visibility = 'hidden';
  document.body.appendChild(popup);

  // Add title to links if they are too wide
  popup.querySelectorAll('a').forEach(a => {
    if (a.scrollWidth > a.clientWidth) {
      createCustomTooltip(a, a.textContent);
    }
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