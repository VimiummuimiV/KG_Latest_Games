import { icons } from './icons';
import './styles.scss';
import { generateRandomId, createElement } from './utils.js';
import { parseGameParams, generateGameName, generateGameLink } from './gameUtils.js';
import { createGroup, renameGroup, removeGroup, getGroups, getCurrentGroup } from './groups.js';

class LatestGamesManager {
  constructor() {
    // Initialize settings with defaults
    this.maxGameCount = 5;
    this.currentTheme = 'light';
    this.displayMode = 'scroll';
    this.previousScrollPosition = parseInt(localStorage.getItem('latestGamesScrollPosition')) || 0;
    this.panelWidth = '95vw';
    this.groups = [];
    this.currentGroupId = null;
    this.hoverTimeout = null;
    this.isHovered = false;
    this.isDragging = false;
    this.wasDragging = false;
    this.dragThreshold = 1;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.dragDirection = 0;
    this.lastDragDirection = 0;
    this.rotationAccumulator = 0;
    this.rotationDegreeLimit = 5;
    this.lastDragY = 0;
    this.hidePanelDelay = 1000;
    this.globalEvents = {};

    this.init();
  }

  init() {
    this.loadSettings();
    this.loadGameData();
    if (this.groups.length === 0) {
      const defaultGroup = createGroup('Группа-1');
      this.groups = [defaultGroup];
      this.currentGroupId = defaultGroup.id;
    } else if (!this.currentGroupId || !this.groups.some(g => g.id === this.currentGroupId)) {
      this.currentGroupId = this.groups[0].id;
    }
    this.createHoverArea();
    this.createContainer();
    this.handlePageSpecificLogic();
    this.exposeGlobalFunctions();
    this.applyTheme();
  }

  applyTheme() {
    const container = document.getElementById('latest-games-container');
    if (container) {
      container.classList.remove('light-theme', 'dark-theme');
      container.classList.add(`${this.currentTheme}-theme`);
    }
  }

  updateThemeIcon(svg) {
    svg.innerHTML = this.currentTheme === 'light' ? icons.sun : icons.moon;
  }

  updateThemeToggle() {
    const svg = document.querySelector('#latest-games-container .theme-toggle svg');
    if (svg) this.updateThemeIcon(svg);
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.saveSettings();
    this.applyTheme();
    this.updateThemeToggle();
  }

  createThemeToggle() {
    const toggleButton = createElement('div', {
      className: 'theme-toggle control-button',
      title: 'Изменить тему (Светлая/Темная)'
    });
    const svg = createElement('svg', { viewBox: '0 0 24 24' });
    this.updateThemeIcon(svg);
    toggleButton.appendChild(svg);
    toggleButton.addEventListener('click', () => this.toggleTheme());
    return toggleButton;
  }

  createDisplayModeToggle() {
    const toggleButton = createElement('div', {
      className: 'display-mode-toggle control-button',
      title: 'Переключить режим отображения (Вертикальный/Горизонтальный)'
    });
    const svg = createElement('svg', { viewBox: '0 0 24 24' });
    this.updateDisplayModeIcon(svg, this.displayMode);
    toggleButton.appendChild(svg);
    toggleButton.addEventListener('click', () => {
      const newMode = this.getDisplayMode() === 'scroll' ? 'wrap' : 'scroll';
      this.setDisplayMode(newMode);
      this.updateDisplayModeIcon(svg, newMode);
      this.updateDisplayModeClass();
      if (newMode === 'scroll') {
        const c = document.getElementById('latest-games-container');
        if (c) setTimeout(() => c.scrollTop = c.scrollHeight, 0);
      }
    });
    return toggleButton;
  }

  getDisplayMode() {
    return this.displayMode;
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    this.saveSettings();
  }

