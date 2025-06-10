import { icons } from './icons.js';
import './styles.scss';
import { generateRandomId, sleep, createElement } from './utils.js';
import { parseGameParams, generateGameName, generateGameLink } from './gameUtils.js';
import { highlightExistingVocabularies } from './vocabularyChecker.js';
import { showMigrationPopup } from './vocabularyMigration.js';
import { attachVocabularyCreation } from './vocabularyCreation.js';
import { createCustomTooltip } from './tooltip.js';
import { createGamePopup } from './gamePopup.js';
import { addDragFunctionality } from './drag.js';
import { attachVocabularyParser } from './vocabularyParser.js';
import { setupFonts } from './font.js';
import { DEFAULTS } from './definitions.js';

// Managers
import { ThemeManager } from './managers/ThemeManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { GroupsManager } from './managers/GroupsManager.js';

class LatestGamesManager {
  constructor() {
    this.initializeDefaults();
    this.initializeManagers();
    this.init();
  }

  initializeDefaults() {
    Object.assign(this, DEFAULTS);
  }

  initializeManagers() {
    this.themeManager = new ThemeManager(this);
    this.settingsManager = new SettingsManager(this);
    this.groupsManager = new GroupsManager(this);
  }

  init() {
    this.settingsManager.loadSettings();
    this.loadGameData();
    this.groupsManager.initializeGroups();
    this.createHoverArea();
    this.createContainer();
    this.alwaysVisiblePanel && this.showContainer();
    this.createPanelToggleButton();
    this.handlePageSpecificLogic();
    this.exposeGlobalFunctions();
    this.themeManager.applyTheme();
  }

  createDisplayModeToggle() {
    const toggleButton = createElement('div', {
      className: 'display-mode-toggle control-button'
    });
    toggleButton.innerHTML = this.displayMode === 'wrap' ? icons.wrap : icons.scroll;
    createCustomTooltip(toggleButton, this.displayMode === 'wrap'
      ? 'Переключить режим отображения в вертикальный вид'
      : 'Переключить режим отображения в горизонтальный вид');

    toggleButton.addEventListener('click', () => {
      const newMode = this.getDisplayMode() === 'scroll' ? 'wrap' : 'scroll';
      this.setDisplayMode(newMode);
      this.updateDisplayModeIcon(toggleButton, newMode);
      this.updateDisplayModeClass();
      createCustomTooltip(toggleButton, newMode === 'wrap'
        ? 'Переключить режим отображения в вертикальный вид'
        : 'Переключить режим отображения в горизонтальный вид');
      if (newMode === 'scroll') {
        const c = document.getElementById('latest-games-container');
        if (c) setTimeout(() => c.scrollTop = c.scrollHeight, 0);
      }
    });
    return toggleButton;
  }

  updateDisplayModeIcon(toggleButton, mode) {
    toggleButton.innerHTML = mode === 'wrap' ? icons.wrap : icons.scroll;
  }

  getDisplayMode() {
    return this.displayMode;
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    this.settingsManager.saveSettings();
  }

  updateDisplayModeClass() {
    const container = document.getElementById('latest-games-container');
    const gamesList = document.getElementById('latest-games');
    if (!container || !gamesList) return;
    const mode = this.getDisplayMode();
    container.classList.toggle('display-mode-wrap', mode === 'wrap');
    gamesList.classList.toggle('display-mode-wrap', mode === 'wrap');
    this.updateContainerLeftOffset();
  }

  updateContainerLeftOffset() {
    const container = document.getElementById('latest-games-container');
    if (!container) return;
    const mode = this.getDisplayMode();
    if (mode === 'wrap') {
      container.style.left = 'calc(-1 * (100vw - 100px))';
    } else {
      container.style.left = '-330px';
    }
  }

