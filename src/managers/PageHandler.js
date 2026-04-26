import { highlightExistingVocabularies } from "../vocabularyChecker.js";
import { attachVocabularyCreation } from "../vocabularyCreation.js";
import { attachVocabularyParser, getSessionVocId } from "../vocabularyContent.js";
import { sleep, generateUniqueId } from "../utils.js";
import { isVocabularyCreationSupported } from "../vocabularyCreation.js";
import { detectGameType } from "../utils.js";
import { GamesDataContainer } from "./GamesDataContainer.js";
import { advancePlaylist, getActivePlaylistSession, getActivePlaylistUrl, PlaylistsManager } from "../playlistsManager.js";
import { gameSelectors } from "../definitions.js";

export class PageHandler {
  constructor(main) {
    this.main = main;
    // Initialize the games data container
    this.gamesDataContainer = new GamesDataContainer(main);
    // Initialize sleep indicators and timers
    this.replaySleep = null;
    this.startSleep = null;
    // Flag to track if the cursor is over any interactive panel (container) that should suppress the replay timer
    this.isHoveringInteractivePanel = false;
    this.remainingReplayCount = this.main.replayNextGameCount;
  }

  handlePageSpecificLogic() {
    const { href } = location;

    if (/https?:\/\/klavogonki\.ru\/create\//.test(href)) {
      const checkVocError = () => {
        const msg = document.querySelector('#content p[align="center"]');
        if (!msg) return false;
        this.handleVocabularyError(msg.innerText || '');
        return true;
      };
      if (!checkVocError()) {
        const errorObserver = new MutationObserver(() => {
          if (checkVocError()) errorObserver.disconnect();
        });
        errorObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    // On non-game pages show the playlist indicator if the playlist is paused
    if (!/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      this.gamesDataContainer.createPausedPlaylistIndicator();
    }

    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      // Create the games data container with indicators
      this.gamesDataContainer.createGamesDataContainer();
      
      this.setupHoverListeners();

      const startObserver = new MutationObserver(() => {
        const gameDescription = document.querySelector('#gamedesc');
        if (gameDescription && gameDescription.textContent) {
          startObserver.disconnect();
          this.saveCurrentGameParams();
          this.handleStartAction();
        }
      });
      startObserver.observe(document.body, { childList: true, subtree: true });

      // Choose which element to observe based on replayWithoutWaiting setting
      const elementToObserve = this.main.replayWithoutWaiting
        ? document.querySelector(gameSelectors.finish.immediate)
        : document.querySelector(gameSelectors.finish.normal);

      if (elementToObserve) {
        const finishObserver = new MutationObserver(() => {
          finishObserver.disconnect();
          // Mark any pending played vocabulary after the game finishes
          try {
            const pending = getSessionVocId();
            if (pending) {
              try {
                // Only mark as played when the current page indicates a vocabulary game
                if (detectGameType().category === 'vocabulary') {
                  try { this.main.gamesManager.markVocabAsPlayed(pending); } catch (__) { }
                  // Update today count indicator in realtime
                  try { this.gamesDataContainer.updateTodayIndicator(); } catch (__) { }
                }
              } catch (__) { }
            }
          } catch (__) { }
          // If a playlist is active and running (not paused), let it take over.
          // Paused means the user played from the main panel — fall through to normal replay.
          if (getActivePlaylistSession() && !getActivePlaylistSession().paused) {
            const result = advancePlaylist(this.main);
            // Update the HUD indicator after advancing (new session values are now in storage)
            try { this.gamesDataContainer.updatePlaylistIndicator(); } catch { }
            try { PlaylistsManager.updateActiveEntryProgress(); } catch { }
            if (result === 'paused') {
              // Playlist is paused — user navigated away manually, do nothing
              return;
            }
            if (result && result.url) {
              // Playlist has a next game — respect replayDelay before navigating
              this.handlePlaylistReplay(result.url);
              return;
            }
            // result === false: playlist finished — fall through to normal replay
          }
          // No active playlist or playlist just finished — proceed with normal replay handling
          this.handleReplayAction();
        });
        finishObserver.observe(elementToObserve, { attributes: true });
      }
    }

    // Highlight vocabularies and attach vocabulary creation popup on supported pages
    if (isVocabularyCreationSupported()) {
      highlightExistingVocabularies(this.main.groupsManager.groups);
      attachVocabularyCreation(this.main.groupsManager.groups, this.main);
      attachVocabularyParser();
    }
  }

  // Handles vocabulary error messages shown on the game page instead of a game room.
  // Detects non-public and removed states, updates saved games and notifies the user.
  handleVocabularyError(msgText) {
    const isNonPublic = msgText.includes('Открытые заезды можно создавать только по публичным словарям');
    const isRemoved   = msgText.includes('Словарь не найден');
    if (!isNonPublic && !isRemoved) return;

    let vocId = null;
    try { vocId = JSON.parse(sessionStorage.getItem('latestGames_pendingVocId'))?.vocId || null; } catch (_) {}

    if (!vocId) return;

    const games = this.main.gamesManager.findGamesByVocId(vocId);
    if (!games.length) return;

    const vocName = games[0].params.vocName || `#${vocId}`;

    if (isRemoved) {
      if (games.every(g => g.params.vocIsRemoved === true)) return;
      games.forEach(g => { g.params.vocIsRemoved = true; });
      this.main.gamesManager.saveGameData();
      this.main.uiManager.refreshContainer();
      alert(`🗑️ Словарь «${vocName}» недоступен.\n\nСловарь был удалён модераторами. Все игры с этим словарём помечены как удалённые.`);
      return;
    }

    // isNonPublic: only normal-type games are affected — practice and private can
    // still be created with a non-public vocabulary.
    const hasUnhandledNormal = games.some(g => g.params.type === 'normal');
    if (!hasUnhandledNormal && games.every(g => g.params.vocIsPublic === false)) return;

    games.forEach(g => {
      g.params.vocIsPublic = false;
      if (g.params.type === 'normal') { g.params.type = 'practice'; g.params.timeout = 5; }
    });
    this.main.gamesManager.saveGameData();
    this.main.uiManager.refreshContainer();

    if (confirm(
      `🔒 Словарь «${vocName}» стал непубличным.\n\n` +
      `Параметры открытых игр с этим словарём были автоматически обновлены:\n` +
      `• Режим изменён с «Обычного» на «Одиночный» (practice)\n` +
      `• Таймаут изменён на 5 секунд\n` +
      `Одиночные и дружеские игры оставлены без изменений.\n\n` +
      `Хотите запустить одиночную игру по этому словарю прямо сейчас?`
    )) {
      window.location.href = this.main.gamesManager.generateGameLink(games[0]);
    }
  }

  setupHoverListeners() {
    // Selectors that suppress the replay timer while the cursor is inside them.
    const INTERACTIVE_SELECTORS = [
      // Main containers
      '#latest-games-container',
      '.playlists-manager-popup',
      // KG's related containers
      '#errors_text', 
      '#params',
      // KG_WebTypeStats
      '#wts-side-panel',
      '#wts-draggable-window'
    ];

    const isOverInteractivePanel = target =>
      INTERACTIVE_SELECTORS.some(sel => target.closest(sel));

    let leaveTimer = null;

    const onEnter = e => {
      if (!isOverInteractivePanel(e.target)) return;
      // Only act on the first enter (when we weren't already hovering)
      if (this.isHoveringInteractivePanel) return;
      this.isHoveringInteractivePanel = true;
      clearTimeout(leaveTimer);
      // ONLY cancel replay sleep when hovering - start should be unaffected
      if (this.replaySleep && typeof this.replaySleep.cancel === 'function') {
        this.cancelReplay(true);
      }
    };

    const onLeave = e => {
      if (!this.isHoveringInteractivePanel) return;
      // relatedTarget is where the mouse is going; if it's still inside one of
      // our panels we don't want to treat this as a leave
      const dest = e.relatedTarget;
      if (dest && isOverInteractivePanel(dest)) return;
      this.isHoveringInteractivePanel = false;
      /* Re-check and handle replay action after a short delay to prevent immediate
         triggering when the mouse moves quickly between panels or in/out of edges */
      leaveTimer = setTimeout(() => this.handleReplayAction(), 350);
    };

    document.addEventListener('mouseover', onEnter);
    document.addEventListener('mouseout', onLeave);
  }

  saveCurrentGameParams() {
    const gameDesc = document.querySelector('#gamedesc');
    if (!gameDesc) throw new Error('#gamedesc element not found.');
    const span = gameDesc.querySelector('span');
    if (!span) throw new Error('#gamedesc span element not found.');
    const descText = gameDesc.textContent;
    if (/соревнование/.test(descText) || !this.main.maxGameCount || this.main.shouldAutoSave === false) return false;
    
    const gameParams = this.main.gamesManager.parseGameParams(span, descText);
    const gameParamsString = JSON.stringify(gameParams);
    
    // Find the "Сохранённые" group
    let targetGroup = this.main.groupsManager.groups.find(g => g.title === 'Сохранённые');
    
    if (!targetGroup) {
      // Create the "Сохранённые" group if it doesn't exist
      targetGroup = this.main.groupsManager.createGroup('Сохранённые');
      this.main.groupsManager.groups.push(targetGroup);
    }
    
    // Check if a game with the same parameters already exists (pinned or unpinned)
    const gameExists = targetGroup.games.some(game => JSON.stringify(game.params) === gameParamsString);
    if (gameExists) {
      return;
    }
    
    // Create new game object (unpinned)
    const newGame = { params: gameParams, id: generateUniqueId(this.main.groupsManager.groups), pin: 0 };
    
    // Insert after pinned games
    const pinnedCount = targetGroup.games.filter(g => g.pin).length;
    targetGroup.games.splice(pinnedCount, 0, newGame);
    
    // Enforce the limit: remove excess unpinned games from the end
    const maxGamesToKeep = pinnedCount + this.main.maxGameCount;
    if (targetGroup.games.length > maxGamesToKeep) {
      targetGroup.games.splice(maxGamesToKeep, targetGroup.games.length - maxGamesToKeep);
    }
    
    this.main.gamesManager.assignGameIds();
    this.main.gamesManager.saveGameData();
  }

  cancelStart() {
    if (this.startSleep) {
      this.startSleep.cancel();
      this.startSleep = null;
    }
    this.gamesDataContainer.removeSleepIndicator('start');
  }

  cancelReplay(animated = false) {
    if (this.replaySleep) {
      this.replaySleep.cancel();
      this.replaySleep = null;
    }
    this.gamesDataContainer.removeSleepIndicator('replay', animated);
  }

  handleStartAction() {
    // Handle auto-start - NEVER affected by hover state
    if (this.main.shouldStart) {
      const pausedElement = document.querySelector('#status-inner #paused');
      if (pausedElement && pausedElement.style.display !== 'none') {
        if (typeof game !== 'undefined' && game.hostStart) {
          // Remove existing start indicator if any
          this.cancelStart();

          this.startSleep = sleep(this.main.startDelay);
          this.gamesDataContainer.createSleepIndicator('start', this.main.startDelay, this.startSleep, () => this.cancelStart());
          this.startSleep.then(() => {
            this.gamesDataContainer.removeSleepIndicator('start', true);
            game.hostStart();
          }).catch(() => {
            this.gamesDataContainer.removeSleepIndicator('start');
            this.startSleep = null;
          });
        }
      }
    }
  }

  // Create and start the next game from the current group
  replayNextGame() {
    const groupsManager = this.main.groupsManager;
    const gamesManager = this.main.gamesManager;

    let targetVocId = null;
    let targetName = null;
    let targetType = null;
    let nextUrl = null;

    // If random mode is enabled, pick a random game and start it immediately
    if (this.main.randomGameId) {
      const randRes = gamesManager.getRandomGameId();
      if (!randRes) return;

      if (randRes.mode === 'global') {
        (async () => {
          const validated = await gamesManager.getValidRandomGameId();
          if (!validated) return alert('Максимальное количество попыток поиска подходящей игры исчерпано. Попробуйте ещё раз.');
          
          targetVocId = validated.id;
          nextUrl = validated.url;
          
          if (targetVocId) {
            try { gamesManager.registerPendingPlayed(targetVocId); } catch (__) { }
          }
          
          window.location.href = nextUrl;
        })();
        return;
      }

      // Local random: setup group and data
      if (randRes.mode === 'local') {
        const group = groupsManager.groups.find(g => g.games.some(game => game.id === randRes.id));
        if (group) groupsManager.selectGroup(group.id);
        gamesManager.latestGamesData = gamesManager.latestGamesData || {};
        gamesManager.latestGamesData.previousGameId = randRes.id;
        gamesManager.saveGameData();
        
        targetVocId = String(randRes.game?.params?.vocId || '');
        targetName = randRes.game?.params?.vocName || null;
        targetType = randRes.game?.params?.vocType || null;
        nextUrl = randRes.game ? gamesManager.generateGameLink(randRes.game) : randRes.url;
        
        if (targetVocId) {
          try { gamesManager.registerPendingPlayed(targetVocId, targetName || null, targetType || null); } catch (__) { }
        }
        
        if (nextUrl) window.location.href = nextUrl;
      }
      return;
    }

    // Fallback: Sequential next game from current group
    const currentGroup = groupsManager.getCurrentGroup(groupsManager.groups, groupsManager.currentGroupId);
    if (!currentGroup || !Array.isArray(currentGroup.games) || currentGroup.games.length === 0) return;

    const prevGameId = gamesManager.latestGamesData?.previousGameId;
    let idx = currentGroup.games.findIndex(g => g.id === prevGameId);
    if (idx === -1) idx = 0;
    else idx = (idx + 1) % currentGroup.games.length;

    const nextGame = currentGroup.games[idx];
    if (!nextGame) return;

    gamesManager.latestGamesData.previousGameId = nextGame.id;
    gamesManager.saveGameData();

    targetVocId = String(nextGame.params.vocId || '');
    targetName = nextGame.params.vocName || null;
    targetType = nextGame.params.vocType || null;
    nextUrl = gamesManager.generateGameLink(nextGame);

    if (targetVocId) {
      try { gamesManager.registerPendingPlayed(targetVocId, targetName || null, targetType || null); } catch (__) { }
    }

    window.location.href = nextUrl;
  }

  // Shared sleep+indicator machinery for all replay navigation.
  // getNextUrl is called after the countdown resolves — return a URL string to navigate,
  // or nothing if navigation is handled via side-effects (e.g. replayNextGame()).
  _startReplaySleep(getNextUrl) {
    this.cancelReplay();

    this.replaySleep = sleep(this.main.replayDelay);
    this.gamesDataContainer.createSleepIndicator('replay', this.main.replayDelay, this.replaySleep, () => this.cancelReplay());

    this.replaySleep.then(() => {
      // Countdown finished naturally — play the bounceOut animation, then navigate
      this.gamesDataContainer.removeSleepIndicator('replay', true).then(() => {
        const url = getNextUrl();
        if (url) window.location.href = url;
      });
    }).catch(() => {
      // Countdown was cancelled (user clicked or hovered away) — clean up without navigating
      this.gamesDataContainer.removeSleepIndicator('replay');
      this.replaySleep = null;
    });
  }

  // Navigate to the next playlist game.
  // Respects shouldReplay: if off, do nothing; if on, show countdown then navigate.
  handlePlaylistReplay(url) {
    if (!this.main.shouldReplay) return; // Replay disabled — do nothing
    this._startReplaySleep(() => url);
  }

  handleReplayAction() {
    // Competition and qualification games are never auto-replayed
    if (['competition', 'qualification'].includes(detectGameType().category)) return;

    if (this.main.shouldReplay) {
      const elementToCheck = this.main.replayWithoutWaiting
        ? document.querySelector(gameSelectors.finish.immediate)
        : document.querySelector(gameSelectors.finish.normal);

      if (elementToCheck && elementToCheck.style.display !== 'none') {
        // Only follow the playlist URL when the session is actively running.
        // A paused session means the user is on the main panel flow.
        const playlistUrl = !getActivePlaylistSession()?.paused && getActivePlaylistUrl(this.main);
        if (playlistUrl) { this._startReplaySleep(() => playlistUrl); return; }

        const gameIdMatch = location.href.match(/gmid=(\d+)/);
        if (gameIdMatch) {
          const gameId = gameIdMatch[1];

          // Replay is suppressed while the user is hovering any interactive panel
          if (!this.isHoveringInteractivePanel) {
            // Decrement the counter as soon as the game ends so the indicator reflects
            // the upcoming replay, not the one that just finished. Saved immediately so
            // a page reload mid-countdown doesn't lose the updated value.
            if (this.main.shouldReplayMore) {
              this.main.remainingReplayCount--;
              this.gamesDataContainer.updateRemainingCountIndicator();
              this.main.settingsManager.saveSettings();
            }

            this._startReplaySleep(() => {
              if (this.main.shouldReplayMore && this.main.remainingReplayCount <= 0) {
                // All repeats done — reset counter and move to the next game
                this.main.remainingReplayCount = this.main.replayNextGameCount;
                this.main.settingsManager.saveSettings();
                this.replayNextGame();
              } else if (!this.main.shouldReplayMore && this.main.replayNextGame) {
                // shouldReplayMore is off — move to the next game
                this.replayNextGame();
              } else {
                // Repeats still remaining — replay the current game
                return `https://klavogonki.ru/g/${gameId}.replay`;
              }
            });
          }
        }
      }
    }
  }
}