  updateDisplayModeIcon(svg, mode) {
    svg.innerHTML = mode === 'wrap' ? icons.wrap : icons.scroll;
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
      container.style.left = '-350px';
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
      title: game.pin ? 'Открепить' : 'Закрепить',
      innerHTML: icons.pin
    });
    pinButton.addEventListener('click', () => this.pinGame(id));

    const deleteButton = createElement('div', {
      className: 'latest-game-delete',
      title: 'Удалить',
      innerHTML: icons.delete
    });
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

    li.appendChild(buttons);
    li.appendChild(link);
    if (game.pin) this.addDragFunctionality(li, id);
    return li;
  }

  createGroupsContainer() {
    const groupsContainer = createElement('div', { id: 'latest-games-groups' });
    const groupTabs = createElement('div', { className: 'group-tabs' });

    // Create group controls (persistent)
    const groupControls = createElement('div', { className: 'group-controls' });
    const addButton = createElement('span', {
      className: 'add-group control-button',
      title: 'Добавить группу',
      innerHTML: icons.addGroup
    });

    addButton.addEventListener('click', () => this.addGroup());
    const renameButton = createElement('span', {
      className: 'rename-group control-button',
      title: 'Переименовать группу',
      innerHTML: icons.renameGroup
    });

    renameButton.addEventListener('click', () => this.renameCurrentGroup());
    const removeButton = createElement('span', {
      className: 'remove-group control-button',
      title: 'Удалить группу',
      innerHTML: icons.remove
    });
    removeButton.addEventListener('click', () => this.removeCurrentGroup());

    groupControls.appendChild(addButton);
    groupControls.appendChild(renameButton);
    groupControls.appendChild(removeButton);

    // Insert group-controls as the first child of group-tabs
    groupTabs.appendChild(groupControls);

    // Then add the group tabs
    this.groups.forEach(group => {
      const tab = createElement('span', {
        className: `group-tab ${group.id === this.currentGroupId ? 'active' : ''}`,
        textContent: group.title,
        dataset: { groupId: group.id }
      });
      tab.addEventListener('click', () => this.selectGroup(group.id));
      groupTabs.appendChild(tab);
    });

    groupsContainer.appendChild(groupTabs);
    return groupsContainer;
  }

  createControls() {
    const controlsContainer = createElement('div', { className: 'latest-games-controls' });
    const pinAllBtn = createElement('span', {
      className: 'latest-games-pinall control-button',
      title: 'Закрепить все',
      innerHTML: icons.pinAll
    });
    pinAllBtn.onclick = () => {
      const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
      if (currentGroup) {
        currentGroup.games.forEach(g => g.pin = 1);
        this.saveGameData();
        this.refreshContainer();
      }
    };

    const unpinAllBtn = createElement('span', {
      className: 'latest-games-unpinall control-button',
      title: 'Открепить все',
      innerHTML: icons.unpinAll
    });
    unpinAllBtn.onclick = () => {
      const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
      if (currentGroup) {
        currentGroup.games.forEach(g => g.pin = 0);
        this.saveGameData();
        this.refreshContainer();
      }
    };

    const importBtn = createElement('span', {
      className: 'latest-games-import control-button',
      title: 'Импортировать настройки из JSON файла',
      innerHTML: icons.import
    });
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
            this.loadSettings();
            this.loadGameData();
            this.refreshContainer();
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
      title: 'Экспортировать все настройки в JSON файл',
      innerHTML: icons.export
    });
    exportBtn.onclick = () => {
      const all = {
        latestGamesSettings: JSON.parse(localStorage.getItem('latestGamesSettings') || '{}'),
        latestGamesData: { groups: this.groups, currentGroupId: this.currentGroupId }
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
      title: 'Удалить все настройки',
      innerHTML: icons.remove
    });
    removeAllBtn.onclick = () => {
      localStorage.removeItem('latestGamesSettings');
      localStorage.removeItem('latestGamesData');
      this.groups = [createGroup('Группа-1')];
      this.currentGroupId = this.groups[0].id;
      this.saveGameData();
      this.refreshContainer();
    };
    const options = createElement('span', { id: 'latest-games-options' });
    const decreaseBtn = createElement('span', {
      id: 'latest-games-count-dec',
      className: 'control-button',
      title: 'Уменьшить количество сохраняемых игр',
      innerHTML: icons.decrease
    });

    const countDisplay = createElement('span', {
      id: 'latest-games-count',
      textContent: this.maxGameCount.toString()
    });

    const increaseBtn = createElement('span', {
      id: 'latest-games-count-inc',
      className: 'control-button',
      title: 'Увеличить количество сохраняемых игр',
      innerHTML: icons.increase
    });

    decreaseBtn.addEventListener('click', () => this.changeGameCount(-1));
    increaseBtn.addEventListener('click', () => this.changeGameCount(1));

    options.appendChild(decreaseBtn);
    options.appendChild(countDisplay);
    options.appendChild(increaseBtn);

    controlsContainer.appendChild(options);
    controlsContainer.appendChild(this.createThemeToggle());
    controlsContainer.appendChild(this.createDisplayModeToggle());
    controlsContainer.appendChild(pinAllBtn);
    controlsContainer.appendChild(unpinAllBtn);
    controlsContainer.appendChild(importBtn);
    controlsContainer.appendChild(exportBtn);
    controlsContainer.appendChild(removeAllBtn);

    return controlsContainer;
  }

  createContainer() {
    const container = createElement('div', { id: 'latest-games-container' });
    const groupsContainer = this.createGroupsContainer();

    container.appendChild(groupsContainer);
    const gamesList = createElement('ul', { id: 'latest-games' });

    this.populateGamesList(gamesList);
    container.appendChild(gamesList);
    const controls = this.createControls();
    container.appendChild(controls);

    // Apply saved scroll position
    container.scrollTop = this.previousScrollPosition;

    container.addEventListener('scroll', () => {
      this.previousScrollPosition = container.scrollTop;
      this.saveSettings();
    });
    // Add hover listeners to show/hide the container
    container.addEventListener('mouseenter', () => this.showContainer());
    container.addEventListener('mouseleave', () => this.hideContainerWithDelay());
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
          this.saveSettings();
        };
        handle.onmousedown = (e) => {
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

    // Call once on creation
    setupResizeHandle();
    document.body.appendChild(container);
    this.updateDisplayModeClass();
    // Patch updateDisplayModeClass to also update the handle
    const origUpdateDisplayModeClass = this.updateDisplayModeClass.bind(this);
    this.updateDisplayModeClass = (...args) => {
      origUpdateDisplayModeClass(...args);
      setupResizeHandle();
    };
  }

  loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('latestGamesSettings')) || {};
      this.maxGameCount = settings.gamesLimit || 5;
      this.currentTheme = settings.theme || 'light';
      this.displayMode = settings.displayMode || 'scroll';
      this.previousScrollPosition = settings.previousScrollPosition || 0;
      this.panelWidth = settings.panelWidth || '95vw';
    } catch (error) {
      console.warn('Could not load settings from localStorage:', error);
      // Set defaults
      this.maxGameCount = 5;
      this.currentTheme = 'light';
      this.displayMode = 'scroll';
      this.previousScrollPosition = 0;
      this.panelWidth = '95vw';
    }
  }

  saveSettings() {
    try {
      const settings = {
        gamesLimit: this.maxGameCount,
        theme: this.currentTheme,
        displayMode: this.displayMode,
        previousScrollPosition: this.previousScrollPosition,
        panelWidth: this.panelWidth
      };
      localStorage.setItem('latestGamesSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Could not save settings to localStorage:', error);
    }
  }

  loadGameData() {
    try {
      let data = localStorage.getItem('latestGamesData');
      if (data) {
        data = JSON.parse(data);
        if (Array.isArray(data)) {
          this.groups = [{ id: generateRandomId(), title: 'Группа-1', games: data }];
          this.currentGroupId = this.groups[0].id;
        } else if (data && Array.isArray(data.groups)) {
          this.groups = data.groups;
          this.currentGroupId = data.currentGroupId;
        } else {
          this.groups = [];
          this.currentGroupId = null;
        }
      } else {
        this.groups = [];
        this.currentGroupId = null;
      }
      this.migrateOldGameData();
      this.assignGameIds();
    } catch (error) {
      console.warn('Could not load game data from localStorage:', error);
      this.groups = [];
      this.currentGroupId = null;
    }
  }

  migrateOldGameData() {
    this.groups.forEach(group => {
      group.games = group.games.map(game => {
        if (game.params.qual === 'on' || game.params.qual === '') {
          game.params.qual = game.params.qual === 'on' ? 1 : 0;
        }
        return game;
      });
    });
  }

  assignGameIds() {
    const allGameIds = new Set(this.groups.flatMap(group => group.games.map(game => game.id)));
    this.groups.forEach(group => {
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

  saveGameData() {
    try {
      const data = { groups: this.groups, currentGroupId: this.currentGroupId };
      localStorage.setItem('latestGamesData', JSON.stringify(data));
    } catch (error) {
      console.warn('Could not save game data to localStorage:', error);
    }
  }

  isActuallyDragging(e) {
    return (
      Math.abs(e.clientX - this.initialX) > this.dragThreshold ||
      Math.abs(e.clientY - this.initialY) > this.dragThreshold
    );
  }

  addDragFunctionality(element) {
    element.addEventListener('mousedown', (e) => {
      // Prevent dragging if the target is a button (e.g., pin or delete)
      if (e.target.closest('.latest-game-buttons')) return;
      this.wasDragging = false;
      this.initialX = e.clientX;
      this.initialY = e.clientY;
      this.isDragging = true;
      this.draggedElement = element;
      const rect = element.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      this.isRightHalf = clickX > rect.width / 2;
      this.lastDragY = e.clientY;
      // Calculate the offset from the top-left corner of the element
      this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.parentRect = element.parentElement.getBoundingClientRect();
      this.globalEvents.handleDragMove = this.handleDragMove.bind(this);
      this.globalEvents.handleDragEnd = this.handleDragEnd.bind(this);
      document.addEventListener('mousemove', this.globalEvents.handleDragMove);
      document.addEventListener('mouseup', this.globalEvents.handleDragEnd);
    });
  }

  handleDragMove(e) {
    if (!this.isDragging || !this.draggedElement) return;

    if (!this.wasDragging && this.isActuallyDragging(e)) {
      this.wasDragging = true;
      this.draggedElement.classList.add('dragging');
      if (this.getDisplayMode() === 'wrap') {
        const rect = this.draggedElement.getBoundingClientRect();
        const parentRect = this.parentRect;

        this.draggedElement.style.position = 'absolute';
        this.draggedElement.style.left = `${rect.left - parentRect.left}px`;
        this.draggedElement.style.top = `${rect.top - parentRect.top}px`;
        this.draggedElement.style.width = `${rect.width}px`;

      }
    }

    e.preventDefault();

    const displayMode = this.getDisplayMode();
    const gamesList = document.getElementById('latest-games');

    if (displayMode === 'scroll') {
      const pinnedGames = Array.from(gamesList.querySelectorAll('.pin-game:not(.dragging)'));
      let insertAfter = null;

      for (const pinnedGame of pinnedGames) {
        const rect = pinnedGame.getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        if (e.clientY < middle) break;
        insertAfter = pinnedGame;
      }

      if (insertAfter) {
        gamesList.insertBefore(this.draggedElement, insertAfter.nextSibling);
      } else {
        const firstPinned = gamesList.querySelector('.pin-game:not(.dragging)');
        if (firstPinned) gamesList.insertBefore(this.draggedElement, firstPinned);
      }
    } else {
      const parentRect = this.parentRect;
      let newLeft = e.clientX - this.dragOffset.x - parentRect.left;
      let newTop = e.clientY - this.dragOffset.y - parentRect.top;

      newLeft = Math.max(0, Math.min(newLeft, gamesList.offsetWidth - this.draggedElement.offsetWidth));
      newTop = Math.max(0, Math.min(newTop, gamesList.offsetHeight - this.draggedElement.offsetHeight));

      this.draggedElement.style.left = `${newLeft}px`;
      this.draggedElement.style.top = `${newTop}px`;

      const pinnedGames = Array.from(gamesList.querySelectorAll('.pin-game:not(.dragging)'));
      let closestElement = null;
      let minDistance = Infinity;
      const cursorX = e.clientX;
      const cursorY = e.clientY;

      pinnedGames.forEach(game => {
        const rect = game.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(cursorX - centerX, cursorY - centerY);
        if (distance < minDistance) {
          minDistance = distance;
          closestElement = game;
        }
      });

      if (closestElement) {
        const rect = closestElement.getBoundingClientRect();
        const isLeftHalf = cursorX < rect.left + rect.width / 2;
        if (isLeftHalf) {
          gamesList.insertBefore(this.draggedElement, closestElement);
        } else {
          gamesList.insertBefore(this.draggedElement, closestElement.nextSibling);
        }
      }
    }

    const currentY = e.clientY;
    const deltaY = currentY - this.lastDragY;
    this.lastDragY = currentY;
    if (deltaY !== 0) {
      const sensitivity = 0.2;
      this.rotationAccumulator = (this.rotationAccumulator || 0) + (this.isRightHalf ? deltaY : -deltaY) * sensitivity;
      this.rotationAccumulator = Math.max(-this.rotationDegreeLimit, Math.min(this.rotationDegreeLimit, this.rotationAccumulator));
      this.draggedElement.style.transform = `rotate(${this.rotationAccumulator}deg)`;
    }
  }

  handleDragEnd() {
    if (!this.isDragging || !this.draggedElement) return;

    this.isDragging = false;
    this.draggedElement.classList.remove('dragging');

    const displayMode = this.getDisplayMode();
    if (displayMode === 'wrap') {
      this.draggedElement.style.position = '';
      this.draggedElement.style.left = '';
      this.draggedElement.style.top = '';
      this.draggedElement.style.width = '';
    }
    this.draggedElement.style.transform = '';

    this.updateGameOrderFromDOM();

    this.draggedElement = null;
    this.dragDirection = 0;
    this.lastDragY = 0;

    if (this.globalEvents) {
      document.removeEventListener('mousemove', this.globalEvents.handleDragMove);
      document.removeEventListener('mouseup', this.globalEvents.handleDragEnd);
    }
  }

  updateGameOrderFromDOM() {
    const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
    if (!currentGroup) return;
    const gameElements = Array.from(document.querySelectorAll('#latest-games .latest-game'));
    currentGroup.games = gameElements.map(element => {
      const id = element.id.replace('latest-game-', '');
      return currentGroup.games.find(g => g.id === id);
    }).filter(game => game !== undefined);
    this.saveGameData();
  }

  getPinnedGameCount() {
    const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
    return currentGroup ? currentGroup.games.filter(game => game.pin).length : 0;
  }

  createHoverArea() {
    const hoverArea = createElement('div', { id: 'latest-games-hover-area' });
    hoverArea.addEventListener('mouseenter', () => this.showContainer());
    hoverArea.addEventListener('mouseleave', () => this.hideContainerWithDelay());
    document.body.appendChild(hoverArea);
  }

  populateGamesList(gamesList) {
    gamesList.innerHTML = '';
    const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
    if (!currentGroup) return;
    const pinnedCount = this.getPinnedGameCount();
    const maxGamesToShow = Math.min(currentGroup.games.length, this.maxGameCount + pinnedCount);
    for (let i = 0; i < maxGamesToShow; i++) {
      const game = currentGroup.games[i];
      const gameElement = this.createGameElement(game, game.id);
      gamesList.appendChild(gameElement);
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
      container.scrollTop = this.previousScrollPosition;
    }
  }

  hideContainerWithDelay() {
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

  refreshContainer() {
    const groupsContainer = document.getElementById('latest-games-groups');
    if (groupsContainer) {
      const groupTabs = groupsContainer.querySelector('.group-tabs');
      if (groupTabs) {
        // Remove only .group-tab elements, keep .group-controls
        Array.from(groupTabs.children).forEach(child => {
          if (child.classList.contains('group-tab')) {
            groupTabs.removeChild(child);
          }
        });
        // Add updated group tabs
        this.groups.forEach(group => {
          const tab = createElement('span', {
            className: `group-tab ${group.id === this.currentGroupId ? 'active' : ''}`,
            textContent: group.title,
            dataset: { groupId: group.id }
          });
          tab.addEventListener('click', () => this.selectGroup(group.id));
          groupTabs.appendChild(tab);
        });
      }
    }
    const gamesList = document.getElementById('latest-games');
    if (gamesList) {
      this.populateGamesList(gamesList);
      this.updateDisplayModeClass();
    }
  }

  selectGroup(id) {
    if (this.groups.some(group => group.id === id)) {
      this.currentGroupId = id;
      this.saveGameData();
      this.refreshContainer();
    }
  }

  addGroup() {
    const title = prompt('Введите название группы:')?.trim() || null;
    const newGroup = createGroup(title, this.groups);
    this.groups.push(newGroup);
    this.currentGroupId = newGroup.id;
    this.saveGameData();
    this.refreshContainer();
  }

  renameCurrentGroup() {
    const newTitle = prompt('Введите новое название группы:', getCurrentGroup(this.groups, this.currentGroupId)?.title)?.trim();
    if (newTitle) {
      renameGroup(this.groups, this.currentGroupId, newTitle);
      this.saveGameData();
      this.refreshContainer();
    }
  }

  removeCurrentGroup() {
    if (this.groups.length <= 1) {
      alert('Нельзя удалить последнюю группу.');
      return;
    }
    this.groups = removeGroup(this.groups, this.currentGroupId);
    this.currentGroupId = this.groups[0].id;
    this.saveGameData();
    this.refreshContainer();
  }

  findGameIndex(id) {
    for (const group of this.groups) {
      const index = group.games.findIndex(game => game.id == id);
      if (index !== -1) return { group, index };
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
    const insertIndex = game.pin ?
      group.games.findIndex(g => !g.pin || g === game) :
      group.games.findIndex(g => !g.pin && g !== game);
    if (index !== insertIndex) {
      const [gameObject] = group.games.splice(index, 1);
      group.games.splice(insertIndex, 0, gameObject);
    }

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
    if (/соревнование/.test(descText) || !this.maxGameCount) return false;
    const gameParams = parseGameParams(span, descText);
    const gameParamsString = JSON.stringify(gameParams);
    const currentGroup = getCurrentGroup(this.groups, this.currentGroupId);
    if (!currentGroup) return;
    for (let i = 0; i < currentGroup.games.length; i++) {
      if (JSON.stringify(currentGroup.games[i].params) === gameParamsString) {
        if (currentGroup.games[i].pin) return;
        currentGroup.games.splice(i, 1);
        break;
      }
    }
    const pinnedCount = this.getPinnedGameCount();
    while (currentGroup.games.length >= this.maxGameCount + pinnedCount) {
      currentGroup.games.pop();
    }
    const newGame = { params: gameParams, id: generateRandomId(), pin: 0 };
    currentGroup.games.splice(pinnedCount, 0, newGame);
    this.assignGameIds();
    this.saveGameData();
  }

  changeGameCount(delta) {
    if (delta < 0 && this.maxGameCount > 0) this.maxGameCount--;
    else if (delta > 0) this.maxGameCount++;
    const countDisplay = document.getElementById('latest-games-count');
    if (countDisplay) countDisplay.textContent = this.maxGameCount.toString();
    this.saveSettings();
    this.refreshContainer();
  }

  handlePageSpecificLogic() {
    const { href } = location;

    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      const gameLoading = document.getElementById('gameloading');
      if (!gameLoading) throw new Error('#gameloading element not found.');
      if (gameLoading.style.display !== 'none') {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          this.saveCurrentGameParams();
        });
        observer.observe(gameLoading, { attributes: true });
      } else {
        this.saveCurrentGameParams();
      }
    }
  }

  exposeGlobalFunctions() {
    window.latestGamesManager = this;
  }
}

(function addMontserratFont() {
  if (!document.getElementById('kg-latest-games-montserrat-font')) {
    const link = document.createElement('link');
    link.id = 'kg-latest-games-montserrat-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat&display=swap';
    document.head.appendChild(link);
  }
})();

// Initialize the LatestGamesManager instance
window.latestGamesManager ??= new LatestGamesManager();
