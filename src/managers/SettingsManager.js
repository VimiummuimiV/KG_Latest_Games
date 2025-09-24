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
      this.main.shouldReplayMore = settings.shouldReplayMore ?? this.main.shouldReplayMore;
      this.main.replayNextGameCount = settings.replayNextGameCount ?? this.main.replayNextGameCount;

      // Replay more counter for the next game
      this.main.remainingReplayCount =
        settings.remainingReplayCount != null
          ? settings.remainingReplayCount
          : this.main.replayNextGameCount;

      this.main.replayWithoutWaiting = settings.replayWithoutWaiting ?? this.main.replayWithoutWaiting;
      this.main.showSearchBox = settings.showSearchBox ?? this.main.showSearchBox;
      this.main.showButtonDescriptions = settings.showButtonDescriptions ?? this.main.showButtonDescriptions;
      this.main.showHelpTooltips = settings.showHelpTooltips ?? this.main.showHelpTooltips;
      this.main.randomGameId = settings.randomGameId ?? this.main.randomGameId;
      this.main.showBlockedVocabAlert = settings.showBlockedVocabAlert ?? this.main.showBlockedVocabAlert;

      // Load persisted validVocabularies into runtime state
      this.loadValidVocabularies();

      // Handle panelYPosition and alwaysVisiblePanel as objects (per-page)
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

  // Normalize, dedupe and load validVocabularies from localStorage
  // Also filters out any vocabularies present in bannedVocabularies
  loadValidVocabularies() {
    try {
      const raw = localStorage.getItem('validVocabularies');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized = this._normalizeVocabList(parsed);
          
          // Filter out banned vocabularies
          try {
            const bannedRaw = localStorage.getItem('bannedVocabularies');
            if (bannedRaw) {
              const bannedParsed = JSON.parse(bannedRaw);
              if (Array.isArray(bannedParsed)) {
                const bannedSet = new Set(bannedParsed.map(id => String(id)));
                this.main.validVocabularies = normalized.filter(id => !bannedSet.has(String(id)));
                return;
              }
            }
          } catch (err) {
            console.warn('Could not parse bannedVocabularies from localStorage', err);
          }
          
          this.main.validVocabularies = normalized;
          return;
        }
      }
    } catch (err) {
      console.warn('Could not parse validVocabularies from localStorage', err);
    }
    this.main.validVocabularies = this.main.validVocabularies || [];
  }

  // Normalize and persist an array of vocab ids (strings or numbers)
  saveValidVocabularies(arr) {
    try {
      const normalized = this._normalizeVocabList(arr || []);
      localStorage.setItem('validVocabularies', JSON.stringify(normalized));
      this.main.validVocabularies = normalized;
      // Refresh UI so tooltips/counts reflect the new list immediately
      if (this.main.uiManager && typeof this.main.uiManager.refreshContainer === 'function') {
        this.main.uiManager.refreshContainer();
      }
      return normalized;
    } catch (err) {
      console.warn('Could not save validVocabularies to localStorage', err);
      return [];
    }
  }

  _normalizeVocabList(arr) {
    const seen = new Set();
    const out = [];
    for (let v of arr) {
      if (v === null || v === undefined) continue;
      // Keep original string/number but trim strings
      if (typeof v === 'string') v = v.trim();
      // skip empty or values without any digit characters
      if (v === '' || v === null || v === undefined) continue;
      // Require the whole trimmed value to be digits only (reject mixed values like "123a" or "12-3")
      if (!/^\d+$/.test(String(v))) continue;
      const key = String(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }

  // Add a vocabulary ID to the banned list and persist
  addToBannedVocabularies(vocabId) {
    if (!vocabId) return false;
    
    try {
      const bannedRaw = localStorage.getItem('bannedVocabularies') || '[]';
      const banned = JSON.parse(bannedRaw);
      
      if (banned.includes(String(vocabId))) {
        return false; // Already banned
      }
      
      banned.push(String(vocabId));
      localStorage.setItem('bannedVocabularies', JSON.stringify(banned));
      
      // Reload valid vocabularies to apply filter
      this.loadValidVocabularies();
      
      return true;
    } catch (err) {
      console.warn('Could not add to banned vocabularies:', err);
      return false;
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
        panelYPosition: this.main.panelYPosition,
        enableDragging: this.main.enableDragging,
        shouldAutoSave: this.main.shouldAutoSave,
        hidePanelDelay: this.main.hidePanelDelay,
        shouldStart: this.main.shouldStart,
        startDelay: this.main.startDelay,
        shouldReplay: this.main.shouldReplay,
        replayDelay: this.main.replayDelay,
        replayNextGame: this.main.replayNextGame,
        shouldReplayMore: this.main.shouldReplayMore,
        replayNextGameCount: this.main.replayNextGameCount,
        remainingReplayCount: this.main.remainingReplayCount,
        replayWithoutWaiting: this.main.replayWithoutWaiting,
        showSearchBox: this.main.showSearchBox,
        showButtonDescriptions: this.main.showButtonDescriptions,
        showHelpTooltips: this.main.showHelpTooltips,
        showBlockedVocabAlert: this.main.showBlockedVocabAlert,
        randomGameId: this.main.randomGameId,
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
          if (data.validVocabularies) localStorage.setItem('validVocabularies', JSON.stringify(data.validVocabularies));
          if (data.bannedVocabularies) localStorage.setItem('bannedVocabularies', JSON.stringify(data.bannedVocabularies));
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
      latestGamesData: { groups: main.groupsManager.groups, currentGroupId: main.groupsManager.currentGroupId },
      validVocabularies: JSON.parse(localStorage.getItem('validVocabularies') || '[]'),
      bannedVocabularies: JSON.parse(localStorage.getItem('bannedVocabularies') || '[]')
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
