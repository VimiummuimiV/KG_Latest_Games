import { highlightExistingVocabularies } from '../vocabularyChecker.js';
import { attachVocabularyCreation } from '../vocabularyCreation.js';
import { attachVocabularyParser } from '../vocabularyParser.js';
import { parseGameParams } from '../gameUtils.js';
import { sleep, generateRandomId } from '../utils.js';

export class PageHandler {
  constructor(main) {
    this.main = main;
  }

  handlePageSpecificLogic() {
    const { href } = location;
    if (/https?:\/\/klavogonki\.ru\/g\/\?gmid=/.test(href)) {
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

  saveCurrentGameParams() {
    const gameDesc = document.getElementById('gamedesc');
    if (!gameDesc) throw new Error('#gamedesc element not found.');
    const span = gameDesc.querySelector('span');
    if (!span) throw new Error('#gamedesc span element not found.');
    const descText = gameDesc.textContent;
    if (/соревнование/.test(descText) || !this.main.maxGameCount || this.main.shouldAutoSave === false) return false;
    const gameParams = parseGameParams(span, descText);
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
    this.main.assignGameIds();
    this.main.saveGameData();
  }

  handleGameActions() {
    // Handle auto-start
    if (this.main.shouldStart) {
      const pausedElement = document.querySelector('#status-inner #paused');
      if (pausedElement && pausedElement.style.display !== 'none') {
        if (typeof game !== 'undefined' && game.hostStart) {
          sleep(this.main.startDelay).then(() => {
            game.hostStart();
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
          sleep(this.main.replayDelay).then(() => {
            window.location.href = `https://klavogonki.ru/g/${gameId}.replay`;
          });
        }
      }
    }
  }
}
