import { createElement, generateUniqueId } from '../utils.js';
import { gameTypes, visibilities, ranks, ranksMap } from '../definitions.js';
import { icons } from '../icons.js';
export class GamesManager {
  constructor(mainManager) {
    this.mainManager = mainManager;
  }

  // Game parsing and generation utilities
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
      levelFrom = ranksMap[levelMatches[1]] || 1;
      levelTo = ranksMap[levelMatches[2]] || 9;
    }

    const timeoutMatches = descText.match(/таймаут\s(\d+)\s(сек|мин)/);
    const timeout = timeoutMatches
      ? (timeoutMatches[2] === 'сек' ? parseInt(timeoutMatches[1], 10) : parseInt(timeoutMatches[1], 10) * 60)
      : 60;

    const qualification = /квалификация/.test(descText) ? 1 : 0;

    const result = {
      gametype: gameType,
      vocName,
      vocId,
      vocType: null,
      type,
      level_from: levelFrom,
      level_to: levelTo,
      timeout,
      qual: qualification,
      premium_abra: 0
    };

    return result;
  }

  generateGameName(game, opts = {}) {
    const gameType = gameTypes[game.params.gametype];
    const { vocName, timeout, type: visibility, level_from, level_to, qual } = game.params;

    // Determine if we need to show a state icon (paused/playing)
    let stateIcon = '';
    if (opts && opts.stateIcon) {
      stateIcon = opts.stateIcon;
    }

    const nameSpan = createElement('span', {
      className: `latest-game-name gametype-${game.params.gametype}`
    });
    nameSpan.appendChild(document.createTextNode(vocName === '' ? gameType : `«${vocName}»`));
    if (stateIcon) {
      const iconSpan = createElement('span', {
        className: 'latest-game-state-icon',
        innerHTML: stateIcon
      });
      nameSpan.appendChild(iconSpan);
    }

    // Only create the description span if the setting is enabled
    let descSpan = null;
    if (this.mainManager.showButtonDescriptions) {
      descSpan = createElement('span', {
        className: 'latest-game-description'
      });
    }

    const qualSpan = createElement('span', {
      className: 'latest-game-qual',
      innerHTML: qual ? icons.qualification : ''
    });

    let levelText = '';
    if (level_from !== 1 || level_to !== 9) {
      const levelFromName = ranks[level_from - 1];
      const levelToName = ranks[level_to - 1];
      levelText = ` ${levelFromName} - ${levelToName}`;
    }

    const levelsSpan = createElement('span', {
      className: 'latest-game-levels',
      textContent: levelText
    });

    if (descSpan) {
      descSpan.textContent = `${visibilities[visibility]}, ${timeout} секунд`;
      descSpan.appendChild(qualSpan);
      if (levelText) {
        descSpan.appendChild(levelsSpan);
      }
    }

    const container = createElement('div');
    container.appendChild(nameSpan);
    if (descSpan) container.appendChild(descSpan);

    return container.innerHTML;
  }

  generateGameLink(game) {
    const { gametype, vocId, type, level_from, level_to, timeout, qual } = game.params;

    const params = new URLSearchParams({
      gametype,
      type,
      timeout: timeout.toString(),
      submit: '1'
    });

    // Only add level_from and level_to for normal type
    if (type !== 'practice' && type !== 'private') {
      params.set('level_from', level_from.toString());
      params.set('level_to', level_to.toString());
    }

    if (vocId !== '') {
      params.set('voc', vocId);
    }

    if (qual) {
      params.set('qual', '1');
    }

    return `${location.protocol}//klavogonki.ru/create/?${params.toString()}`;
  }

  // Game data management methods
  loadGameData() {
    try {
      let data = localStorage.getItem('latestGamesData');
      if (data) {
        data = JSON.parse(data);
        if (Array.isArray(data)) {
          const groupId = generateUniqueId(data);
          const groups = [{ id: groupId, title: 'Группа-1', games: data }];
          const currentGroupId = groups[0].id;
          this.mainManager.groupsManager.setGroups(groups, currentGroupId);
          this.latestGamesData = {};
        } else if (data && Array.isArray(data.groups)) {
          this.mainManager.groupsManager.setGroups(data.groups, data.currentGroupId);
          this.latestGamesData = { previousGameId: data.previousGameId, latestGroupAddedGameId: data.latestGroupAddedGameId };
        } else {
          this.mainManager.groupsManager.setGroups([], null);
          this.latestGamesData = {};
        }
      } else {
        this.mainManager.groupsManager.setGroups([], null);
        this.latestGamesData = {};
      }
      this.migrateOldGameData();
      this.assignGameIds();
    } catch (error) {
      console.warn('Could not load game data from localStorage:', error);
      this.mainManager.groupsManager.setGroups([], null);
      this.latestGamesData = {};
    }
  }

  saveGameData() {
    try {
      const data = {
        groups: this.mainManager.groupsManager.groups,
        currentGroupId: this.mainManager.groupsManager.currentGroupId,
        previousGameId: this.latestGamesData?.previousGameId,
        latestGroupAddedGameId: this.latestGamesData?.latestGroupAddedGameId
      };
      localStorage.setItem('latestGamesData', JSON.stringify(data));
    } catch (error) {
      console.warn('Could not save game data to localStorage:', error);
    }
  }

  migrateOldGameData() {
    this.mainManager.groupsManager.groups.forEach(group => {
      group.games = group.games.map(game => {
        if (game.params.qual === 'on' || game.params.qual === '') {
          game.params.qual = game.params.qual === 'on' ? 1 : 0;
        }
        return game;
      });
    });
  }

  assignGameIds() {
    // Collect all existing ids to avoid duplicates
    const allGameIds = new Set();
    this.mainManager.groupsManager.groups.forEach(group => {
      group.games.forEach(game => {
        if (game.id) allGameIds.add(game.id);
      });
    });
    this.mainManager.groupsManager.groups.forEach(group => {
      group.games = group.games.map(game => {
        // Only assign a new id if missing or invalid
        if (!game.id || game.id === -1) {
          const newId = generateUniqueId(this.mainManager.groupsManager.groups);
          allGameIds.add(newId);
          return { ...game, id: newId };
        } else {
          // Keep existing id if valid
          allGameIds.add(game.id);
          return game;
        }
      });
    });
  }

  updateGameOrderFromDOM() {
    const currentGroup = this.mainManager.groupsManager.getCurrentGroup(
      this.mainManager.groupsManager.groups,
      this.mainManager.groupsManager.currentGroupId
    );
    if (!currentGroup) return;

    const gameElements = Array.from(document.querySelectorAll('#latest-games .latest-game'));
    currentGroup.games = gameElements.map(element => {
      const id = element.id.replace('latest-game-', '');
      return currentGroup.games.find(g => g.id === id);
    }).filter(game => game !== undefined);

    this.saveGameData();
  }

  findGameIndex(id) {
    for (const group of this.mainManager.groupsManager.groups) {
      const index = group.games.findIndex(game => game.id == id);
      if (index !== -1) return { group, index };
    }
    return null;
  }

  findGameById(id) {
    for (const group of this.mainManager.groupsManager.groups) {
      const game = group.games.find(g => g.id === id);
      if (game) return game;
    }
    return null;
  }

  deleteGame(id) {
    const result = this.findGameIndex(id);
    if (!result) return null;

    const { group, index } = result;
    const deletedGame = group.games.splice(index, 1)[0];

    this.assignGameIds();
    this.saveGameData();
    this.mainManager.uiManager.refreshContainer();

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
    this.mainManager.uiManager.refreshContainer();
  }

  changeGameCount(delta) {
    if (delta < 0 && this.mainManager.maxGameCount > 0) {
      this.mainManager.maxGameCount--;
    } else if (delta > 0) {
      this.mainManager.maxGameCount++;
    }

    this.mainManager.uiManager.updateGameCountDisplay();
    this.mainManager.settingsManager.saveSettings();
    this.mainManager.uiManager.refreshContainer();
  }

  getPreviousGameId() {
    return this.latestGamesData && this.latestGamesData.previousGameId
      ? this.latestGamesData.previousGameId
      : null;
  }

  getRandomGame() {
    // Ensure validVocabularies and randomVocabulariesType are available
    if (!(this.mainManager && this.mainManager.validVocabularies && typeof this.mainManager.validVocabularies === 'object' &&
          this.mainManager.randomVocabulariesType && typeof this.mainManager.randomVocabulariesType === 'object')) {
      return null;
    }

    // Get allowed vocabulary types based on randomVocabulariesType settings
    const allowedTypes = Object.keys(this.mainManager.randomVocabulariesType).filter(
      type => this.mainManager.randomVocabulariesType[type] === true
    );

    // Global random: generate params with a random voc id from allowed types
    if (this.mainManager.randomGameId === 'global') {
      // Collect IDs from allowed types only
      const allIds = allowedTypes
        .flatMap(type => this.mainManager.validVocabularies[type] || [])
        .filter(id => id !== undefined && id !== null);

      if (allIds.length === 0) {
        return null;
      }

      const idx = Math.floor(Math.random() * allIds.length);
      const randVocId = allIds[idx];

      return {
        mode: 'global',
        params: {
          gametype: 'voc',
          vocName: '',
          vocId: randVocId,
          vocType: null,
          type: 'normal',
          level_from: 1,
          level_to: 9,
          timeout: 10,
          qual: 0,
          premium_abra: 0
        }
      };
    }

    // Local random: pick a saved game from allowed types
    const all = [];
    this.mainManager.groupsManager.groups.forEach(group => {
      group.games.forEach(game => {
        // Only include games where vocType is in allowedTypes (or null/undefined for compatibility)
        if (!game.params.vocType || allowedTypes.includes(game.params.vocType)) {
          all.push({ game, groupId: group.id });
        }
      });
    });

    if (all.length === 0) return null;
    const idx = Math.floor(Math.random() * all.length);
    return { mode: 'local', game: all[idx].game, groupId: all[idx].groupId };
  }

  // Return a random game id from all groups (or null if none)
  getRandomGameId() {
    const res = this.getRandomGame();
    if (!res) return null;
    // For global mode return a structured object with url and params
    if (res.mode === 'global') {
      const fakeGame = { params: res.params };
      return {
        mode: 'global',
        id: res.params.vocId,
        params: res.params,
        url: this.generateGameLink(fakeGame)
      };
    }
    // For local mode return the game info and precomputed url
    return {
      mode: 'local',
      id: res.game ? res.game.id : null,
      game: res.game,
      groupId: res.groupId,
      url: res.game ? this.generateGameLink(res.game) : null
    };
  }

  // Try to obtain a valid random game id/url. This will repeatedly request
  // a candidate from getRandomGameId() and perform a lightweight HTTP
  // validation. On 403 responses it will retry up to maxAttempts.
  // Returns the same structured object as getRandomGameId() or null.
  async getValidRandomGameId(maxAttempts = 50) {
    const infinite = !maxAttempts || maxAttempts <= 0;
    for (let attempts = 0; infinite ? true : attempts < maxAttempts; attempts++) {
      const candidate = this.getRandomGameId();
      if (!candidate) return null;
      if (candidate.mode === 'local') return candidate;
      try {
        let resp = await fetch(candidate.url, { method: 'HEAD', cache: 'no-store' });
        if (resp.status === 405) resp = await fetch(candidate.url, { method: 'GET', cache: 'no-store' });
        if (resp.ok) {
          // Persist this played vocabulary id so it can be filtered out later
          try {
            const playedRaw = localStorage.getItem('playedVocabularies') || '[]';
            const played = JSON.parse(playedRaw);
            const idStr = String(candidate.id);
            
            // Check if already exists (handle both old array format and new object format)
            const alreadyExists = played.some(item => 
              typeof item === 'string' ? item === idStr : item.id === idStr
            );
            
            if (!alreadyExists) {
              // Create vocabulary object with full structure
              const vocabToAdd = {
                id: idStr,
                name: null,
                author: null,
                vocType: null,
                isNew: true
              };
              played.push(vocabToAdd);
              localStorage.setItem('playedVocabularies', JSON.stringify(played));
            }
          } catch (_) {}
          return candidate;
        }
        if (resp.status === 403) {
          try {
            if (this.mainManager && this.mainManager.showBlockedVocabAlert) {
              const u = `${location.protocol}//klavogonki.ru/vocs/${candidate.id}/`;
              try { if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(u); } catch (__) { }
              try { this.mainManager.lastTriedVocUrl = u; } catch (__) { }
              alert(`Этот словарь не предназначен для открытых игр — создать игру нельзя. URL скопирован: ${u}`);
            }
          } catch (__) { }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Error validating candidate URL', candidate.url, err);
      }
    }
    return null;
  }
}