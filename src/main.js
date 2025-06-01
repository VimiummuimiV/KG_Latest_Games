import { icons } from './icons';
import './styles.scss';

// Utility to generate a unique random string id
function generateRandomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => (b % 36).toString(36))
    .join('');
}

class LatestGamesManager {
  constructor() {
    // Initialize settings with defaults
    this.maxGameCount = 5;
    this.currentTheme = 'light';
    this.displayMode = 'scroll';
    this.previousScrollPosition = 0;
    this.panelWidth = '95vw';
    this.gameData = [];
    this.hoverTimeout = null;
    this.isHovered = false;
    this.isDragging = false;
    this.wasDragging = false;
    this.dragThreshold = 50;
    this.draggedElement = null;
    this.dragOffset = { x: 0, y: 0 };
    this.dragDirection = 0;
    this.lastDragDirection = 0;
    this.rotationAccumulator = 0;
    this.rotationDegreeLimit = 5;
    this.lastDragY = 0;
    this.hidePanelDelay = 1000;
    this.globalEvents = {};

    this.gameTypes = {
      normal: 'Oбычный',
      abra: 'Абракадабра',
      referats: 'Яндекс.Рефераты',
      noerror: 'Безошибочный',
      marathon: 'Марафон',
      chars: 'Буквы',
      digits: 'Цифры',
      sprint: 'Спринт',
      voc: 'По словарю'
    };

    this.visibilities = {
      normal: 'открытый',
      private: 'дружеский',
      practice: 'одиночный'
    };

    this.ranks = [
      "новички", "любители", "таксисты", "профи",
      "гонщики", "маньяки", "супермены", "кибергонщики", "экстракиберы"
    ];

    this.ranksMap = {
      'новичков': 1, 'любителей': 2, 'таксистов': 3, 'профи': 4,
      'гонщиков': 5, 'маньяков': 6, 'суперменов': 7,
      'кибергонщиков': 8, 'экстракиберов': 9
    };

    this.init();
  }

  init() {
    this.loadSettings();
    this.loadGameData();
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
    if (svg) {
      this.updateThemeIcon(svg);
    }
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.saveSettings();
    this.applyTheme();
    this.updateThemeToggle();
  }

  createThemeToggle() {
    const toggleButton = this.createElement('div', {
      className: 'theme-toggle control-button',
      title: 'Изменить тему (Светлая/Темная)'
    });

    const svg = this.createElement('svg', {
      viewBox: '0 0 24 24'
    });

    this.updateThemeIcon(svg);
    toggleButton.appendChild(svg);

    toggleButton.addEventListener('click', () => {
      this.toggleTheme();
    });

    return toggleButton;
  }

