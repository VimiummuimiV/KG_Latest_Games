import { icons } from '../icons.js';
import { createElement } from '../utils.js';
import { showMigrationPopup } from '../vocabularyMigration.js';
import { createGamePopup } from '../gamePopup.js';
import { setupResizeHandle } from '../panel/panelResize.js';
import { setupYPositioning } from '../panel/panelPosition.js';
import { createGameElement } from './UIHelpers/gameActionButtons.js';
import { createControls } from './UIHelpers/controls.js';
import { createSearchBox } from './UIHelpers/search.js';
import { createHoverArea, showContainer, hideContainer } from './UIHelpers/visibility.js';
import { createPanelToggleButton } from './UIHelpers/panelToggle.js';
import { createCustomTooltip } from '../tooltip.js';

export class UIManager {
  constructor(main) {
    this.main = main;
    // Bind helper functions with main pre-applied
    this.createGameElement = createGameElement.bind(null, this.main);
    this.createControls = createControls.bind(null, this.main);
    this.createSearchBox = createSearchBox.bind(null, this.main);
    this.createHoverArea = createHoverArea.bind(null, this.main);
    this.showContainer = showContainer.bind(null, this.main);
    this.hideContainer = hideContainer.bind(null, this.main);
    this.createPanelToggleButton = createPanelToggleButton.bind(null, this.main);
  }

  createContainer() {
    const container = createElement('div', { id: 'latest-games-container' });

    const searchBox = this.createSearchBox();
    container.appendChild(searchBox);

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

    const showGamePopupHandler = (e) => {
      const gameElement = e.target.closest('.latest-game');
      if (!gameElement) return;
      const gameId = gameElement.id.replace('latest-game-', '');
      const game = this.main.gamesManager.findGameById(gameId);
      if (game && !this.main.enableDragging) createGamePopup(game, e, this.main.gamesManager);
    };

    gamesList.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Prevent popup if Shift+Click on a button inside .latest-game-buttons
      if (e.shiftKey && e.target.closest('.latest-game-buttons')) {
        suppressClick = false;
        return;
      }
      if (e.shiftKey) {
        suppressClick = true;
        e.preventDefault();
        showGamePopupHandler(e);
      } else {
        longPressTimer = setTimeout(() => {
          suppressClick = true;
          e.preventDefault();
          showGamePopupHandler(e);
        }, 300);
      }
    });

    gamesList.addEventListener('mouseup', () => {
      clearTimeout(longPressTimer);
    });

    gamesList.addEventListener('click', (e) => {
      if (suppressClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressClick = false;
      }
    }, { capture: true });

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

    setupResizeHandle(this, container, handle);
    setupYPositioning(this, container);

    document.body.appendChild(container);

    this.main.groupsManager.updateGroupControlStates();
    this.main.viewManager.updateDisplayModeClass();

    const allTabs = container.querySelectorAll('.group-tab');
    allTabs.forEach(tab => {
      if (tab.getBoundingClientRect().width >= 300) {
        createCustomTooltip(tab, tab.textContent);
      }
    });

    const origUpdateDisplayModeClass = this.main.viewManager.updateDisplayModeClass.bind(this.main.viewManager);
    this.main.viewManager.updateDisplayModeClass = (...args) => {
      origUpdateDisplayModeClass(...args);
      setupResizeHandle(this, container, handle);
      setupYPositioning(this, container);
    };

    this.updateRemoveIcons();
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

  populateGamesList(gamesList) {
    gamesList.innerHTML = '';

    if (this.main.groupsManager.getGroupViewMode() === 'tabs') {
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
      this.main.groupsManager.groups.forEach(group => {
        if (group.games.length > 0) {
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

  updateRemoveIcons() {
    const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
    const removeGroupBtn = document.querySelector('.group-controls .remove-group.control-button');
    if (removeGroupBtn) {
      removeGroupBtn.innerHTML =
        currentGroup && currentGroup.games && currentGroup.games.length > 0
          ? icons.trashSomething
          : icons.trashNothing;
    }
    const removeAllBtn = document.querySelector('.latest-games-removeall.control-button');
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
}