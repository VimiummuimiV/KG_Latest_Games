import { createCustomTooltip, hideTooltipElement } from './tooltip.js';
import { createElement } from './utils.js';
import { visibilities, timeouts, ranks } from './definitions.js';
import { icons } from './icons.js';
import { setupPopupDrag } from './drag/popupDrag.js';

const visibilityTypes = Object.keys(visibilities);

const RANK_CONSTRAINTS = {
  minFrom: 0,
  maxFrom: 5,
  minTo: 5,
  maxTo: 8
};

const AUTO_SAVE_DEBOUNCE_MS = 500;

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
  '.popup-header-qualification',
  '.popup-header-save'
];

/**
 * Clamp index to allowed range based on handle type
 */
function clampIndex(idx, isMinHandle) {
  return isMinHandle
    ? Math.max(RANK_CONSTRAINTS.minFrom, Math.min(RANK_CONSTRAINTS.maxFrom, idx))
    : Math.max(RANK_CONSTRAINTS.minTo, Math.min(RANK_CONSTRAINTS.maxTo, idx));
}

export function createGamePopup(game, event, main, className = 'game-popup') {
  hideTooltipElement();

  const existingPopup = document.querySelector(`.${className}`);
  existingPopup && existingPopup.remove();

  const popup = createElement('div', { className });
  const header = createElement('div', { className: 'popup-header' });
  const headerTitle = createElement('div', {
    className: 'popup-header-title',
    textContent: main.saveModeEnabled ? 'Сохранить' : 'Создать'
  });

  const headerControls = createElement('div', {
    className: 'popup-header-controls'
  });

  const qualification = createElement('span', {
    className: 'popup-header-qualification',
    innerHTML: icons.qualification
  });

  const save = createElement('span', {
    className: 'popup-header-save',
    innerHTML: icons.save
  });

  // Initialize state from SettingsManager or game params from button based on save mode
  let saveModeEnabled = main.saveModeEnabled ?? false;
  let qualificationEnabled = saveModeEnabled ? (game.params.qual === 1) : (main.qualificationEnabled ?? false);
  let [minIdx, maxIdx] = saveModeEnabled 
    ? [
        clampIndex((game.params.level_from || 1) - 1, true),
        clampIndex((game.params.level_to || 9) - 1, false)
      ]
    : (main.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo]);

  // Ensure valid range
  if (minIdx > maxIdx) minIdx = maxIdx;
  if (maxIdx < minIdx) maxIdx = minIdx;

  let autoSaveTimer = null;
  const buttonRefs = [];

  const performSave = () => {
    const isRangeModified = minIdx !== RANK_CONSTRAINTS.minFrom || maxIdx !== RANK_CONSTRAINTS.maxTo;
    game.params.level_from = isRangeModified ? minIdx + 1 : game.params.level_from;
    game.params.level_to = isRangeModified ? maxIdx + 1 : game.params.level_to;
    game.params.qual = qualificationEnabled ? 1 : 0;

    main.gamesManager.saveGameData();
    main.uiManager?.refreshContainer?.();

    save.classList.remove('rg-rotate');
    void save.offsetWidth;
    save.classList.add('rg-rotate');
  };

  const triggerAutoSave = () => {
    if (!saveModeEnabled) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(performSave, AUTO_SAVE_DEBOUNCE_MS);
  };

  const updateQualUI = () => {
    qualification.classList.toggle('latest-games-disabled', !qualificationEnabled);
    createCustomTooltip(qualification, `Квалификация ${qualificationEnabled ? 'включена' : 'выключена'}`);
  };

  const updateSaveModeUI = () => {
    save.classList.toggle('latest-games-disabled', !saveModeEnabled);
    headerTitle.textContent = saveModeEnabled ? 'Сохранить' : 'Создать';
    createCustomTooltip(save, `Сохранение ${saveModeEnabled ? 'включено' : 'отключено'}`);
  };

  updateQualUI();
  updateSaveModeUI();

  qualification.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    qualificationEnabled = !qualificationEnabled;
    // Only update global settings when not in save mode
    if (!saveModeEnabled) {
      main.qualificationEnabled = qualificationEnabled;
      main.settingsManager.saveSettings();
    }
    updateQualUI();
    updateButtonLinks();
    triggerAutoSave();
  });

  // Dual-range slider
  const rankSliderContainer = createElement('div', { className: 'rank-slider-container' });
  const sliderTrack = createElement('div', { className: 'rank-slider-track' });
  const sliderRange = createElement('div', { className: 'rank-slider-range' });
  const sliderHandles = [
    createElement('div', { className: 'rank-slider-handle', tabIndex: 0 }),
    createElement('div', { className: 'rank-slider-handle', tabIndex: 0 })
  ];
  const rankDisplay = createElement('div', { className: 'rank-slider-display' });

  function updateSliderUI() {
    minIdx = clampIndex(minIdx, true);
    maxIdx = clampIndex(maxIdx, false);
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
          level_to: isRangeModified ? maxIdx + 1 : game.params.level_to,
          qual: qualificationEnabled ? 1 : 0
        }
      };

      const link = main.gamesManager.generateGameLink(modifiedGame);
      btn.setAttribute('href', link);
      btn.onclick = (e) => {
        e.preventDefault();
        if (saveModeEnabled) {
          clearTimeout(autoSaveTimer);
          // Always update all params when clicking in save mode
          game.params.type = type;
          game.params.timeout = timeout;
          game.params.level_from = minIdx + 1;
          game.params.level_to = maxIdx + 1;
          game.params.qual = qualificationEnabled ? 1 : 0;
          performSave();
        } else {
          // Just navigate to create game, don't change any settings
          window.location.href = link;
        }
      };
    });
  }

  function saveRange() {
    main.rankRange = [minIdx, maxIdx];
    main.settingsManager.saveSettings();
    triggerAutoSave();
  }

  save.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveModeEnabled = !saveModeEnabled;
    main.saveModeEnabled = saveModeEnabled;
    main.settingsManager.saveSettings();
    updateSaveModeUI();
    
    // Sync UI to appropriate source when toggling
    if (saveModeEnabled) {
      // Switching to save mode: load from button params
      qualificationEnabled = game.params.qual === 1;
      minIdx = clampIndex((game.params.level_from || 1) - 1, true);
      maxIdx = clampIndex((game.params.level_to || 9) - 1, false);
    } else {
      // Switching to select mode: load from settings
      qualificationEnabled = main.qualificationEnabled ?? false;
      [minIdx, maxIdx] = main.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo];
    }
    
    if (minIdx > maxIdx) minIdx = maxIdx;
    if (maxIdx < minIdx) maxIdx = minIdx;
    
    updateQualUI();
    updateSliderUI();
  });

  headerControls.append(qualification, save);
  header.append(headerTitle, headerControls);
  popup.appendChild(header);

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

        const newVal = i === 0 ? Math.min(idx, maxIdx) : Math.max(idx, minIdx);

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
      if (type === 'normal' && timeout === 5) return;

      const isRangeModified = minIdx !== RANK_CONSTRAINTS.minFrom || maxIdx !== RANK_CONSTRAINTS.maxTo;
      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type,
          timeout,
          level_from: isRangeModified ? minIdx + 1 : game.params.level_from,
          level_to: isRangeModified ? maxIdx + 1 : game.params.level_to,
          qual: qualificationEnabled ? 1 : 0
        }
      };

      const link = main.gamesManager.generateGameLink(modifiedGame);
      const btn = createElement('a', {
        href: link,
        className: 'game-popup-button',
        textContent: timeout
      });

      buttonRefs.push({ btn, type, timeout });
      typeButtonsContainer.appendChild(btn);
    });

    popup.appendChild(typeButtonsContainer);
  });

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