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
      this.main.enableDragging = settings.enableDragging ?? this.main.enableDragging;
      this.main.shouldAutoSave = settings.shouldAutoSave ?? this.main.shouldAutoSave;
      this.main.hidePanelDelay = settings.hidePanelDelay ?? this.main.hidePanelDelay;
      this.main.shouldStart = settings.shouldStart ?? this.main.shouldStart;
      this.main.startDelay = settings.startDelay ?? this.main.startDelay;
      this.main.shouldReplay = settings.shouldReplay ?? this.main.shouldReplay;
      this.main.replayDelay = settings.replayDelay ?? this.main.replayDelay;
      this.main.replayNextGame = settings.replayNextGame ?? this.main.replayNextGame;
      this.main.replayWithoutWaiting = settings.replayWithoutWaiting ?? this.main.replayWithoutWaiting;
      this.main.showSearchBox = settings.showSearchBox ?? this.main.showSearchBox;
      this.main.showButtonDescriptions = settings.showButtonDescriptions ?? this.main.showButtonDescriptions;
      this.main.showHelpTooltips = settings.showHelpTooltips ?? this.main.showHelpTooltips;

      // Handle panelYPosition and alwaysVisiblePanel as objects
      if (settings.panelYPosition && typeof settings.panelYPosition === 'object') {
        this.main.panelYPosition = {
          ...this.main.panelYPosition,
          ...settings.panelYPosition
        };
      }
      // Handle panelWidth and panelHeight as objects (per-page)
      if (settings.panelWidths && typeof settings.panelWidths === 'object') {
        this.main.panelWidths = {
          ...this.main.panelWidths,
          ...settings.panelWidths
        };
      }
      if (settings.panelHeights && typeof settings.panelHeights === 'object') {
        this.main.panelHeights = {
          ...this.main.panelHeights,
          ...settings.panelHeights
        };
      }
      // Ensure alwaysVisiblePanel is an object and merge settings
      if (settings.alwaysVisiblePanel && typeof settings.alwaysVisiblePanel === 'object') {
        this.main.alwaysVisiblePanel = {
          ...this.main.alwaysVisiblePanel,
          ...settings.alwaysVisiblePanel
        };
      }

    } catch (error) {
      console.warn('Could not load settings from localStorage:', error);
    }
  }

  saveSettings() {
    try {
      const settings = {
        maxGameCount: this.main.maxGameCount,
        currentTheme: this.main.currentTheme,
        displayMode: this.main.displayMode,
        groupViewMode: this.main.groupsManager.groupViewMode,
        previousScrollPosition: this.main.previousScrollPosition,
        panelWidths: this.main.panelWidths,
        panelHeights: this.main.panelHeights,
        enableDragging: this.main.enableDragging,
        shouldAutoSave: this.main.shouldAutoSave,
        hidePanelDelay: this.main.hidePanelDelay,
        shouldStart: this.main.shouldStart,
        startDelay: this.main.startDelay,
        shouldReplay: this.main.shouldReplay,
        replayDelay: this.main.replayDelay,
        replayNextGame: this.main.replayNextGame,
        replayWithoutWaiting: this.main.replayWithoutWaiting,
        showSearchBox: this.main.showSearchBox,
        showButtonDescriptions: this.main.showButtonDescriptions,
        showHelpTooltips: this.main.showHelpTooltips,
        panelYPosition: this.main.panelYPosition,
        alwaysVisiblePanel: this.main.alwaysVisiblePanel
      };

      localStorage.setItem('latestGamesSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Could not save settings to localStorage:', error);
    }
  }

  async importSettings(main) {
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
          main.settingsManager.loadSettings();
          main.gamesManager.loadGameData();
          main.uiManager.refreshContainer();
          main.themeManager.applyTheme();
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
  }

  exportSettings(main) {
    const all = {
      latestGamesSettings: JSON.parse(localStorage.getItem('latestGamesSettings') || '{}'),
      latestGamesData: { groups: main.groupsManager.groups, currentGroupId: main.groupsManager.currentGroupId }
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
  }

  removeAllSettings(main) {
    localStorage.removeItem('latestGamesSettings');
    localStorage.removeItem('latestGamesData');
    main.groupsManager.groups = [main.groupsManager.createGroup('Группа-1')];
    main.groupsManager.currentGroupId = main.groupsManager.groups[0].id;
    main.gamesManager.saveGameData();
    main.uiManager.refreshContainer();
  }
}