  createGameElement(game, id) {
    const gametypeClass = game.pin ? ` pin-gametype-${game.params.gametype}` : '';
    const li = createElement('li', {
      className: `latest-game${game.pin ? ' pin-game' : ''}${gametypeClass}`,
      id: `latest-game-${id}`
    });
    const buttons = createElement('div', { className: 'latest-game-buttons' });
    const pinButton = createElement('div', {
      className: 'latest-game-pin',
      innerHTML: icons.pin
    });
    createCustomTooltip(pinButton, game.pin ? 'Открепить' : 'Закрепить');
    pinButton.addEventListener('click', () => this.pinGame(id));

    const deleteButton = createElement('div', {
      className: 'latest-game-delete',
      innerHTML: icons.delete
    });
    createCustomTooltip(deleteButton, 'Удалить');
    deleteButton.addEventListener('click', () => this.deleteGame(id));

    buttons.appendChild(pinButton);
    buttons.appendChild(deleteButton);

    const link = createElement('a', {
      href: generateGameLink(game),
      innerHTML: generateGameName(game)
    });

    link.addEventListener('click', (e) => {
      if (this.wasDragging) {
        e.preventDefault();
        this.wasDragging = false;
      }
    });
    createCustomTooltip(link, `
      [Клик] Перейти к игре с текущими параметрами
      [Shift + Клик] Перейти к игре с альтернативными параметрами
      [Удерживание (ЛКМ)] аналогично (Shift + Клик)
    `);

    li.appendChild(buttons);
    li.appendChild(link);
    if (game.pin && this.enableDragging) addDragFunctionality(this, li);
    return li;
  }

