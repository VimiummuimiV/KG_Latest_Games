import { createCustomTooltip, hideTooltipElement } from './tooltip.js';
import { createElement } from './utils.js';
import { visibilities, timeouts, ranks } from './definitions.js';
import { icons } from './icons.js';
import { setupPopupDrag } from './drag/popupDrag.js';

const visibilityTypes = Object.keys(visibilities);

// Configuration for rank slider constraints
const RANK_CONSTRAINTS = {
  minFrom: 0, // level_from 1-6 (indices 0-5)
  maxFrom: 5,
  minTo: 5, // level_to 6-9 (indices 5-8)  
  maxTo: 8
};

// Draggable and interactive selectors for this popup
const DRAGGABLE_SELECTORS = [
  '.popup-header',
  '.popup-header-title',
  '.popup-subheader',
  '.rank-slider-display',
  '.timeouts-container'
];

const INTERACTIVE_SELECTORS = [
  '.game-popup-button',
  '.rank-slider-handle',
  '.rank-slider-track',
  '.rank-slider-range',
  '.popup-header-qualification'
];

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
 * @param {Object} main - The main LatestGamesManager instance
 * @param {string} className - CSS class name for the popup (default: 'game-popup')
 * @returns {HTMLElement} The created popup element
 */
export function createGamePopup(game, event, main, className = 'game-popup') {
  hideTooltipElement(); // Hide any existing tooltip

  const existingPopup = document.querySelector(`.${className}`);
  existingPopup && existingPopup.remove();

  const popup = createElement('div', { className });

  const header = createElement('div', { className: 'popup-header' });

  const headerTitle = createElement('div', {
    className: 'popup-header-title',
    textContent: 'Выбрать'
  });

  const qualification = createElement('span', {
    className: 'popup-header-qualification',
    innerHTML: icons.qualification
  });

  // Set qualification visibility based on qualification setting
  let qualificationEnabled = main.qualificationEnabled ?? false;
  qualification.classList.toggle('latest-games-disabled', !qualificationEnabled);
  createCustomTooltip(qualification, `Квалификация ${qualificationEnabled ? 'включена' : 'выключена'}`);

  // Add click handler for qualification toggle
  qualification.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    qualificationEnabled = !qualificationEnabled;
    main.qualificationEnabled = qualificationEnabled;
    main.settingsManager.saveSettings();

    qualification.classList.toggle('latest-games-disabled', !qualificationEnabled);
    createCustomTooltip(qualification, `Квалификация ${qualificationEnabled ? 'включена' : 'выключена'}`);

    // Update all button links with new qualification setting
    updateButtonLinks();
  });

  header.append(headerTitle, qualification);
  popup.appendChild(header);

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
  let [minIdx, maxIdx] = main.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo];
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

      // Add qualification parameter if enabled
      if (qualificationEnabled) {
        modifiedGame.params.qual = 1;
      }

      const link = main.gamesManager.generateGameLink(modifiedGame);
      btn.setAttribute('href', link);
      btn.onclick = (e) => {
        e.preventDefault();
        window.location.href = link;
      };
    });
  }

  function saveRange() {
    main.rankRange = [minIdx, maxIdx];
    main.settingsManager.saveSettings();
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

      // Add qualification parameter if enabled
      if (qualificationEnabled) {
        modifiedGame.params.qual = 1;
      }

      const link = main.gamesManager.generateGameLink(modifiedGame);
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

  // Setup popup positioning, drag functionality, and event handlers
  setupPopupPositioning(popup, event);

  return popup;
}

/**
 * Handle popup positioning and tooltip setup, then delegate drag functionality
 */
function setupPopupPositioning(popup, event) {
  // Add tooltips for truncated links
  popup.querySelectorAll('a').forEach(a => {
    if (a.scrollWidth > a.clientWidth) {
      createCustomTooltip(a, a.textContent);
    }
  });

  // Setup drag functionality with specific selectors for this popup
  setupPopupDrag(popup, event, {
    draggableSelectors: DRAGGABLE_SELECTORS,
    interactiveSelectors: INTERACTIVE_SELECTORS
  });
}