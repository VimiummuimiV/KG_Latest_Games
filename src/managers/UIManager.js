import { icons } from '../icons.js';
import { createElement } from '../utils.js';
import { showMigrationPopup } from '../vocabularyMigration.js';
import { createCustomTooltip } from '../tooltip.js';
import { createGamePopup } from '../gamePopup.js';
import { addDragFunctionality } from '../drag.js';

export class UIManager {
  constructor(main) {
    this.main = main;
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
    pinButton.addEventListener('click', () => this.main.gamesManager.pinGame(id));

    const deleteButton = createElement('div', {
      className: 'latest-game-delete',
      innerHTML: icons.delete
    });
    createCustomTooltip(deleteButton, 'Удалить');
    deleteButton.addEventListener('click', () => this.main.gamesManager.deleteGame(id));

    buttons.appendChild(pinButton);
    buttons.appendChild(deleteButton);

    const link = createElement('a', {
      href: this.main.gamesManager.generateGameLink(game),
      innerHTML: this.main.gamesManager.generateGameName(game)
    });

    link.addEventListener('click', (e) => {
      if (this.main.wasDragging) {
        e.preventDefault();
        this.main.wasDragging = false;
      }
    });
    createCustomTooltip(link, `
      [Клик] Перейти к игре с текущими параметрами
      [Shift + Клик] Перейти к игре с альтернативными параметрами
      [Удерживание (ЛКМ)] аналогично (Shift + Клик)
    `);

    li.appendChild(buttons);
    li.appendChild(link);
    if (game.pin && this.main.enableDragging) addDragFunctionality(this.main, li);
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
      className: this.main.shouldAutoSave === false ? 'latest-games-disabled' : '',
      textContent: this.main.maxGameCount.toString()
    });
    createCustomTooltip(countDisplay, this.main.shouldAutoSave ? 'Автосохранение включено' : 'Автосохранение отключено');

    countDisplay.addEventListener('click', () => {
      this.main.shouldAutoSave = !this.main.shouldAutoSave;
      this.updateGameCountDisplay();
      this.main.settingsManager.saveSettings();
      this.refreshContainer();
    });

    const increaseBtn = createElement('span', {
      id: 'latest-games-count-inc',
      className: 'control-button',
      innerHTML: icons.increase
    });
    createCustomTooltip(increaseBtn, 'Увеличить количество сохраняемых игр');

    decreaseBtn.addEventListener('click', () => this.main.gamesManager.changeGameCount(-1));
    increaseBtn.addEventListener('click', () => this.main.gamesManager.changeGameCount(1));

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
              this.main.settingsManager.saveSettings();
              updateTooltip(button, context[property], enabledText, disabledText, delayValue, delayText);
            } else {
              alert(delayErrorText);
            }
          }
        } else {
          context[property] = !context[property];
          this.main.settingsManager.saveSettings();
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

    setupControlButton(playBtn, this.main, 'shouldStart', 'startDelay', {
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

    setupControlButton(replayBtn, this.main, 'shouldReplay', 'replayDelay', {
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
        this.main.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 1));
      } else {
        // Single Click: Pin all games only in current group
        const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games.forEach(game => game.pin = 1);
        }
      }
      this.main.gamesManager.saveGameData();
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
        this.main.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 0));
      } else {
        // Single Click: Unpin games only in current group
        const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games.forEach(game => game.pin = 0);
        }
      }
      this.main.gamesManager.saveGameData();
      this.refreshContainer();
    };

    const sortBtn = createElement('span', {
      className: 'latest-games-sort control-button',
      innerHTML: icons.sort
    });
    createCustomTooltip(sortBtn, 'Сортировать игры в текущей группе по алфавиту');
    sortBtn.addEventListener('click', () => this.main.groupsManager.sortActiveGroupGames());

    const importBtn = createElement('span', {
      className: 'latest-games-import control-button',
      innerHTML: icons.import
    });
    createCustomTooltip(importBtn, 'Импортировать настройки из JSON файла');
    importBtn.onclick = () => this.main.settingsManager.importSettings(this.main);

    const exportBtn = createElement('span', {
      className: 'latest-games-export control-button',
      innerHTML: icons.export
    });
    createCustomTooltip(exportBtn, 'Экспортировать все настройки в JSON файл');
    exportBtn.onclick = () => this.main.settingsManager.exportSettings(this.main);

    const removeAllBtn = createElement('span', {
      className: 'latest-games-removeall control-button',
      innerHTML: icons.trashNothing
    });
    createCustomTooltip(removeAllBtn, 'Удалить все настройки');
    removeAllBtn.onclick = () => this.main.settingsManager.removeAllSettings(this.main);

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
        this.main.groupsManager.groups.forEach(group => {
          group.games = group.games.filter(game => game.pin);
        });
      } else {
        // Click: Remove unpinned games only from current group
        const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
        if (currentGroup) {
          currentGroup.games = currentGroup.games.filter(game => game.pin);
        }
      }
      this.main.gamesManager.saveGameData();
      this.refreshContainer();
    };

    const dragToggleBtn = createElement('span', {
      className: 'latest-games-drag-toggle control-button',
      innerHTML: icons.dragToggle
    });
    createCustomTooltip(dragToggleBtn, this.main.enableDragging ? 'Перетаскивание включено' : 'Перетаскивание отключено');
    dragToggleBtn.classList.toggle('latest-games-disabled', !this.main.enableDragging);

    dragToggleBtn.onclick = () => {
      this.main.enableDragging = !this.main.enableDragging;
      this.main.settingsManager.saveSettings();
      this.refreshContainer();
      createCustomTooltip(dragToggleBtn, this.main.enableDragging ? 'Перетаскивание включено' : 'Перетаскивание отключено');
      dragToggleBtn.classList.toggle('latest-games-disabled', !this.main.enableDragging);
    };

    controlsLimiter.appendChild(options);
    controlsButtons.append(
      this.main.themeManager.createThemeToggle(),
      this.main.viewManager.createDisplayModeToggle(),
      playBtn, replayBtn, pinAllBtn, unpinAllBtn, sortBtn, importBtn, exportBtn, removeAllBtn, removeUnpinnedBtn, dragToggleBtn
    );

    return controlsContainer;
  }

  updateContainerYPosition() {
    const container = document.getElementById('latest-games-container');
    if (!container) return;
    container.style.top = this.main.viewManager.getDisplayMode() === 'wrap' ? `${this.main.panelYPosition}vh` : '';
  }

  createContainer() {
    const container = createElement('div', { id: 'latest-games-container' });
    const groupsContainer = this.main.groupsManager.createGroupsContainer();

    container.appendChild(groupsContainer);
    const gamesList = createElement('ul', { id: 'latest-games' });

    this.populateGamesList(gamesList);
    container.appendChild(gamesList);
    const controls = this.createControls();
    container.appendChild(controls);

    container.addEventListener('scroll', () => {
      this.main.previousScrollPosition = container.scrollTop;
      this.main.settingsManager.saveSettings();
    });

    container.addEventListener('mouseenter', () => this.showContainer());
    container.addEventListener('mouseleave', () => this.hideContainer());

    let longPressTimer = null;
    let suppressClick = false;

    const showGamePopup = (e) => {
      const gameElement = e.target.closest('.latest-game');
      if (!gameElement) return;
      const gameId = gameElement.id.replace('latest-game-', '');
      const game = this.main.gamesManager.findGameById(gameId);
      if (game && !this.main.enableDragging) createGamePopup(game, e, this.main.gamesManager); // Show popup only if dragging is disabled
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

    // Capture-phase click listener to block the "click" after a long press or Shift press
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
        showMigrationPopup(this.main, this.main.groupsManager.groups, this.main.groupsManager.currentGroupId, e, gameId);
      }
    });

    let handle = container.querySelector('.resize-handle');
    if (!handle) {
      handle = createElement('div', { className: 'resize-handle' });
      container.appendChild(handle);
    }

    // Resize logic: only active in wrap mode
    const setupResizeHandle = () => {
      const mode = this.main.viewManager.getDisplayMode();
      if (mode === 'wrap') {
        // Apply stored width
        container.style.width = this.main.panelWidth;
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
          this.main.panelWidth = container.style.width;
          this.main.settingsManager.saveSettings();
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
      const mode = this.main.viewManager.getDisplayMode();
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
          this.main.panelYPosition = Math.round(((finalRect.top / window.innerHeight) * 100) * 10) / 10;
          this.main.settingsManager.saveSettings();
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

    this.main.groupsManager.updateGroupControlStates();
    this.main.viewManager.updateDisplayModeClass();
    // Add title to tabs if they are too wide
    const allTabs = container.querySelectorAll('.group-tab');
    allTabs.forEach(tab => {
      if (tab.getBoundingClientRect().width >= 300) {
        createCustomTooltip(tab, tab.textContent);
      }
    });

    // Patch updateDisplayModeClass to also update the handle
    const origUpdateDisplayModeClass = this.main.viewManager.updateDisplayModeClass.bind(this.main.viewManager);
    this.main.viewManager.updateDisplayModeClass = (...args) => {
      origUpdateDisplayModeClass(...args);
      setupResizeHandle();
      setupYPositioning();
    };

    this.updateRemoveIcons();

    // Apply saved scroll position after rendering
    container.scrollTop = this.main.previousScrollPosition;
  }

  updateGameCountDisplay() {
    const countDisplay = document.getElementById('latest-games-count');
    if (countDisplay) {
      countDisplay.textContent = this.main.maxGameCount.toString();
      countDisplay.classList.toggle('latest-games-disabled', this.main.shouldAutoSave === false);
      createCustomTooltip(countDisplay, this.main.shouldAutoSave ? 'Автосохранение включено' : 'Автосохранение отключено');
    }
  }

  createHoverArea() {
    const hoverArea = createElement('div', { id: 'latest-games-hover-area' });
    hoverArea.addEventListener('mouseenter', () => this.showContainer());
    hoverArea.addEventListener('mouseleave', () => this.hideContainer());
    document.body.appendChild(hoverArea);
  }

  populateGamesList(gamesList) {
    gamesList.innerHTML = '';

    if (this.main.groupsManager.getGroupViewMode() === 'tabs') {
      // In tabs mode, only show games for the current group, no headers
      const currentGroup = this.main.groupsManager.getCurrentGroup();
      if (!currentGroup) return;
      const pinnedCount = this.main.groupsManager.getPinnedGameCount();
      const maxGamesToShow = Math.min(currentGroup.games.length, this.main.maxGameCount + pinnedCount);
      for (let i = 0; i < maxGamesToShow; i++) {
        const game = currentGroup.games[i];
        const gameElement = this.createGameElement(game, game.id);
        gamesList.appendChild(gameElement);
      }
    } else {
      // In unified mode, show headers and games for all groups
      this.main.groupsManager.groups.forEach(group => {
        if (group.games.length > 0) {
          // Add group header to separate groups
          const groupHeader = this.main.groupsManager.createGroupHeader(group);
          gamesList.appendChild(groupHeader);
          const pinnedCount = group.games.filter(game => game.pin).length;
          const maxGamesToShow = Math.min(group.games.length, this.main.maxGameCount + pinnedCount);
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
    this.main.isHovered = true;
    if (this.main.hoverTimeout) clearTimeout(this.main.hoverTimeout);
    this.main.hoverTimeout = null;
    const container = document.getElementById('latest-games-container');
    if (container) {
      container.classList.add('visible');
      container.style.left = '0';
      // If mode is 'wrap', set the panel previous Y position
      if (this.main.viewManager.getDisplayMode() === 'wrap') {
        container.style.top = `${this.main.panelYPosition}vh`;
      }
      container.scrollTop = this.main.previousScrollPosition;
    }
  }

  hideContainer() {
    if (this.main.alwaysVisiblePanel) return; // If alwaysVisiblePanel is true, do not hide
    this.main.isHovered = false;
    if (this.main.hoverTimeout) clearTimeout(this.main.hoverTimeout);
    this.main.hoverTimeout = setTimeout(() => {
      if (!this.main.isHovered) {
        const container = document.getElementById('latest-games-container');
        if (container) {
          container.classList.remove('visible');
          this.main.viewManager.updateContainerLeftOffset();
        }
      }
    }, this.main.hidePanelDelay);
  }

  updateRemoveIcons() {
    // Update the remove group icon inside group controls:
    const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
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
    const hasAnyData = this.main.groupsManager.groups.some(group => group.games && group.games.length > 0);
    if (removeAllBtn) {
      removeAllBtn.innerHTML = hasAnyData ? icons.trashSomething : icons.trashNothing;
    }
  }

  refreshContainer() {
    this.main.groupsManager.refreshGroupsContainer();
    const gamesList = document.getElementById('latest-games');
    if (gamesList) {
      this.populateGamesList(gamesList);
      this.main.viewManager.updateDisplayModeClass();
    }
    this.updateRemoveIcons();
    this.updateGameCountDisplay();
  }

  createPanelToggleButton() {
    if (document.getElementById('latest-games-panel-toggle')) return;

    const btn = createElement('button', {
      id: 'latest-games-panel-toggle',
      className: 'latest-games-panel-toggle',
      type: 'button',
      innerHTML: this.main.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed,
    });
    createCustomTooltip(btn, `
      [Клик] (Показать/Скрыть) панель
      [Shift + Клик] (Закрепить/Открепить) панель`
    );

    this.main.alwaysVisiblePanel && btn.classList.add('always-visible');

    btn.addEventListener('click', (e) => {
      const container = document.getElementById('latest-games-container');
      if (!container) return;

      if (e.shiftKey) {
        this.main.alwaysVisiblePanel = !this.main.alwaysVisiblePanel;
        btn.classList.toggle('always-visible', this.main.alwaysVisiblePanel);
        btn.innerHTML = this.main.alwaysVisiblePanel ? icons.panelToggleOpened : icons.panelToggleClosed;
        container.classList.toggle('visible', this.main.alwaysVisiblePanel);
        if (!this.main.alwaysVisiblePanel) this.main.viewManager.updateContainerLeftOffset();
        this.main.settingsManager.saveSettings();
      } else {
        const isVisible = container.classList.contains('visible');
        if (isVisible) {
          if (this.main.hoverTimeout) {
            clearTimeout(this.main.hoverTimeout);
            this.main.hoverTimeout = null;
          }
          container.classList.remove('visible');
          this.main.viewManager.updateContainerLeftOffset();
        } else {
          this.showContainer();
        }
      }
    });

    document.body.appendChild(btn);
  }
}