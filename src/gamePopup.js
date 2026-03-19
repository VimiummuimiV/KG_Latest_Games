import { createCustomTooltip, hideTooltipElement } from './tooltip.js';
import { createElement } from './utils.js';
import { visibilities, timeouts, idleTimes, ranks } from './definitions.js';
import { icons } from './icons.js';
import { setupPopupDrag } from './drag/popupDrag.js';

const visibilityTypes = Object.keys(visibilities);

const RANK_CONSTRAINTS = {
  minFrom: 1,
  maxFrom: 6,
  minTo: 6,
  maxTo: 9
};

const AUTO_SAVE_DEBOUNCE_MS = 500;

const DRAGGABLE_SELECTORS = [
  '.popup-header',
  '.popup-header-title',
  '.popup-subheader',
  '.rank-slider-display',
  '.idle-times-container',
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
 * Clamp rank number (1-9) to allowed range based on handle type
 */
function clampRank(rank, isMinHandle) {
  return isMinHandle
    ? Math.max(RANK_CONSTRAINTS.minFrom, Math.min(RANK_CONSTRAINTS.maxFrom, rank))
    : Math.max(RANK_CONSTRAINTS.minTo, Math.min(RANK_CONSTRAINTS.maxTo, rank));
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
  let [minRank, maxRank] = saveModeEnabled 
    ? [
        clampRank(game.params.level_from || 1, true),
        clampRank(game.params.level_to || 9, false)
      ]
    : (main.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo]);

  // Ensure valid range
  if (minRank > maxRank) minRank = maxRank;
  if (maxRank < minRank) maxRank = minRank;

  let autoSaveTimer = null;
  let selectedIdleTime = saveModeEnabled ? (game.params.idletime || 0) : 0;
  const buttonRefs = [];

  const performSave = () => {
    game.params.level_from = minRank;
    game.params.level_to = maxRank;
    game.params.qual = qualificationEnabled ? 1 : 0;
    game.params.idletime = selectedIdleTime;

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
    minRank = clampRank(minRank, true);
    maxRank = clampRank(maxRank, false);
    if (minRank > maxRank) minRank = maxRank;
    if (maxRank < minRank) maxRank = minRank;

    const percent1 = ((minRank - 1) / (ranks.length - 1)) * 100;
    const percent2 = ((maxRank - 1) / (ranks.length - 1)) * 100;

    sliderHandles[0].style.left = percent1 + '%';
    sliderHandles[1].style.left = percent2 + '%';
    sliderRange.style.left = percent1 + '%';
    sliderRange.style.width = (percent2 - percent1) + '%';

    rankDisplay.textContent = ranks[minRank - 1] + (minRank === maxRank ? '' : ' — ' + ranks[maxRank - 1]);

    // Handle overlap state
    const isOverlap = minRank === maxRank;
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
    // Safety check: don't run if buttons haven't been created yet
    if (buttonRefs.length === 0) {
      return;
    }
    
    buttonRefs.forEach(({ btn, type, timeout }) => {
      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type,
          timeout,
          level_from: minRank,
          level_to: maxRank,
          qual: qualificationEnabled ? 1 : 0,
          idletime: selectedIdleTime
        }
      };

      const link = main.gamesManager.generateGameLink(modifiedGame);
      btn.setAttribute('href', link);
      
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (saveModeEnabled) {
          clearTimeout(autoSaveTimer);
          // Always update all params when clicking in save mode
          game.params.type = type;
          game.params.timeout = timeout;
          game.params.level_from = minRank;
          game.params.level_to = maxRank;
          game.params.qual = qualificationEnabled ? 1 : 0;
          game.params.idletime = selectedIdleTime;
          performSave();
        } else {
          // Just navigate to create game, don't change any settings
          window.location.href = link;
        }
      };
    });
  }

  function saveRange() {
    if (!saveModeEnabled) {
      main.rankRange = [minRank, maxRank];
      main.settingsManager.saveSettings();
    }
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
      minRank = clampRank(game.params.level_from || 1, true);
      maxRank = clampRank(game.params.level_to || 9, false);
    } else {
      // Switching to select mode: load from settings
      qualificationEnabled = main.qualificationEnabled ?? false;
      [minRank, maxRank] = main.rankRange || [RANK_CONSTRAINTS.minFrom, RANK_CONSTRAINTS.maxTo];
    }
    
    if (minRank > maxRank) minRank = maxRank;
    if (maxRank < minRank) maxRank = minRank;
    
    updateQualUI();
    updateSliderUI();
    updateButtonLinks();
  });

  headerControls.append(qualification, save);
  header.append(headerTitle, headerControls);
  popup.appendChild(header);

  sliderTrack.addEventListener('click', (e) => {
    const rect = sliderTrack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    let rank = Math.round(percent * (ranks.length - 1)) + 1;

    // Determine which handle to move based on proximity
    if (Math.abs(rank - minRank) < Math.abs(rank - maxRank)) {
      minRank = Math.min(clampRank(rank, true), maxRank);
    } else {
      maxRank = Math.max(clampRank(rank, false), minRank);
    }

    updateSliderUI();
    saveRange();
  });

  // Handle dragging
  sliderHandles.forEach((handle, i) => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      let prev = i === 0 ? minRank : maxRank;

      const onMove = ({ clientX }) => {
        const { left, width } = sliderTrack.getBoundingClientRect();
        let rank = Math.round(((clientX - left) / width) * (ranks.length - 1)) + 1;
        rank = clampRank(rank, i === 0);

        const newVal = i === 0 ? Math.min(rank, maxRank) : Math.max(rank, minRank);

        if (newVal !== prev) {
          prev = newVal;
          if (i === 0) minRank = newVal;
          else maxRank = newVal;
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

  // Create idle times section
  const idleTimesHeader = createElement('div', {
    className: 'popup-subheader',
    textContent: 'AFK'
  });
  popup.appendChild(idleTimesHeader);

  const idleTimesContainer = createElement('div', { className: 'idle-times-container' });

  idleTimes.forEach(idleTime => {
    const idleTimeBtn = createElement('a', {
      href: '#',
      className: 'game-popup-button',
      textContent: idleTime
    });

    if (idleTime === selectedIdleTime) {
      idleTimeBtn.classList.add('active');
    }

    idleTimeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove active class from all idle time buttons
      idleTimesContainer.querySelectorAll('.game-popup-button').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // Add active class to selected button
      idleTimeBtn.classList.add('active');
      selectedIdleTime = idleTime;
      updateButtonLinks();
      triggerAutoSave();
    };

    idleTimesContainer.appendChild(idleTimeBtn);
  });

  popup.appendChild(idleTimesContainer);

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

      const modifiedGame = {
        ...game,
        params: {
          ...game.params,
          type,
          timeout,
          level_from: minRank,
          level_to: maxRank,
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

  updateSliderUI();

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