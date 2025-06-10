export class SettingsManager {
  constructor(target) {
    this.target = target;
  }

  loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('latestGamesSettings')) || {};
      this.target.maxGameCount = settings.gamesLimit || 5;
      this.target.currentTheme = settings.theme || 'light';
      this.target.displayMode = settings.displayMode || 'scroll';
      this.target.groupViewMode = settings.groupViewMode || 'tabs';
      this.target.previousScrollPosition = settings.previousScrollPosition || 0;
      this.target.panelYPosition = settings.panelYPosition || 0;
      this.target.panelWidth = settings.panelWidth || '95vw';
      this.target.shouldAutoSave = settings.shouldAutoSave !== false;
      this.target.enableDragging = settings.enableDragging !== undefined ? settings.enableDragging : true;
      this.target.alwaysVisiblePanel = settings.alwaysVisiblePanel !== undefined ? settings.alwaysVisiblePanel : false;
      this.target.shouldStart = settings.shouldStart !== undefined ? settings.shouldStart : false;
      this.target.startDelay = settings.startDelay !== undefined ? settings.startDelay : this.target.startDelay;
      this.target.shouldReplay = settings.shouldReplay !== undefined ? settings.shouldReplay : false;
      this.target.replayDelay = settings.replayDelay !== undefined ? settings.replayDelay : this.target.replayDelay;
    } catch (error) {
      console.warn('Could not load latest games settings from localStorage:', error);
      // Fallback to default settings
      this.target.maxGameCount = 5;
      this.target.currentTheme = 'light';
      this.target.displayMode = 'scroll';
      this.target.groupViewMode = 'tabs';
      this.target.previousScrollPosition = 0;
      this.target.panelYPosition = 0;
      this.target.panelWidth = '95vw';
      this.target.shouldAutoSave = true;
      this.target.enableDragging = true;
      this.target.alwaysVisiblePanel = false;
      this.target.shouldStart = false;
      this.target.startDelay = 1000;
      this.target.shouldReplay = false;
      this.target.replayDelay = 1000;
    }
  }

  saveSettings() {
    try {
      const settings = {
        gamesLimit: this.target.maxGameCount,
        theme: this.target.currentTheme,
        displayMode: this.target.displayMode,
        groupViewMode: this.target.groupViewMode,
        previousScrollPosition: this.target.previousScrollPosition,
        panelYPosition: this.target.panelYPosition,
        panelWidth: this.target.panelWidth,
        shouldAutoSave: this.target.shouldAutoSave,
        enableDragging: this.target.enableDragging,
        alwaysVisiblePanel: this.target.alwaysVisiblePanel,
        shouldStart: this.target.shouldStart,
        startDelay: this.target.startDelay,
        shouldReplay: this.target.shouldReplay,
        replayDelay: this.target.replayDelay
      };
      localStorage.setItem('latestGamesSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Could not save latest games settings to localStorage:', error);
    }
  }
}