  createDisplayModeToggle() {
    const toggleButton = this.createElement('div', {
      className: 'display-mode-toggle control-button',
      title: 'Переключить режим отображения (Вертикальный/Горизонтальный)'
    });
    const svg = this.createElement('svg', {
      viewBox: '0 0 24 24'
    });
    this.updateDisplayModeIcon(svg, this.displayMode);
    toggleButton.appendChild(svg);
    toggleButton.addEventListener('click', () => {
      const newMode = this.getDisplayMode() === 'scroll' ? 'wrap' : 'scroll';
      this.setDisplayMode(newMode);
      this.updateDisplayModeIcon(svg, newMode);
      this.updateDisplayModeClass();
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
    const li = this.createElement('li', {
      className: `latest-game${game.pin ? ' pin-game' : ''}${gametypeClass}`,
      id: `latest-game-${id}`
    });

    const buttons = this.createElement('div', {
      className: 'latest-game-buttons'
    });

    const pinButton = this.createElement('div', {
      className: 'latest-game-pin',
      title: game.pin ? 'Открепить' : 'Закрепить',
      innerHTML: icons.pin
    });
    pinButton.addEventListener('click', () => this.pinGame(id));

    const deleteButton = this.createElement('div', {
      className: 'latest-game-delete',
      title: 'Удалить',
      innerHTML: icons.delete
    });
    deleteButton.addEventListener('click', () => this.deleteGame(id));

    buttons.appendChild(pinButton);
    buttons.appendChild(deleteButton);

    const link = this.createElement('a', {
      href: this.generateGameLink(game),
      innerHTML: this.generateGameName(game)
    });

    link.addEventListener('click', (e) => {
      if (this.wasDragging) {
        e.preventDefault();
        this.wasDragging = false;
      }
    });

    li.appendChild(buttons);
    li.appendChild(link);

    if (game.pin) {
      this.addDragFunctionality(li, id);
    }

    return li;
  }

  createControls() {
    const controlsContainer = this.createElement('div', {
      className: 'latest-games-controls'
    });

    const pinAllBtn = this.createElement('span', {
      className: 'latest-games-pinall control-button',
      title: 'Закрепить все',
      innerHTML: icons.pinAll
    });
    pinAllBtn.onclick = () => {
      this.gameData.forEach(g => g.pin = 1);
      this.saveGameData();
      this.refreshContainer();
    };

    const unpinAllBtn = this.createElement('span', {
      className: 'latest-games-unpinall control-button',
      title: 'Открепить все',
      innerHTML: icons.unpinAll
    });
    unpinAllBtn.onclick = () => {
      this.gameData.forEach(g => g.pin = 0);
      this.saveGameData();
      this.refreshContainer();
    };

    const importBtn = this.createElement('span', {
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
            if (data.latestGamesData) localStorage.setItem('latestGamesData', JSON.stringify(data.latestGames));
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

    const exportBtn = this.createElement('span', {
      className: 'latest-games-export control-button',
      title: 'Экспортировать все настройки в JSON файл',
      innerHTML: icons.export
    });
    exportBtn.onclick = () => {
      const all = {
        latestGamesSettings: JSON.parse(localStorage.getItem('latestGamesSettings') || '{}'),
        latestGames: JSON.parse(localStorage.getItem('latestGamesData') || '[]')
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

    const removeAllBtn = this.createElement('span', {
      className: 'latest-games-removeall control-button',
      title: 'Удалить все настройки',
      innerHTML: icons.removeAll
    });
    removeAllBtn.onclick = () => {
      localStorage.removeItem('latestGamesSettings');
      localStorage.removeItem('latestGamesData');
      this.gameData = [];
      this.saveGameData();
      this.refreshContainer();
    };

    const options = this.createElement('span', {
      id: 'latest-games-options'
    });

    const decreaseBtn = this.createElement('span', {
      id: 'latest-games-count-dec',
      className: 'control-button',
      title: 'Уменьшить количество сохраняемых игр',
      innerHTML: icons.decrease
    });

    const countDisplay = this.createElement('span', {
      id: 'latest-games-count',
      textContent: this.maxGameCount.toString()
    });

    const increaseBtn = this.createElement('span', {
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
    const container = this.createElement('div', {
      id: 'latest-games-container'
    });

    const gamesList = this.createElement('ul', {
      id: 'latest-games'
    });

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

    container.addEventListener('mouseenter', () => {
      this.showContainer();
    });

    container.addEventListener('mouseleave', () => {
      this.hideContainerWithDelay();
    });

    // Always add the resize handle as part of the panel
    let handle = container.querySelector('.resize-handle');
    if (!handle) {
      handle = this.createElement('div', { className: 'resize-handle' });
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
      const savedGames = localStorage.getItem('latestGamesData');
      if (savedGames) {
        this.gameData = JSON.parse(savedGames);
        this.migrateOldGameData();
        this.assignGameIds();
      }
    } catch (error) {
      console.warn('Could not load game data from localStorage:', error);
      this.gameData = [];
    }
  }

  migrateOldGameData() {
    this.gameData = this.gameData.map(game => {
      if (game.params.qual === 'on' || game.params.qual === '') {
        game.params.qual = game.params.qual === 'on' ? 1 : 0;
      }
      return game;
    });
  }

  assignGameIds() {
    this.gameData = this.gameData.map(game => {
      if (!('id' in game) || game.id === -1 || game.id === undefined || game.id === null) {
        return { ...game, id: generateRandomId() };
      }
      return game;
    });
  }

  saveGameData() {
    try {
      localStorage.setItem('latestGamesData', JSON.stringify(this.gameData));
    } catch (error) {
      console.warn('Could not save game data to localStorage:', error);
    }
  }

  createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.id) {
      element.id = options.id;
    }

    if (options.innerHTML) {
      element.innerHTML = options.innerHTML;
    }

    if (options.textContent) {
      element.textContent = options.textContent;
    }

    if (options.href) {
      element.href = options.href;
    }

    if (options.title) {
      element.title = options.title;
    }

    if (options.src) {
      element.src = options.src;
    }

    if (options.style) {
      Object.assign(element.style, options.style);
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    return element;
  }

  generateGameName(game) {
    const gameType = this.gameTypes[game.params.gametype];
    const { vocName, timeout, type: visibility, level_from, level_to, qual } = game.params;

    const nameSpan = this.createElement('span', {
      className: `latest-game-name gametype-${game.params.gametype}`,
      textContent: vocName === '' ? gameType : `«${vocName}»`
    });

    const descSpan = this.createElement('span', {
      className: 'latest-game-description'
    });

    const qualSpan = this.createElement('span', {
      className: 'latest-game-qual',
      textContent: qual ? ' (к)' : ''
    });

    let levelText = '';
    if (level_from !== 1 || level_to !== 9) {
      const levelFromName = this.ranks[level_from - 1];
      const levelToName = this.ranks[level_to - 1];
      levelText = ` ${levelFromName} - ${levelToName}`;
    }

    const levelsSpan = this.createElement('span', {
      className: 'latest-game-levels',
      textContent: levelText
    });

    descSpan.textContent = `${this.visibilities[visibility]}, ${timeout} сек.`;
    descSpan.appendChild(qualSpan);
    if (levelText) {
      descSpan.appendChild(levelsSpan);
    }

    const container = this.createElement('div');
    container.appendChild(nameSpan);
    container.appendChild(descSpan);

    return container.innerHTML;
  }

  generateGameLink(game) {
    const { gametype, vocId, type, level_from, level_to, timeout, qual } = game.params;

    const params = new URLSearchParams({
      gametype,
      type,
      level_from: level_from.toString(),
      level_to: level_to.toString(),
      timeout: timeout.toString(),
      submit: '1'
    });

    if (vocId !== '') {
      params.set('voc', vocId);
    }

    if (qual) {
      params.set('qual', '1');
    }

    return `${location.protocol}//klavogonki.ru/create/?${params.toString()}`;
  }

  addDragFunctionality(element) {
    element.addEventListener('mousedown', (e) => {
      this.wasDragging = false;
      this.initialX = e.clientX;
      this.initialY = e.clientY;

      this.isDragging = true;
      this.draggedElement = element;
      const rect = element.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      this.isRightHalf = clickX > rect.width / 2;
      this.lastDragY = e.clientY;
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };

      element.classList.add('dragging');

      const displayMode = this.getDisplayMode();
      if (displayMode === 'wrap') {
        element.style.position = 'absolute';
        element.style.left = `${rect.left - element.parentElement.getBoundingClientRect().left}px`;
        element.style.top = `${rect.top - element.parentElement.getBoundingClientRect().top}px`;
        element.style.width = `${rect.width}px`;
      }

      this.globalEvents.handleDragMove = this.handleDragMove.bind(this);
      this.globalEvents.handleDragEnd = this.handleDragEnd.bind(this);
      document.addEventListener('mousemove', this.globalEvents.handleDragMove);
      document.addEventListener('mouseup', this.globalEvents.handleDragEnd);
    });
  }

  handleDragMove(e) {
    if (!this.isDragging || !this.draggedElement) return;

    if (!this.wasDragging) {
      if (Math.abs(e.clientX - this.initialX) > this.dragThreshold ||
        Math.abs(e.clientY - this.initialY) > this.dragThreshold) {
        this.wasDragging = true;
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
        if (firstPinned) {
          gamesList.insertBefore(this.draggedElement, firstPinned);
        }
      }
    } else {
      const containerRect = gamesList.getBoundingClientRect();
      let newLeft = e.clientX - this.dragOffset.x - containerRect.left;
      let newTop = e.clientY - this.dragOffset.y - containerRect.top;

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
      if (this.rotationAccumulator > this.rotationDegreeLimit) {
        this.rotationAccumulator = this.rotationDegreeLimit;
      } else if (this.rotationAccumulator < -this.rotationDegreeLimit) {
        this.rotationAccumulator = -this.rotationDegreeLimit;
      }
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
    const gameElements = Array.from(document.querySelectorAll('#latest-games .latest-game'));
    const newGameData = [];

    gameElements.forEach(element => {
      const id = element.id.replace('latest-game-', '');
      const game = this.gameData.find(g => g.id === id);
      if (game) {
        newGameData.push(game);
      }
    });

    this.gameData = newGameData;
    this.assignGameIds();
    this.saveGameData();
  }

  getPinnedGameCount() {
    return this.gameData.filter(game => game.pin).length;
  }

  createHoverArea() {
    const hoverArea = this.createElement('div', {
      id: 'latest-games-hover-area'
    });

    hoverArea.addEventListener('mouseenter', () => {
      this.showContainer();
    });

    hoverArea.addEventListener('mouseleave', () => {
      this.hideContainerWithDelay();
    });

    document.body.appendChild(hoverArea);
  }

  populateGamesList(gamesList) {
    gamesList.innerHTML = '';
    const pinnedCount = this.getPinnedGameCount();
    const maxGamesToShow = Math.min(this.gameData.length, this.maxGameCount + pinnedCount);

    for (let i = 0; i < maxGamesToShow; i++) {
      const game = this.gameData[i];
      const gameElement = this.createGameElement(game, game.id);
      gamesList.appendChild(gameElement);
    }
  }

  showContainer() {
    this.isHovered = true;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    const container = document.getElementById('latest-games-container');
    if (container) {
      container.classList.add('visible');
      container.style.left = '0';
      container.scrollTop = this.previousScrollPosition;
    }
  }

  hideContainerWithDelay() {
    this.isHovered = false;
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
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
    const gamesList = document.getElementById('latest-games');
    if (gamesList) {
      this.populateGamesList(gamesList);
      this.updateDisplayModeClass();
    }
  }

  findGameIndex(id) {
    return this.gameData.findIndex(game => game.id == id);
  }

  deleteGame(id) {
    const index = this.findGameIndex(id);
    if (index === -1) return null;

    const deletedGame = this.gameData.splice(index, 1)[0];
    this.assignGameIds();
    this.saveGameData();
    this.refreshContainer();

    return deletedGame;
  }

  pinGame(id) {
    const gameIndex = this.findGameIndex(id);
    if (gameIndex === -1) return;

    const game = this.gameData[gameIndex];
    game.pin = game.pin ? 0 : 1;

    const insertIndex = game.pin ?
      this.gameData.findIndex(g => !g.pin || g === game) :
      this.gameData.findIndex(g => !g.pin && g !== game);

    if (gameIndex !== insertIndex) {
      const [gameObject] = this.gameData.splice(gameIndex, 1);
      this.gameData.splice(insertIndex, 0, gameObject);
    }

    this.assignGameIds();
    this.saveGameData();
    this.refreshContainer();
  }

  saveCurrentGameParams() {
    const gameDesc = document.getElementById('gamedesc');
    if (!gameDesc) {
      throw new Error('#gamedesc element not found.');
    }

    const span = gameDesc.querySelector('span');
    if (!span) {
      throw new Error('#gamedesc span element not found.');
    }

    const descText = gameDesc.textContent;
    if (/соревнование/.test(descText) || !this.maxGameCount) {
      return false;
    }

    const gameParams = this.parseGameParams(span, descText);
    const gameParamsString = JSON.stringify(gameParams);

    for (let i = 0; i < this.gameData.length; i++) {
      if (JSON.stringify(this.gameData[i].params) === gameParamsString) {
        if (this.gameData[i].pin) {
          return;
        } else {
          this.gameData.splice(i, 1);
          break;
        }
      }
    }

    const pinnedCount = this.getPinnedGameCount();
    while (this.gameData.length >= this.maxGameCount + pinnedCount) {
      this.gameData.pop();
    }

    const newGame = {
      params: gameParams,
      id: generateRandomId(),
      pin: 0
    };

    this.gameData.splice(pinnedCount, 0, newGame);
    this.assignGameIds();
    this.saveGameData();
  }

  parseGameParams(span, descText) {
    const gameType = span.className.split('-').pop();
    const vocName = gameType === 'voc' ? span.textContent.replace(/[«»]/g, '') : '';

    let vocId = '';
    if (gameType === 'voc') {
      const vocLink = span.querySelector('a');
      if (vocLink) {
        const match = vocLink.href.match(/vocs\/(\d+)/);
        vocId = match ? parseInt(match[1], 10) : '';
      }
    }

    let type = 'normal';
    if (/одиночный/.test(descText)) {
      type = 'practice';
    } else if (/друзьями/.test(descText)) {
      type = 'private';
    }

    let levelFrom = 1;
    let levelTo = 9;
    const levelMatches = descText.match(/для (\S+)–(\S+),/);
    if (levelMatches) {
      levelFrom = this.ranksMap[levelMatches[1]] || 1;
      levelTo = this.ranksMap[levelMatches[2]] || 9;
    }

    const timeoutMatches = descText.match(/таймаут\s(\d+)\s(сек|мин)/);
    const timeout = timeoutMatches
      ? (timeoutMatches[2] === 'сек' ? parseInt(timeoutMatches[1], 10) : parseInt(timeoutMatches[1], 10) * 60)
      : 60;

    const qualification = /квалификация/.test(descText) ? 1 : 0;

    return {
      gametype: gameType,
      vocName,
      vocId,
      type,
      level_from: levelFrom,
      level_to: levelTo,
      timeout,
      qual: qualification,
      premium_abra: 0
    };
  }

  changeGameCount(delta) {
    if (delta < 0 && this.maxGameCount > 0) {
      this.maxGameCount--;
    } else if (delta > 0) {
      this.maxGameCount++;
    }

    const countDisplay = document.getElementById('latest-games-count');
    if (countDisplay) {
      countDisplay.textContent = this.maxGameCount.toString();
    }

    this.saveSettings();
    this.refreshContainer();
  }

  handlePageSpecificLogic() {
    const { href } = location;

    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      const gameLoading = document.getElementById('gameloading');
      if (!gameLoading) {
        throw new Error('#gameloading element not found.');
      }

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

function initializeLatestGames() {
  if (!document.getElementById('KG_LatestGames')) {
    new LatestGamesManager();

    const marker = document.createElement('div');
    marker.id = 'KTS_LatestGames';
    marker.style.display = 'none';
    document.body.appendChild(marker);
  }
}

initializeLatestGames();