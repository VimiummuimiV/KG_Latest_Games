export class SettingsManager {
  constructor(main) {
    this.main = main;
  }

  loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('latestGamesSettings')) || {};
      this.main.maxGameCount = settings.gamesLimit || 5;
      this.main.currentTheme = settings.theme || 'light';
      this.main.displayMode = settings.displayMode || 'scroll';
      this.main.groupViewMode = settings.groupViewMode || 'tabs';
      this.main.previousScrollPosition = settings.previousScrollPosition || 0;
      this.main.panelYPosition = settings.panelYPosition || 0;
      this.main.panelWidth = settings.panelWidth || '95vw';
      this.main.shouldAutoSave = settings.shouldAutoSave !== false;
      this.main.enableDragging = settings.enableDragging !== undefined ? settings.enableDragging : true;
      this.main.alwaysVisiblePanel = settings.alwaysVisiblePanel !== undefined ? settings.alwaysVisiblePanel : false;
      this.main.shouldStart = settings.shouldStart !== undefined ? settings.shouldStart : false;
      this.main.startDelay = settings.startDelay !== undefined ? settings.startDelay : this.main.startDelay;
      this.main.shouldReplay = settings.shouldReplay !== undefined ? settings.shouldReplay : false;
      this.main.replayDelay = settings.replayDelay !== undefined ? settings.replayDelay : this.main.replayDelay;
    } catch (error) {
      console.warn('Could not load latest games settings from localStorage:', error);
      // Fallback to default settings
      this.main.maxGameCount = 5;
      this.main.currentTheme = 'light';
      this.main.displayMode = 'scroll';
      this.main.groupViewMode = 'tabs';
      this.main.previousScrollPosition = 0;
      this.main.panelYPosition = 0;
      this.main.panelWidth = '95vw';
      this.main.shouldAutoSave = true;
      this.main.enableDragging = true;
      this.main.alwaysVisiblePanel = false;
      this.main.shouldStart = false;
      this.main.startDelay = 1000;
      this.main.shouldReplay = false;
      this.main.replayDelay = 1000;
    }
  }

  saveSettings() {
    try {
      const settings = {
        gamesLimit: this.main.maxGameCount,
        theme: this.main.currentTheme,
        displayMode: this.main.displayMode,
        groupViewMode: this.main.groupViewMode,
        previousScrollPosition: this.main.previousScrollPosition,
        panelYPosition: this.main.panelYPosition,
        panelWidth: this.main.panelWidth,
        shouldAutoSave: this.main.shouldAutoSave,
        enableDragging: this.main.enableDragging,
        alwaysVisiblePanel: this.main.alwaysVisiblePanel,
        shouldStart: this.main.shouldStart,
        startDelay: this.main.startDelay,
        shouldReplay: this.main.shouldReplay,
        replayDelay: this.main.replayDelay
      };
      localStorage.setItem('latestGamesSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Could not save latest games settings to localStorage:', error);
    }
  }
}
