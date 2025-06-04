import { createCustomTooltip } from './tooltip.js';
import { createElement } from './utils.js';
import { visibilities, timeouts, ranks } from './definitions.js';
import { generateGameLink } from './gameUtils.js';

const visibilityTypes = Object.keys(visibilities);
const SETTINGS_KEY = 'latestGamesSettings';

// Configuration for rank slider constraints
const RANK_CONSTRAINTS = {
  minFrom: 0, // level_from 1-6 (indices 0-5)
  maxFrom: 5,
  minTo: 5, // level_to 6-9 (indices 5-8)  
  maxTo: 8
};

// Add margin to avoid edge clipping
const margin = 10;

/**
 * Settings helper functions
 */
const settingsHelper = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  },

  save(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  },

  getRankRange() {
    const settings = this.load();
    return settings.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo];
  },

  saveRankRange(minIdx, maxIdx) {
    const settings = this.load();
    settings.rankRange = [minIdx, maxIdx];
    this.save(settings);
  }
};

/**
 * Clamp index to allowed range based on handle type
 */
function clampIndex(idx, isMinHandle) {
  if (isMinHandle) {
    return Math.max(RANK_CONSTRAINTS.minFrom, Math.min(RANK_CONSTRAINTS.maxFrom, idx));
  } else {
    return Math.max(RANK_CONSTRAINTS.minTo, Math.min(RANK_CONSTRAINTS.maxTo, idx));
  }
}

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

  // --- Dual-range slider for rank selection ---
  const rankSliderContainer = createElement('div', { className: 'rank-slider-container' });
  const sliderTrack = createElement('div', { className: 'rank-slider-track' });
  const sliderRange = createElement('div', { className: 'rank-slider-range' });
  const sliderHandles = [
    createElement('div', { className: 'rank-slider-handle', tabIndex: 0 }),
    createElement('div', { className: 'rank-slider-handle', tabIndex: 0 })
  ];
  const rankDisplay = createElement('div', { className: 'rank-slider-display' });

  // Load saved range with proper clamping
  let [minIdx, maxIdx] = settingsHelper.getRankRange();
  minIdx = clampIndex(minIdx, true);
  maxIdx = clampIndex(maxIdx, false);

  // Ensure valid range relationship
  if (minIdx > maxIdx) minIdx = maxIdx;
  if (maxIdx < minIdx) maxIdx = minIdx;

  // Store references to all button elements and their config
  const buttonRefs = [];

  function updateSliderUI() {
    // Ensure indices are properly clamped
    minIdx = clampIndex(minIdx, true);
    maxIdx = clampIndex(maxIdx, false);

    // Prevent invalid range relationships
    if (minIdx > maxIdx) minIdx = maxIdx;
    if (maxIdx < minIdx) maxIdx = minIdx;

    const percent1 = (minIdx / (ranks.length - 1)) * 100;
    const percent2 = (maxIdx / (ranks.length - 1)) * 100;

    sliderHandles[0].style.left = percent1 + '%';
    sliderHandles[1].style.left = percent2 + '%';
    sliderRange.style.left = percent1 + '%';
    sliderRange.style.width = (percent2 - percent1) + '%';

    rankDisplay.textContent = ranks[minIdx] + (minIdx === maxIdx ? '' : ' — ' + ranks[maxIdx]);

    // Handle overlap state
    const isOverlap = minIdx === maxIdx;
    const handleClasses = [
      ['overlap', 'overlap-left'],
      ['overlap', 'overlap-right']
    ];

    sliderHandles.forEach((handle, i) => {
      handleClasses[i].forEach(className => handle.classList.toggle(className, isOverlap));
    });

    // Update all button links
    updateButtonLinks();
  }

  function updateButtonLinks() {
    const isRangeModified = minIdx !== RANK_CONSTRAINTS.minFrom || maxIdx !== RANK_CONSTRAINTS.maxTo;

    buttonRefs.forEach(({ btn, type, timeout }) => {
      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type,
          timeout,
          level_from: isRangeModified ? minIdx + 1 : game.params.level_from,
          level_to: isRangeModified ? maxIdx + 1 : game.params.level_to
        }
      };

      const link = generateGameLink(modifiedGame);
      btn.setAttribute('href', link);
      btn.onclick = (e) => {
        e.preventDefault();
        window.location.href = link;
      };
    });
  }

  function saveRange() {
    settingsHelper.saveRankRange(minIdx, maxIdx);
  }

  // Handle click on slider track
  sliderTrack.addEventListener('click', (e) => {
    const rect = sliderTrack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    let idx = Math.round(percent * (ranks.length - 1));

    // Determine which handle to move based on proximity
    if (Math.abs(idx - minIdx) < Math.abs(idx - maxIdx)) {
      minIdx = Math.min(clampIndex(idx, true), maxIdx);
    } else {
      maxIdx = Math.max(clampIndex(idx, false), minIdx);
    }

    updateSliderUI();
    saveRange();
  });

  // Handle dragging
  sliderHandles.forEach((handle, i) => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      let prev = i === 0 ? minIdx : maxIdx;

      const onMove = ({ clientX }) => {
        const { left, width } = sliderTrack.getBoundingClientRect();
        let idx = Math.round(((clientX - left) / width) * (ranks.length - 1));
        idx = clampIndex(idx, i === 0);

        // compute the new value for minIdx or maxIdx
        const newVal = i === 0
          ? Math.min(idx, maxIdx)
          : Math.max(idx, minIdx);

        if (newVal !== prev) {
          prev = newVal;
          if (i === 0) minIdx = newVal;
          else maxIdx = newVal;
          updateSliderUI();
        }
      };

      const onUp = () => {
        saveRange();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // Build slider UI
  sliderTrack.appendChild(sliderRange);
  sliderHandles.forEach(h => sliderTrack.appendChild(h));
  rankSliderContainer.appendChild(rankDisplay);
  rankSliderContainer.appendChild(sliderTrack);
  popup.appendChild(rankSliderContainer);
  updateSliderUI();

  // Create game type sections
  visibilityTypes.forEach(type => {
    const groupHeader = createElement('div', {
      className: 'popup-subheader',
      textContent: visibilities[type]
    });
    popup.appendChild(groupHeader);

    const typeButtonsContainer = createElement('div', { className: 'timeouts-container' });

    timeouts.forEach(timeout => {
      // Skip 5-second timeout for the normal type
      if (type === 'normal' && timeout === 5) return;

      const isRangeModified = minIdx !== RANK_CONSTRAINTS.minFrom || maxIdx !== RANK_CONSTRAINTS.maxTo;
      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type: type,
          timeout: timeout,
          level_from: isRangeModified ? minIdx + 1 : game.params.level_from,
          level_to: isRangeModified ? maxIdx + 1 : game.params.level_to
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

      buttonRefs.push({ btn, type, timeout });
      typeButtonsContainer.appendChild(btn);
    });

    popup.appendChild(typeButtonsContainer);
  });

  // Position popup and add tooltips
  setupPopupPositioning(popup, event, headerElem);

  return popup;
}

/**
 * Handle popup positioning, tooltip setup, and drag functionality
 */
function setupPopupPositioning(popup, event, headerElem) {
  // Add popup to body temporarily to measure dimensions
  popup.style.visibility = 'hidden';
  document.body.appendChild(popup);

  // Add tooltips for truncated links
  popup.querySelectorAll('a').forEach(a => {
    if (a.scrollWidth > a.clientWidth) {
      createCustomTooltip(a, a.textContent);
    }
  });

  // Calculate and set position

  // Helper function to constrain popup position within viewport bounds
  const constrainPosition = (left, top) => {
    // Get viewport dimensions in real-time
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const popupRect = popup.getBoundingClientRect();
    const maxLeft = viewportWidth - popupRect.width - margin;
    const maxTop = viewportHeight - popupRect.height - margin;

    return {
      left: Math.max(margin, Math.min(left, maxLeft)),
      top: Math.max(margin, Math.min(top, maxTop))
    };
  };

  const { left, top } = constrainPosition(event.clientX, event.clientY);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = 'visible';

  // Store event handlers for cleanup in a single object
  const eventHandlers = {
    clickOutside: null,
    keydown: null,
    headerMouseDown: null,
    currentDrag: null
  };

  // Setup drag functionality on header
  eventHandlers.headerMouseDown = (e) => {
    if (e.button !== 0) return; // Only left mouse button

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseInt(popup.style.left, margin);
    const startTop = parseInt(popup.style.top, margin);

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;

      // Use helper function to constrain position
      const { left, top } = constrainPosition(newLeft, newTop);

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
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
  headerElem.addEventListener('mousedown', eventHandlers.headerMouseDown);
  headerElem.style.cursor = 'move';

  // Setup event handlers for closing popup
  const hidePopup = (e) => {
    if (e && e.type === 'keydown' && e.key !== 'Escape') return;

    // Remove all event listeners
    if (eventHandlers.clickOutside) {
      document.removeEventListener('click', eventHandlers.clickOutside);
    }
    if (eventHandlers.keydown) {
      document.removeEventListener('keydown', eventHandlers.keydown);
    }
    if (eventHandlers.headerMouseDown) {
      headerElem.removeEventListener('mousedown', eventHandlers.headerMouseDown);
    }
    if (eventHandlers.currentDrag) {
      document.removeEventListener('mousemove', eventHandlers.currentDrag.onMouseMove);
      document.removeEventListener('mouseup', eventHandlers.currentDrag.onMouseUp);
    }

    popup.remove();
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

  requestAnimationFrame(() => {
    document.addEventListener('click', eventHandlers.clickOutside);
    document.addEventListener('keydown', eventHandlers.keydown);
  });
}