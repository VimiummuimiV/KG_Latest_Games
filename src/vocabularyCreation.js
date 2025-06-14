import { generateRandomId } from './utils.js';
import { highlightExistingVocabularies } from './vocabularyChecker.js';
import { createPopup } from './menuPopup.js';
import { hideTooltip } from './vocabularyParser.js';

/**
 * Show a popup to add a vocabulary to a group.
 * @param {Array} groups - Array of group objects.
 * @param {MouseEvent} event - The contextmenu event.
 * @param {string} vocId - The vocabulary ID to add.
 * @param {string} vocName - The vocabulary name from the link text.
 * @param {object} main - The main manager instance.
 */
export function showVocabularyCreationPopup(groups, event, vocId, vocName, main) {
  hideTooltip(); // Hide any existing tooltip

  // Create button configurations for each group
  const buttonConfigs = groups.map(group => {
    const alreadyExists = group.games.some(game => String(game.params?.vocId) === String(vocId));
    return {
      text: group.title,
      className: `group-tab${alreadyExists ? ' active' : ''}`,
      dataset: { groupId: group.id },
      onClick: () => {
        // Find the group where the vocabulary already exists
        const foundGroup = groups.find(g =>
          g.games.some(game => String(game.params?.vocId) === String(vocId))
        );
        if (foundGroup) {
          alert(`Этот словарь уже добавлен в ${foundGroup.title}`);
          return;
        }
        if (!alreadyExists) {
          // Create a new game object with default parameters
          const newGame = {
            id: generateRandomId(),
            params: {
              gametype: 'voc',
              vocName: vocName,
              vocId: vocId,
              type: 'normal',
              level_from: 1,
              level_to: 9,
              timeout: 10,
              qual: 0,
              premium_abra: 0
            },
            pin: 1 // Pinned by default
          };
          group.games.unshift(newGame);
          main.gamesManager.saveGameData();
          main.uiManager.refreshContainer();
          highlightExistingVocabularies(groups);
        }
      }
    };
  });

  createPopup(buttonConfigs, event, 'vocabulary-creation-popup', 'Добавить');
}

/**
 * Attach contextmenu event to vocabulary links within .columns.voclist.
 * @param {Array} groups - Array of group objects.
 * @param {object} main - The main manager instance.
 */
export function attachVocabularyCreation(groups, main) {
  const voclist = document.querySelector('.columns.voclist');
  if (!voclist) {
    console.warn('Element with class "columns voclist" not found.');
    return;
  }

  voclist.addEventListener('contextmenu', (e) => {
    const anchor = e.target.closest('a.name[href*="/vocs/"]');
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute('href');
      const match = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (match) {
        const vocId = match[1];
        const vocName = anchor.textContent.trim(); // Extract name from link text
        showVocabularyCreationPopup(groups, e, vocId, vocName, main);
      }
    }
  });
}