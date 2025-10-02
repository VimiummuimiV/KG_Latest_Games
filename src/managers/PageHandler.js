import { highlightExistingVocabularies } from "../vocabularyChecker.js";
import { attachVocabularyCreation } from "../vocabularyCreation.js";
import { attachVocabularyParser } from "../vocabularyContent.js";
import { sleep, generateUniqueId } from "../utils.js";
import { isVocabularyCreationSupported } from "../vocabularyCreation.js";
import { detectGameType } from "../utils.js";

export class PageHandler {
  constructor(main) {
    this.main = main;
    // Initialize the games data container
    this.gamesDataContainer = null;
    // Initialize sleep indicators and timers
    this.replaySleep = null;
    this.startSleep = null;
    // Create indicators for start and replay actions
    this.startIndicator = null;
    this.replayIndicator = null;
    // Initialize timers for start and replay actions
    this.startTimer = null;
    this.replayTimer = null;
    // Flag to track if hovering over latest games container
    this.isHoveringLatestGames = false;
    this.remainingReplayCount = this.main.replayNextGameCount;
  } // End of constructor

  createGamesDataContainer() {
    const container = document.createElement('div');
    container.className = 'games-data-container';
    document.body.appendChild(container);
    this.gamesDataContainer = container;
    this.createRemainingCountIndicator();
  }

  createRemainingCountIndicator() {
    // No need to create indicator if replay more is not enabled
    if (!this.main.shouldReplayMore) return;
    // Ensure the games data container exists
    if (!this.gamesDataContainer) this.createGamesDataContainer();

    const indicator = document.createElement('div');
    indicator.className = 'remaining-count-indicator';
    indicator.textContent = `${this.main.remainingReplayCount}`;
    this.gamesDataContainer.appendChild(indicator);
  } // End of createRemainingCountIndicator

