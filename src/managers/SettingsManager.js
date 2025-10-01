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

      // Handle randomVocabulariesType state
      if (settings.randomVocabulariesType && typeof settings.randomVocabulariesType === 'object') {
        this.main.randomVocabulariesType = {
          ...this.main.randomVocabulariesType,
          ...settings.randomVocabulariesType
        };
      }

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
      const validRaw = localStorage.getItem('validVocabularies');
      if (validRaw) {
        const validParsed = JSON.parse(validRaw);
        
        if (!validParsed || typeof validParsed !== 'object' || Array.isArray(validParsed)) {
          this.main.validVocabularies = {};
          return;
        }
        
        // Normalize each type
        const normalized = {};
        for (const [type, arr] of Object.entries(validParsed)) {
          if (Array.isArray(arr)) {
            normalized[type] = this._normalizeVocabList(arr);
          }
        }
        
        // Filter out banned vocabularies and already-played vocabularies
        try {
          const bannedRaw = localStorage.getItem('bannedVocabularies');
          const playedRaw = localStorage.getItem('playedVocabularies');
          const bannedParsed = bannedRaw ? JSON.parse(bannedRaw) : [];
          const playedParsed = playedRaw ? JSON.parse(playedRaw) : [];
          
          if (Array.isArray(bannedParsed) || Array.isArray(playedParsed)) {
            // Extract IDs from both old format (strings) and new format (objects with id property)
            const bannedIds = Array.isArray(bannedParsed) ? bannedParsed.map(item => 
              typeof item === 'string' ? item : (typeof item === 'object' && item !== null ? (item.id || String(item)) : String(item))
            ) : [];
            
            const playedIds = Array.isArray(playedParsed) ? playedParsed.map(item =>
              typeof item === 'string' ? item : (typeof item === 'object' && item !== null ? (item.id || String(item)) : String(item))
            ) : [];
            
            const bannedSet = new Set(bannedIds.map(id => String(id)));
            const playedSet = new Set(playedIds.map(id => String(id)));
            const combined = new Set([...bannedSet, ...playedSet]);
            
            // Filter each type
            const filtered = {};
            for (const [type, arr] of Object.entries(normalized)) {
              filtered[type] = arr.filter(id => !combined.has(String(id)));
            }
            
            // Check if all types are empty
            const totalFiltered = Object.values(filtered).flat().length;
            const totalOriginal = Object.values(normalized).flat().length;
            
            if (totalFiltered === 0 && totalOriginal > 0) {
              const ok = confirm('Все доступные словари уже были проиграны. Очистить данные о проигранных словарях и начать заново?');
              if (ok) {
                localStorage.removeItem('playedVocabularies');
                // Re-filter with only banned
                const refilteredObject = {};
                for (const [type, arr] of Object.entries(normalized)) {
                  refilteredObject[type] = arr.filter(id => !bannedSet.has(String(id)));
                }
                this.main.validVocabularies = refilteredObject;
              } else {
                this.main.validVocabularies = {};
              }
              return;
            }
            
            this.main.validVocabularies = filtered;
            return;
          }
        } catch (err) {
          console.warn('Could not parse banned/played vocabularies from localStorage', err);
        }
        
        this.main.validVocabularies = normalized;
        return;
      }
    } catch (err) {
      console.warn('Could not parse validVocabularies from localStorage', err);
    }
    this.main.validVocabularies = {};
  }

  // Normalize and persist vocabulary object (with types) or convert array to object
  saveValidVocabularies(data) {
    try {
      let normalized;
      
      // Handle array input (old format)
      if (Array.isArray(data)) {
        normalized = { all: this._normalizeVocabList(data) };
      }
      // Handle object input (new format with types)
      else if (data && typeof data === 'object') {
        normalized = {};
        for (const [type, arr] of Object.entries(data)) {
          if (Array.isArray(arr)) {
            normalized[type] = this._normalizeVocabList(arr);
          }
        }
      } else {
        normalized = {};
      }
      
      localStorage.setItem('validVocabularies', JSON.stringify(normalized));
      this.main.validVocabularies = normalized;
      
      // Refresh UI so tooltips/counts reflect the new list immediately
      if (this.main.uiManager && typeof this.main.uiManager.refreshContainer === 'function') {
        this.main.uiManager.refreshContainer();
      }
      return normalized;
    } catch (err) {
      console.warn('Could not save validVocabularies to localStorage', err);
      return {};
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
        randomVocabulariesType: this.main.randomVocabulariesType,
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
          if (data.playedVocabularies) localStorage.setItem('playedVocabularies', JSON.stringify(data.playedVocabularies));
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
      bannedVocabularies: JSON.parse(localStorage.getItem('bannedVocabularies') || '[]'),
      playedVocabularies: JSON.parse(localStorage.getItem('playedVocabularies') || '[]')
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
