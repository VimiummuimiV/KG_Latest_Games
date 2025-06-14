import { highlightExistingVocabularies } from '../vocabularyChecker.js';
import { attachVocabularyCreation } from '../vocabularyCreation.js';
import { attachVocabularyParser } from '../vocabularyParser.js';
import { sleep, generateRandomId } from '../utils.js';

export class PageHandler {
  constructor(main) {
    this.main = main;
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
  }

  createSleepIndicator(type, totalMs) {
    const indicator = document.createElement('div');
    indicator.className = type === 'start' ? 'sleep-start-indicator' : 'sleep-replay-indicator';
    document.body.appendChild(indicator);
    
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
  }

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
  }

  handlePageSpecificLogic() {
    const { href } = location;
    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
      this.setupHoverListeners();

      const observer = new MutationObserver(() => {
        const gameDescription = document.querySelector('#gamedesc');
        if (gameDescription && gameDescription.textContent) {
          observer.disconnect(); // Stop observing once the game description is found
          this.saveCurrentGameParams();
          this.handleGameActions();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const finished = document.getElementById('finished');
      if (finished) {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          this.handleGameActions();
        });
        observer.observe(finished, { attributes: true });
      }
    }

    // Highlight vocabularies and attach vocabulary creation popup on vocs page
    if (/klavogonki\.ru\/vocs\//.test(href)) {
      highlightExistingVocabularies(this.main.groupsManager.groups);
      attachVocabularyCreation(this.main.groupsManager.groups, this.main);
      attachVocabularyParser();
    }
  }

  setupHoverListeners() {
    const latestGamesContainer = document.getElementById('latest-games-container');
    if (latestGamesContainer) {
      latestGamesContainer.addEventListener('mouseenter', () => {
        this.isHoveringLatestGames = true;
        // Cancel any pending replay sleep and reset to 0
        if (this.replaySleep && typeof this.replaySleep.cancel === 'function') {
          this.replaySleep.cancel();
          this.replaySleep = null;
          this.removeSleepIndicator('replay');
        }
      });

      latestGamesContainer.addEventListener('mouseleave', () => {
        this.isHoveringLatestGames = false;
        // Restart replay logic if the game is finished (with full delay)
        this.handleGameActions();
      });
    }
  }

  saveCurrentGameParams() {
    const gameDesc = document.getElementById('gamedesc');
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
    const newGame = { params: gameParams, id: generateRandomId(), pin: 0 };
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
  }

  handleGameActions() {
    // Handle auto-start
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
    
    // Handle auto-replay
    if (this.main.shouldReplay) {
      const finishedElement = document.querySelector('#status-inner #finished');
      if (finishedElement && finishedElement.style.display !== 'none') {
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
              window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
            }).catch(() => {
              // Promise was cancelled, just clean up
              this.removeSleepIndicator('replay');
              this.replaySleep = null;
            });
          }
        }
      }
    }
  }
}