  createSleepIndicator(type, totalMs) {
    // Ensure the games data container exists
    if (!this.gamesDataContainer) this.createGamesDataContainer();

    const indicator = document.createElement('div');
    indicator.className = type === 'start' ? 'sleep-start-indicator' : 'sleep-replay-indicator';
    this.gamesDataContainer.insertBefore(indicator, this.gamesDataContainer.firstChild);

    let remainingMs = totalMs;
    const startTime = Date.now();

    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(0, totalMs - elapsed);

      const seconds = Math.floor(remainingMs / 1000);
      const milliseconds = Math.floor((remainingMs % 1000) / 10); // Show 2 decimal places
      indicator.textContent = `${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;

      if (remainingMs > 0) {
        const timerId = requestAnimationFrame(updateTimer);
        if (type === 'start') {
          this.startTimer = timerId;
        } else {
          this.replayTimer = timerId;
        }
      }
    };

    updateTimer();
    return indicator;
  } // End of createSleepIndicator

  removeSleepIndicator(type) {
    if (type === 'start') {
      if (this.startTimer) {
        cancelAnimationFrame(this.startTimer);
        this.startTimer = null;
      }
      if (this.startIndicator) {
        this.startIndicator.remove();
        this.startIndicator = null;
      }
    } else if (type === 'replay') {
      if (this.replayTimer) {
        cancelAnimationFrame(this.replayTimer);
        this.replayTimer = null;
      }
      if (this.replayIndicator) {
        this.replayIndicator.remove();
        this.replayIndicator = null;
      }
    }
  } // End of removeSleepIndicator

  handlePageSpecificLogic() {
    const { href } = location;
    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
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
        ? document.querySelector('#typeblock #bookinfo')
        : document.querySelector('#status-inner #finished');

      if (elementToObserve) {
        const finishObserver = new MutationObserver(() => {
          finishObserver.disconnect();
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
  } // End of handlePageSpecificLogic

  setupHoverListeners() {
    const latestGamesContainer = document.querySelector('#latest-games-container');
    if (latestGamesContainer) {
      latestGamesContainer.addEventListener('mouseenter', () => {
        this.isHoveringLatestGames = true;
        // ONLY cancel replay sleep when hovering - start should be unaffected
        if (this.replaySleep && typeof this.replaySleep.cancel === 'function') {
          this.replaySleep.cancel();
          this.replaySleep = null;
          this.removeSleepIndicator('replay');
        }
      });

      latestGamesContainer.addEventListener('mouseleave', () => {
        this.isHoveringLatestGames = false;
        // If not hovering, re-check and handle replay action
        this.handleReplayAction();
      });
    }
  } // End of setupHoverListeners

  saveCurrentGameParams() {
    const gameDesc = document.querySelector('#gamedesc');
    if (!gameDesc) throw new Error('#gamedesc element not found.');
    const span = gameDesc.querySelector('span');
    if (!span) throw new Error('#gamedesc span element not found.');
    const descText = gameDesc.textContent;
    if (/соревнование/.test(descText) || !this.main.maxGameCount || this.main.shouldAutoSave === false) return false;
    const gameParams = this.main.gamesManager.parseGameParams(span, descText);
    const gameParamsString = JSON.stringify(gameParams);
    const currentGroup = this.main.groupsManager.getCurrentGroup(this.main.groupsManager.groups, this.main.groupsManager.currentGroupId);
    if (!currentGroup) return;
    // Check if a game with the same parameters already exists (pinned or unpinned)
    const gameExists = currentGroup.games.some(game => JSON.stringify(game.params) === gameParamsString);
    if (gameExists) {
      return;
    }
    // Create new game object (unpinned)
    const newGame = { params: gameParams, id: generateUniqueId(this.main.groupsManager.groups), pin: 0 };
    // Insert after pinned games
    const pinnedCount = currentGroup.games.filter(g => g.pin).length;
    currentGroup.games.splice(pinnedCount, 0, newGame);
    // Enforce the limit: remove excess unpinned games from the end
    const maxGamesToKeep = pinnedCount + this.main.maxGameCount;
    if (currentGroup.games.length > maxGamesToKeep) {
      currentGroup.games.splice(maxGamesToKeep, currentGroup.games.length - maxGamesToKeep);
    }
    this.main.gamesManager.assignGameIds();
    this.main.gamesManager.saveGameData();
  } // End of saveCurrentGameParams

  handleStartAction() {
    // Handle auto-start - NEVER affected by hover state
    if (this.main.shouldStart) {
      const pausedElement = document.querySelector('#status-inner #paused');
      if (pausedElement && pausedElement.style.display !== 'none') {
        if (typeof game !== 'undefined' && game.hostStart) {
          // Remove existing start indicator if any
          this.removeSleepIndicator('start');

          this.startIndicator = this.createSleepIndicator('start', this.main.startDelay);
          this.startSleep = sleep(this.main.startDelay);
          this.startSleep.then(() => {
            this.removeSleepIndicator('start');
            game.hostStart();
          }).catch(() => {
            this.removeSleepIndicator('start');
            this.startSleep = null;
          });
        }
      }
    }
  } // End of handleStartAction

  // Create and start the next game from the current group
  replayNextGame() {
    const groupsManager = this.main.groupsManager; // Access the groups manager from main
    const gamesManager = this.main.gamesManager; // Access the games manager from main

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
          
          // Single call for global
          if (targetVocId) {
            gamesManager.markVocabAsPlayed(targetVocId);
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
        
        // Single call for local random
        if (targetVocId) {
          gamesManager.markVocabAsPlayed(targetVocId, targetName, targetType);
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

    // Single call for fallback
    if (targetVocId) {
      gamesManager.markVocabAsPlayed(targetVocId, targetName, targetType);
    }

    window.location.href = nextUrl;
  } // End of replayNextGame

  handleReplayAction() {
    // Do not auto-replay for competition or qualification games
    if (['competition', 'qualification'].includes(detectGameType().category)) return;

    // Handle auto-replay - affected by hover state
    if (this.main.shouldReplay) {
      // Check the appropriate element based on replayWithoutWaiting setting
      const elementToCheck = this.main.replayWithoutWaiting
        ? document.querySelector('#typeblock #bookinfo')
        : document.querySelector('#status-inner #finished');

      if (elementToCheck && elementToCheck.style.display !== 'none') {
        const gameIdMatch = location.href.match(/gmid=(\d+)/);
        if (gameIdMatch) {
          const gameId = gameIdMatch[1];

          // Only start replay timer if not hovering over latest games container
          if (!this.isHoveringLatestGames) {
            // Remove existing replay indicator if any
            this.removeSleepIndicator('replay');

            this.replayIndicator = this.createSleepIndicator('replay', this.main.replayDelay);
            this.replaySleep = sleep(this.main.replayDelay);
            this.replaySleep.then(() => {
              this.removeSleepIndicator('replay');

              // —— NEW: “replay more” repeat-count logic ——
              if (this.main.shouldReplayMore) {
                // if there are still repeats left, decrement and replay the same game
                if (this.main.remainingReplayCount > 1) {
                  this.main.remainingReplayCount--;
                  this.main.settingsManager.saveSettings();
                  window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
                } else {
                  // counter exhausted → reset it and then advance (or replay) as usual
                  this.main.remainingReplayCount = this.main.replayNextGameCount;
                  this.main.settingsManager.saveSettings();
                  if (this.main.replayNextGame) {
                    this.replayNextGame();
                  } else {
                    window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
                  }
                }
              } else {
                // Default behavior: either replay next game or same
                if (this.main.replayNextGame) {
                  this.replayNextGame();
                } else {
                  window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
                }
              }
              // —— end “replay more” logic ——
            }).catch(() => {
              // Promise was cancelled, just clean up
              this.removeSleepIndicator('replay');
              this.replaySleep = null;
            });
          }
        }
      }
    }
  } // End of handleReplayAction

}
