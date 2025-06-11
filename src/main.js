import './styles/styles.scss';
import { setupFonts } from './font.js';
import { DEFAULTS } from './definitions.js';

// Managers
import { ThemeManager } from './managers/ThemeManager.js';
import { SettingsManager } from './managers/SettingsManager.js';
import { GroupsManager } from './managers/GroupsManager.js';
import { ViewManager } from './managers/ViewManager.js';
import { PageHandler } from './managers/PageHandler.js';
import { UIManager } from './managers/UIManager.js';
import { GamesManager } from './managers/GamesManager.js';

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
    this.gamesManager = new GamesManager(this);
  }

  init() {
    this.settingsManager.loadSettings();
    this.gamesManager.loadGameData();
    this.groupsManager.initializeGroups();
    this.uiManager.createHoverArea();
    this.uiManager.createContainer();
    this.alwaysVisiblePanel && this.uiManager.showContainer();
    this.uiManager.createPanelToggleButton();
    this.pageHandler.handlePageSpecificLogic();
    this.exposeGlobalFunctions();
    this.themeManager.applyTheme();
  }

  exposeGlobalFunctions() {
    window.latestGamesManager = this;
  }
}

setupFonts();

// Initialize the LatestGamesManager instance
window.latestGamesManager ??= new LatestGamesManager();
