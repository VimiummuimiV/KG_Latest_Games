import './styles.scss';
import { generateRandomId } from './utils.js';
import { setupFonts } from './font.js';
import { DEFAULTS } from './definitions.js';

// Managers
import { ThemeManager } from './managers/ThemeManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { GroupsManager } from './managers/GroupsManager.js';
import { ViewManager } from './managers/ViewManager.js';
import { PageHandler } from './managers/PageHandler.js';
import { UIManager } from './managers/UIManager.js';

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
    this.viewManager = new ViewManager(this);
    this.pageHandler = new PageHandler(this);
    this.uiManager = new UIManager(this);
  }

  init() {
    this.settingsManager.loadSettings();
    this.loadGameData();
    this.groupsManager.initializeGroups();
    this.uiManager.createHoverArea();
    this.uiManager.createContainer();
    this.alwaysVisiblePanel && this.uiManager.showContainer();
    this.uiManager.createPanelToggleButton();
    this.pageHandler.handlePageSpecificLogic();
    this.exposeGlobalFunctions();
    this.themeManager.applyTheme();
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

  changeGameCount(delta) {
    if (delta < 0 && this.maxGameCount > 0) this.maxGameCount--;
    else if (delta > 0) this.maxGameCount++;
    this.uiManager.updateGameCountDisplay();
    this.settingsManager.saveSettings();
    this.uiManager.refreshContainer();
  }

  deleteGame(id) {
    const result = this.findGameIndex(id);
    if (!result) return null;
    const { group, index } = result;
    const deletedGame = group.games.splice(index, 1)[0];
    this.assignGameIds();
    this.saveGameData();
    this.uiManager.refreshContainer();

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
    this.uiManager.refreshContainer();
  }

  exposeGlobalFunctions() {
    window.latestGamesManager = this;
  }
}

setupFonts();

// Initialize the LatestGamesManager instance
window.latestGamesManager ??= new LatestGamesManager();
