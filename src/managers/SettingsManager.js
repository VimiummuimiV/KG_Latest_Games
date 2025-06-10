export class SettingsManager {
  constructor(main) {
    this.main = main;
  }

  loadSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem('latestGamesSettings') || '{}');

      this.main.maxGameCount = settings.maxGameCount ?? this.main.maxGameCount;
      this.main.currentTheme = settings.currentTheme ?? this.main.currentTheme;
      this.main.displayMode = settings.displayMode ?? this.main.displayMode;
      this.main.groupsManager.groupViewMode = settings.groupViewMode ?? this.main.groupsManager.groupViewMode;
      this.main.previousScrollPosition = settings.previousScrollPosition ?? this.main.previousScrollPosition;
      this.main.panelWidth = settings.panelWidth ?? this.main.panelWidth;
      this.main.enableDragging = settings.enableDragging ?? this.main.enableDragging;
      this.main.shouldAutoSave = settings.shouldAutoSave ?? this.main.shouldAutoSave;
      this.main.alwaysVisiblePanel = settings.alwaysVisiblePanel ?? this.main.alwaysVisiblePanel;
      this.main.panelYPosition = settings.panelYPosition ?? this.main.panelYPosition;
      this.main.hidePanelDelay = settings.hidePanelDelay ?? this.main.hidePanelDelay;
      this.main.shouldStart = settings.shouldStart ?? this.main.shouldStart;
      this.main.startDelay = settings.startDelay ?? this.main.startDelay;
      this.main.shouldReplay = settings.shouldReplay ?? this.main.shouldReplay;
      this.main.replayDelay = settings.replayDelay ?? this.main.replayDelay;

    } catch (error) {
      console.warn('Could not load settings from localStorage:', error);
    }
  }

  // In SettingsManager.js - Add this to the saveSettings method:

  saveSettings() {
    try {
      const settings = {
        maxGameCount: this.main.maxGameCount,
        currentTheme: this.main.currentTheme,
        displayMode: this.main.displayMode,
        groupViewMode: this.main.groupsManager.groupViewMode,
        previousScrollPosition: this.main.previousScrollPosition,
        panelWidth: this.main.panelWidth,
        enableDragging: this.main.enableDragging,
        shouldAutoSave: this.main.shouldAutoSave,
        alwaysVisiblePanel: this.main.alwaysVisiblePanel,
        panelYPosition: this.main.panelYPosition,
        hidePanelDelay: this.main.hidePanelDelay,
        shouldStart: this.main.shouldStart,
        startDelay: this.main.startDelay,
        shouldReplay: this.main.shouldReplay,
        replayDelay: this.main.replayDelay
      };

      localStorage.setItem('latestGamesSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Could not save settings to localStorage:', error);
    }
  }
}