  createControls() {
    const controlsContainer = createElement('div', { className: 'latest-games-controls' });
    const controlsLimiter = createElement('div', { className: 'controls-limiter' });
    const controlsButtons = createElement('div', { className: 'controls-buttons' });
    controlsContainer.append(controlsLimiter, controlsButtons);

    const options = createElement('span', { id: 'latest-games-options' });
    const decreaseBtn = createElement('span', {
      id: 'latest-games-count-dec',
      className: 'control-button',
      innerHTML: icons.decrease
    });
    createCustomTooltip(decreaseBtn, 'Уменьшить количество сохраняемых игр');

    const countDisplay = createElement('span', {
      id: 'latest-games-count',
      className: this.shouldAutoSave === false ? 'latest-games-disabled' : '',
      textContent: this.maxGameCount.toString()
    });
    createCustomTooltip(countDisplay, this.shouldAutoSave ? 'Автосохранение включено' : 'Автосохранение отключено');

    countDisplay.addEventListener('click', () => {
      this.shouldAutoSave = !this.shouldAutoSave;
      this.updateGameCountDisplay();
      this.settingsManager.saveSettings();
      this.refreshContainer();
    });

    const increaseBtn = createElement('span', {
      id: 'latest-games-count-inc',
      className: 'control-button',
      innerHTML: icons.increase
    });
    createCustomTooltip(increaseBtn, 'Увеличить количество сохраняемых игр');

    decreaseBtn.addEventListener('click', () => this.changeGameCount(-1));
    increaseBtn.addEventListener('click', () => this.changeGameCount(1));

    options.append(decreaseBtn, countDisplay, increaseBtn);

    // Helper function to update tooltip (using your preferred format)
    const updateTooltip = (button, isEnabled, enabledText, disabledText, delay, delayText) => {
      createCustomTooltip(button, `
        [Клик] ${isEnabled ? enabledText : disabledText}
        [Shift + Клик] ${delayText + (delay ? ` (${delay} мс)` : '')}
      `);
    };

    // Helper function to create control button with click handler
    const setupControlButton = (button, context, property, delayProperty, texts) => {
      const { enabledText, disabledText, delayText, delayPromptText, delayErrorText } = texts;

      // Set initial state
      const isInitiallyEnabled = context[property];
      button.classList.toggle('latest-games-disabled', !isInitiallyEnabled);
      updateTooltip(button, isInitiallyEnabled, enabledText, disabledText, context[delayProperty], delayText);

      // Add click handler
      button.onclick = (e) => {
        if (e.shiftKey) {
          const newDelay = prompt(delayPromptText, "");
          if (newDelay !== null) {
            const delayValue = parseInt(newDelay, 10);
            if (!isNaN(delayValue) && delayValue >= 0) {
              context[delayProperty] = delayValue;
              this.settingsManager.saveSettings();
              updateTooltip(button, context[property], enabledText, disabledText, delayValue, delayText);
            } else {
              alert(delayErrorText);
            }
          }
        } else {
          context[property] = !context[property];
          this.settingsManager.saveSettings();
          button.classList.toggle('latest-games-disabled', !context[property]);
          updateTooltip(button, context[property], enabledText, disabledText, context[delayProperty], delayText);
        }
      };
    };

    // Create play button
    const playBtn = createElement('span', {
      className: 'latest-games-play control-button',
      innerHTML: icons.play
    });

    setupControlButton(playBtn, this, 'shouldStart', 'startDelay', {
      enabledText: 'Отключить автозапуск игры',
      disabledText: 'Включить автозапуск игры',
      delayText: 'Изменить задержку запуска в миллисекундах',
      delayPromptText: 'Введите задержку запуска в миллисекундах:',
      delayErrorText: 'Пожалуйста, введите корректное значение задержки запуска.'
    });

    // Create replay button
    const replayBtn = createElement('span', {
      className: 'latest-games-replay control-button',
      innerHTML: icons.replay
    });

    setupControlButton(replayBtn, this, 'shouldReplay', 'replayDelay', {
      enabledText: 'Отключить автоповтор игры',
      disabledText: 'Включить автоповтор игры',
      delayText: 'Изменить задержку автоповтора в миллисекундах',
      delayPromptText: 'Введите задержку автоповтора в миллисекундах:',
      delayErrorText: 'Пожалуйста, введите корректное значение задержки автоповтора.'
    });

    const pinAllBtn = createElement('span', {
      className: 'latest-games-pinall control-button',
      innerHTML: icons.pinAll
    });
    createCustomTooltip(pinAllBtn, `
      [Клик] Закрепить все игры в текущей группе
      [Shift + Клик] Закрепить все игры во всех группах
    `);
    pinAllBtn.onclick = (e) => {
      if (e.shiftKey) {
        // Shift + Click: Pin all games in all groups
        this.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 1));
      } else {
        // Single Click: Pin all games only in current group
        const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games.forEach(game => game.pin = 1);
        }
      }
      this.saveGameData();
      this.refreshContainer();
    };

    const unpinAllBtn = createElement('span', {
      className: 'latest-games-unpinall control-button',
      innerHTML: icons.unpinAll
    });
    createCustomTooltip(unpinAllBtn, `
      [Клик] Открепить все игры в текущей группе
      [Shift + Клик] Открепить все игры во всех группах
    `);
    unpinAllBtn.onclick = (e) => {
      if (e.shiftKey) {
        // Shift + Click: Unpin all games in all groups
        this.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 0));
      } else {
        // Single Click: Unpin games only in current group
        const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games.forEach(game => game.pin = 0);
        }
      }
      this.saveGameData();
      this.refreshContainer();
    };

    const sortBtn = createElement('span', {
      className: 'latest-games-sort control-button',
      innerHTML: icons.sort
    });
    createCustomTooltip(sortBtn, 'Сортировать игры в текущей группе по алфавиту');
    sortBtn.addEventListener('click', () => this.sortCurrentGroupGames());

    const importBtn = createElement('span', {
      className: 'latest-games-import control-button',
      innerHTML: icons.import
    });
    createCustomTooltip(importBtn, 'Импортировать настройки из JSON файла');
    importBtn.onclick = async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (typeof data === 'object' && data !== null) {
            if (data.latestGamesSettings) localStorage.setItem('latestGamesSettings', JSON.stringify(data.latestGamesSettings));
            if (data.latestGamesData) localStorage.setItem('latestGamesData', JSON.stringify(data.latestGamesData));
            this.settingsManager.loadSettings();
            this.loadGameData();
            this.refreshContainer();
            this.themeManager.applyTheme();
          } else {
            alert('Файл не содержит валидный JSON настроек.');
          }
        } catch (err) {
          alert('Ошибка при импорте: ' + err);
        }
      };
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 1000);
    };

    const exportBtn = createElement('span', {
      className: 'latest-games-export control-button',
      innerHTML: icons.export
    });
    createCustomTooltip(exportBtn, 'Экспортировать все настройки в JSON файл');
    exportBtn.onclick = () => {
      const all = {
        latestGamesSettings: JSON.parse(localStorage.getItem('latestGamesSettings') || '{}'),
        latestGamesData: { groups: this.groupsManager.groups, currentGroupId: this.groupsManager.currentGroupId }
      };
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kg-latest-games-settings.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
    };

    const removeAllBtn = createElement('span', {
      className: 'latest-games-removeall control-button',
      innerHTML: icons.trashNothing
    });
    createCustomTooltip(removeAllBtn, 'Удалить все настройки');
    removeAllBtn.onclick = () => {
      localStorage.removeItem('latestGamesSettings');
      localStorage.removeItem('latestGamesData');
      this.groupsManager.groups = [this.groupsManager.createGroup('Группа-1')];
      this.groupsManager.currentGroupId = this.groupsManager.groups[0].id;
      this.saveGameData();
      this.refreshContainer();
    };

    const removeUnpinnedBtn = createElement('span', {
      className: 'latest-games-remove-unpinned control-button',
      innerHTML: icons.broom
    });
    createCustomTooltip(removeUnpinnedBtn, `
      [Клик] Удалить все незакреплённые игры в текущей группе
      [Shift + Клик] Удалить все незакреплённые игры во всех группах
    `);

    removeUnpinnedBtn.onclick = (e) => {
      if (e.shiftKey) {
        // Shift + Click: Remove unpinned games from all groups
        this.groupsManager.groups.forEach(group => {
          group.games = group.games.filter(game => game.pin);
        });
      } else {
        // Click: Remove unpinned games only from current group
        const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games = currentGroup.games.filter(game => game.pin);
        }
      }
      this.saveGameData();
      this.refreshContainer();
    };

    const dragToggleBtn = createElement('span', {
      className: 'latest-games-drag-toggle control-button',
      innerHTML: icons.dragToggle
    });
    createCustomTooltip(dragToggleBtn, this.enableDragging ? 'Перетаскивание включено' : 'Перетаскивание отключено');
    dragToggleBtn.classList.toggle('latest-games-disabled', !this.enableDragging);

    dragToggleBtn.onclick = () => {
      this.enableDragging = !this.enableDragging;
      this.settingsManager.saveSettings();
      this.refreshContainer();
      createCustomTooltip(dragToggleBtn, this.enableDragging ? 'Перетаскивание включено' : 'Перетаскивание отключено');
      dragToggleBtn.classList.toggle('latest-games-disabled', !this.enableDragging);
    };

    controlsLimiter.appendChild(options);
    controlsButtons.append(
      this.themeManager.createThemeToggle(),
      this.createDisplayModeToggle(),
      playBtn, replayBtn, pinAllBtn, unpinAllBtn, sortBtn, importBtn, exportBtn, removeAllBtn, removeUnpinnedBtn, dragToggleBtn
    );

    return controlsContainer;
  }

  updateContainerYPosition() {
    const container = document.getElementById('latest-games-container');
    if (!container) return;
    container.style.top = this.getDisplayMode() === 'wrap' ? `${this.panelYPosition}vh` : '';
  }

  createContainer() {
    const container = createElement('div', { id: 'latest-games-container' });
    const groupsContainer = this.groupsManager.createGroupsContainer();

    container.appendChild(groupsContainer);
    const gamesList = createElement('ul', { id: 'latest-games' });

    this.populateGamesList(gamesList);
    container.appendChild(gamesList);
    const controls = this.createControls();
    container.appendChild(controls);

    container.addEventListener('scroll', () => {
      this.previousScrollPosition = container.scrollTop;
      this.settingsManager.saveSettings();
    });

    container.addEventListener('mouseenter', () => this.showContainer());
    container.addEventListener('mouseleave', () => this.hideContainer());

    let longPressTimer = null;
    let suppressClick = false;

    const showGamePopup = (e) => {
      const gameElement = e.target.closest('.latest-game');
      if (!gameElement) return;
      const gameId = gameElement.id.replace('latest-game-', '');
      const game = this.findGameById(gameId);
      if (game && !this.enableDragging) createGamePopup(game, e); // Show popup only if dragging is disabled
    };

    gamesList.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left button

      if (e.shiftKey) {
        // Immediate Shift+press
        suppressClick = true;
        e.preventDefault();
        showGamePopup(e);
      } else {
        // Start long-press timer
        longPressTimer = setTimeout(() => {
          suppressClick = true;
          e.preventDefault();
          showGamePopup(e);
        }, 300);
      }
    });

    gamesList.addEventListener('mouseup', () => {
      clearTimeout(longPressTimer);
    });

    // Capture-phase click listener to block the “click” after a long press or Shift press
    gamesList.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopImmediatePropagation(); // Prevent any further click handling
        e.preventDefault(); // Prevent default action
        suppressClick = false;
      }
    }, { capture: true });

    // Add context menu event listener
    gamesList.addEventListener('contextmenu', (e) => {
      const gameElement = e.target.closest('.latest-game');
      if (gameElement) {
        e.preventDefault();
        const gameId = gameElement.id.replace('latest-game-', '');
        showMigrationPopup(this, this.groupsManager.groups, this.groupsManager.currentGroupId, e, gameId);
      }
    });

    let handle = container.querySelector('.resize-handle');
    if (!handle) {
      handle = createElement('div', { className: 'resize-handle' });
      container.appendChild(handle);
    }

    // Resize logic: only active in wrap mode
    const setupResizeHandle = () => {
      const mode = this.getDisplayMode();
      if (mode === 'wrap') {
        // Apply stored width
        container.style.width = this.panelWidth;
        handle.style.display = '';
        let isDragging = false, startX, startWidth;
        const onMouseMove = (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          let newWidthPx = startWidth + dx;
          // Prevent going beyond viewport and 95vw
          const maxPx = window.innerWidth * 0.95;
          newWidthPx = Math.max(350, Math.min(newWidthPx, maxPx));
          const newWidthVw = Math.round((newWidthPx / window.innerWidth) * 100 * 10) / 10;
          container.style.width = `${newWidthVw}vw`;
        };
        const onMouseUp = () => {
          if (!isDragging) return;
          isDragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          this.panelWidth = container.style.width;
          this.settingsManager.saveSettings();
        };
        handle.onmousedown = (e) => {
          if (e.button !== 0) return; // Only allow left mouse button
          isDragging = true;
          startX = e.clientX;
          startWidth = container.offsetWidth;
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          e.preventDefault();
        };
      } else {
        handle.style.display = 'none';
        container.style.width = '';
        handle.onmousedown = null;
      }
    };

    setupResizeHandle();

    const setupYPositioning = () => {
      const mode = this.getDisplayMode();
      if (mode === 'wrap') {
        this.updateContainerYPosition();
        let isDraggingY = false, startY, startTop;

        const onMouseMoveY = (e) => {
          if (!isDraggingY) return;
          const dy = e.clientY - startY;
          const newTopVh = startTop + (dy / window.innerHeight) * 100;

          // Calculate proper bounds: 0 at top, and bottom should leave container fully visible
          const containerHeight = container.offsetHeight;
          const maxTopVh = Math.max(0, ((window.innerHeight - containerHeight) / window.innerHeight) * 100);

          const clampedTopVh = Math.max(0, Math.min(newTopVh, maxTopVh));
          // Limit to one digit after the dot
          const roundedTopVh = Math.round(clampedTopVh * 10) / 10;
          container.style.top = `${roundedTopVh}vh`;
        };

        const onMouseUpY = () => {
          if (!isDraggingY) return;
          isDraggingY = false;
          document.removeEventListener('mousemove', onMouseMoveY);
          document.removeEventListener('mouseup', onMouseUpY);
          // Get the actual final position, and round so it has only one digit after the decimal point
          const finalRect = container.getBoundingClientRect();
          this.panelYPosition = Math.round(((finalRect.top / window.innerHeight) * 100) * 10) / 10;
          this.settingsManager.saveSettings();
        };

        const enableYDrag = (e) => {
          if (e.button !== 0) return; // Only allow left mouse button
          if (e.target.closest('.latest-game, .group-tab, .control-button, .resize-handle')) return;
          isDraggingY = true;
          startY = e.clientY;
          // FIX: Get the actual current position from the computed style or getBoundingClientRect
          const rect = container.getBoundingClientRect();
          startTop = (rect.top / window.innerHeight) * 100;
          document.addEventListener('mousemove', onMouseMoveY);
          document.addEventListener('mouseup', onMouseUpY);
          e.preventDefault();
        };

        container.addEventListener('mousedown', enableYDrag);
      } else {
        container.style.top = '';
      }
    };

    setupYPositioning();

    document.body.appendChild(container);

    this.groupsManager.updateGroupControlStates();
    this.updateDisplayModeClass();
    // Add title to tabs if they are too wide
    const allTabs = container.querySelectorAll('.group-tab');
    allTabs.forEach(tab => {
      if (tab.getBoundingClientRect().width >= 300) {
        createCustomTooltip(tab, tab.textContent);
      }
    });

    // Patch updateDisplayModeClass to also update the handle
    const origUpdateDisplayModeClass = this.updateDisplayModeClass.bind(this);
    this.updateDisplayModeClass = (...args) => {
      origUpdateDisplayModeClass(...args);
      setupResizeHandle();
      setupYPositioning();
    };

    // Add updateRemoveIcons here, after everything is in the DOM
    this.updateRemoveIcons();

    // Apply saved scroll position after rendering
    container.scrollTop = this.previousScrollPosition;
  }

  updateGameCountDisplay() {
    const countDisplay = document.getElementById('latest-games-count');
    if (countDisplay) {
      countDisplay.textContent = this.maxGameCount.toString();
      countDisplay.classList.toggle('latest-games-disabled', this.shouldAutoSave === false);
      createCustomTooltip(countDisplay, this.shouldAutoSave ? 'Автосохранение включено' : 'Автосохранение отключено');
    }
  }

  loadGameData() {
    try {
      let data = localStorage.getItem('latestGamesData');
      if (data) {
        data = JSON.parse(data);
        if (Array.isArray(data)) {
          const groups = [{ id: generateRandomId(), title: 'Группа-1', games: data }];
          const currentGroupId = groups[0].id;
          this.groupsManager.setGroups(groups, currentGroupId);
        } else if (data && Array.isArray(data.groups)) {
          this.groupsManager.setGroups(data.groups, data.currentGroupId);
        } else {
          this.groupsManager.setGroups([], null);
        }
      } else {
        this.groupsManager.setGroups([], null);
      }
      this.migrateOldGameData();
      this.assignGameIds();
    } catch (error) {
      console.warn('Could not load game data from localStorage:', error);
      this.groupsManager.setGroups([], null);
    }
  }

  saveGameData() {
    try {
      const data = {
        groups: this.groupsManager.groups,
        currentGroupId: this.groupsManager.currentGroupId
      };
      localStorage.setItem('latestGamesData', JSON.stringify(data));
    } catch (error) {
      console.warn('Could not save game data to localStorage:', error);
    }
  }

  migrateOldGameData() {
    this.groupsManager.groups.forEach(group => {
      group.games = group.games.map(game => {
        if (game.params.qual === 'on' || game.params.qual === '') {
          game.params.qual = game.params.qual === 'on' ? 1 : 0;
        }
        return game;
      });
    });
  }

  assignGameIds() {
    const allGameIds = new Set(this.groupsManager.groups.flatMap(group => group.games.map(game => game.id)));
    this.groupsManager.groups.forEach(group => {
      group.games = group.games.map(game => {
        if (!game.id || game.id === -1 || allGameIds.has(game.id)) {
          let newId;
          do {
            newId = generateRandomId();
          } while (allGameIds.has(newId));
          allGameIds.add(newId);
          return { ...game, id: newId };
        } else {
          allGameIds.add(game.id);
          return game;
        }
      });
    });
  }

  updateGameOrderFromDOM() {
    const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
    if (!currentGroup) return;
    const gameElements = Array.from(document.querySelectorAll('#latest-games .latest-game'));
    currentGroup.games = gameElements.map(element => {
      const id = element.id.replace('latest-game-', '');
      return currentGroup.games.find(g => g.id === id);
    }).filter(game => game !== undefined);
    this.saveGameData();
  }

  createHoverArea() {
    const hoverArea = createElement('div', { id: 'latest-games-hover-area' });
    hoverArea.addEventListener('mouseenter', () => this.showContainer());
    hoverArea.addEventListener('mouseleave', () => this.hideContainer());
    document.body.appendChild(hoverArea);
  }

  populateGamesList(gamesList) {
    gamesList.innerHTML = '';

    if (this.groupsManager.getGroupViewMode() === 'tabs') {
      // In tabs mode, only show games for the current group, no headers
      const currentGroup = this.groupsManager.getCurrentGroup();
      if (!currentGroup) return;
      const pinnedCount = this.groupsManager.getPinnedGameCount();
      const maxGamesToShow = Math.min(currentGroup.games.length, this.maxGameCount + pinnedCount);
      for (let i = 0; i < maxGamesToShow; i++) {
        const game = currentGroup.games[i];
        const gameElement = this.createGameElement(game, game.id);
        gamesList.appendChild(gameElement);
      }
    } else {
      // In unified mode, show headers and games for all groups
      this.groupsManager.groups.forEach(group => {
        if (group.games.length > 0) {
          // Add group header to separate groups
          const groupHeader = this.groupsManager.createGroupHeader(group);
          gamesList.appendChild(groupHeader);
          const pinnedCount = group.games.filter(game => game.pin).length;
          const maxGamesToShow = Math.min(group.games.length, this.maxGameCount + pinnedCount);
          for (let i = 0; i < maxGamesToShow; i++) {
            const game = group.games[i];
            const gameElement = this.createGameElement(game, game.id);
            gamesList.appendChild(gameElement);
          }
        }
      });
    }
  }

  showContainer() {
    this.isHovered = true;
    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
    this.hoverTimeout = null;
    const container = document.getElementById('latest-games-container');
    if (container) {
      container.classList.add('visible');
      container.style.left = '0';
      // If mode is 'wrap', set the panel previous Y position
      if (this.getDisplayMode() === 'wrap') {
        container.style.top = `${this.panelYPosition}vh`;
      }
      container.scrollTop = this.previousScrollPosition;
    }
  }

  hideContainer() {
    if (this.alwaysVisiblePanel) return; // If alwaysVisiblePanel is true, do not hide
    this.isHovered = false;
    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
    this.hoverTimeout = setTimeout(() => {
      if (!this.isHovered) {
        const container = document.getElementById('latest-games-container');
        if (container) {
          container.classList.remove('visible');
          this.updateContainerLeftOffset();
        }
      }
    }, this.hidePanelDelay);
  }

  // Helper function to update the "trash" icons based on data
  updateRemoveIcons() {
    // Update the remove group icon inside group controls:
    const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
    const removeGroupBtn = document.querySelector('.group-controls .remove-group.control-button');
    if (removeGroupBtn) {
      removeGroupBtn.innerHTML =
        currentGroup && currentGroup.games && currentGroup.games.length > 0
          ? icons.trashSomething
          : icons.trashNothing;
    }
    // Update the remove all icon:
    const removeAllBtn = document.querySelector('.latest-games-removeall.control-button');
    // Here we consider the entire data: if any group has at least one game.
    const hasAnyData = this.groupsManager.groups.some(group => group.games && group.games.length > 0);
    if (removeAllBtn) {
      removeAllBtn.innerHTML = hasAnyData ? icons.trashSomething : icons.trashNothing;
    }
  }

  refreshContainer() {
    this.groupsManager.refreshGroupsContainer();
    const gamesList = document.getElementById('latest-games');
    if (gamesList) {
      this.populateGamesList(gamesList);
      this.updateDisplayModeClass();
    }
    this.groupsManager.updateRemoveIcons();
    this.updateGameCountDisplay();
  }

  findGameIndex(id) {
    for (const group of this.groupsManager.groups) {
      const index = group.games.findIndex(game => game.id == id);
      if (index !== -1) return { group, index };
    }
    return null;
  }

  findGameById(id) {
    for (const group of this.groupsManager.groups) {
      const game = group.games.find(g => g.id === id);
      if (game) return game;
    }
    return null;
  }

  deleteGame(id) {
    const result = this.findGameIndex(id);
    if (!result) return null;
    const { group, index } = result;
    const deletedGame = group.games.splice(index, 1)[0];
    this.assignGameIds();
    this.saveGameData();
    this.refreshContainer();

    return deletedGame;
  }

  pinGame(id) {
    const result = this.findGameIndex(id);
    if (!result) return;
    const { group, index } = result;
    const game = group.games[index];
    game.pin = game.pin ? 0 : 1;
    // Sort games: pinned (pin=1) first, unpinned (pin=0) after
    group.games.sort((a, b) => b.pin - a.pin);
    this.assignGameIds();
    this.saveGameData();
    this.refreshContainer();
  }

  saveCurrentGameParams() {
    const gameDesc = document.getElementById('gamedesc');
    if (!gameDesc) throw new Error('#gamedesc element not found.');
    const span = gameDesc.querySelector('span');
    if (!span) throw new Error('#gamedesc span element not found.');
    const descText = gameDesc.textContent;
    if (/соревнование/.test(descText) || !this.maxGameCount || this.shouldAutoSave === false) return false;
    const gameParams = parseGameParams(span, descText);
    const gameParamsString = JSON.stringify(gameParams);
    const currentGroup = this.groupsManager.getCurrentGroup(this.groupsManager.groups, this.groupsManager.currentGroupId);
    if (!currentGroup) return;

    // Check if a game with the same parameters already exists (pinned or unpinned)
    const gameExists = currentGroup.games.some(game => JSON.stringify(game.params) === gameParamsString);
    if (gameExists) {
      return;
    }

    // Create new game object (unpinned)
    const newGame = { params: gameParams, id: generateRandomId(), pin: 0 };

    // Insert after pinned games
    const pinnedCount = currentGroup.games.filter(g => g.pin).length;
    currentGroup.games.splice(pinnedCount, 0, newGame);

    // Enforce the limit: remove excess unpinned games from the end
    const maxGamesToKeep = pinnedCount + this.maxGameCount;
    if (currentGroup.games.length > maxGamesToKeep) {
      currentGroup.games.splice(maxGamesToKeep, currentGroup.games.length - maxGamesToKeep);
    }

    this.assignGameIds();
    this.saveGameData();
  }

  handleGameActions() {
    // Handle auto-start
    if (this.shouldStart) {
      const pausedElement = document.querySelector('#status-inner #paused');
      if (pausedElement && pausedElement.style.display !== 'none') {
        if (typeof game !== 'undefined' && game.hostStart) {
          sleep(this.startDelay).then(() => {
            game.hostStart();
          });
        }
      }
    }

    // Handle auto-replay
    if (this.shouldReplay) {
      const finishedElement = document.querySelector('#status-inner #finished');
      if (finishedElement && finishedElement.style.display !== 'none') {
        const gameIdMatch = location.href.match(/gmid=(\d+)/);
        if (gameIdMatch) {
          const gameId = gameIdMatch[1];
          sleep(this.replayDelay).then(() => {
            window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
          });
        }
      }
    }
  }

  changeGameCount(delta) {
    if (delta < 0 && this.maxGameCount > 0) this.maxGameCount--;
    else if (delta > 0) this.maxGameCount++;
    this.updateGameCountDisplay();
    this.settingsManager.saveSettings();
    this.refreshContainer();
  }

  handlePageSpecificLogic() {
    const { href } = location;
    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      const observer = new MutationObserver(() => {
        const gameDescription = document.querySelector('#gamedesc');
        if (gameDescription && gameDescription.textContent) {
          observer.disconnect(); // Stop observing once the game description is found
          this.saveCurrentGameParams();
          this.handleGameActions();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const finished = document.getElementById('finished');
      if (finished) {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          this.handleGameActions();
        });
        observer.observe(finished, { attributes: true });
      }
    }

    // Highlight vocabularies and attach vocabulary creation popup on vocs page
    if (/klavogonki\.ru\/vocs\//.test(href)) {
      highlightExistingVocabularies(this.groupsManager.groups);
      attachVocabularyCreation(this.groupsManager.groups, this);
      attachVocabularyParser();
    }
  }

  exposeGlobalFunctions() {
    window.latestGamesManager = this;
  }

  createPanelToggleButton() {
    if (document.getElementById('latest-games-panel-toggle')) return;

    const btn = createElement('button', {
      id: 'latest-games-panel-toggle',
      className: 'latest-games-panel-toggle',
      type: 'button',
      innerHTML: this.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed,
    });
    createCustomTooltip(btn, `
      [Клик] (Показать/Скрыть) панель
      [Shift + Клик] (Закрепить/Открепить) панель`
    );

    this.alwaysVisiblePanel && btn.classList.add('always-visible');

    btn.addEventListener('click', (e) => {
      const container = document.getElementById('latest-games-container');
      if (!container) return;

      if (e.shiftKey) {
        this.alwaysVisiblePanel = !this.alwaysVisiblePanel;
        btn.classList.toggle('always-visible', this.alwaysVisiblePanel);
        btn.innerHTML = this.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed;
        container.classList.toggle('visible', this.alwaysVisiblePanel);
        if (!this.alwaysVisiblePanel) this.updateContainerLeftOffset();
        this.settingsManager.saveSettings();
      } else {
        const isVisible = container.classList.contains('visible');
        if (isVisible) {
          if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
          }
          container.classList.remove('visible');
          this.updateContainerLeftOffset();
        } else {
          this.showContainer();
        }
      }
    });

    document.body.appendChild(btn);
  }

}

setupFonts();

// Initialize the LatestGamesManager instance
window.latestGamesManager ??= new LatestGamesManager();
