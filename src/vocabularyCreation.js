import { generateUniqueId } from './utils.js';
import { highlightExistingVocabularies } from './vocabularyChecker.js';
import { createPopup } from './menuPopup.js';
import { hideTooltip } from './vocabularyParser.js';
import { getCurrentPage } from './utils.js';

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
            id: generateUniqueId(groups),
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
 * Get the appropriate container selector based on current page
 * @returns {string|null} CSS selector for the container
 */
function getContainerSelector() {
  const currentPage = getCurrentPage();

  switch (currentPage) {
    case 'vocabularies':
      return '.columns.voclist';
    case 'profile':
      return '.profile-root, .dlg-profile-vocs .vocs';
    default:
      return null; // No vocabulary creation on other pages
  }
}

/**
 * Check if current page supports vocabulary creation
 * @returns {boolean} True if vocabulary creation is supported on current page
 */
export function isVocabularyCreationSupported() {
  return getContainerSelector() !== null;
}

/**
 * Extract vocabulary name from anchor element
 * @param {HTMLElement} anchor - The anchor element
 * @returns {string} The vocabulary name
 */
function extractVocabularyName(anchor) {
  return anchor.textContent.trim();
}

/**
 * Wait for elements matching the selector to be added to the DOM and execute callback for each.
 * @param {string} selector - CSS selector to wait for
 * @param {Function} callback - Function to execute when a matching element is added
 */
function waitFor(selector, callback) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(selector)) {
              callback(node);
            }
            const matchingDescendants = node.querySelectorAll(selector);
            matchingDescendants.forEach((el) => callback(el));
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Attach event listener to a container if not already attached
 * @param {HTMLElement} container - The container element
 * @param {Array} groups - Array of group objects
 * @param {object} main - The main manager instance
 */
function attachEventToContainer(container, groups, main) {
  // Prevent double attachment
  if (container.dataset.vocabularyCreationAttached) return;
  container.dataset.vocabularyCreationAttached = 'true';

  container.addEventListener('contextmenu', (e) => {
    const anchor = e.target.closest('a[href*="/vocs/"]');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute('href');
      const match = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (match) {
        const vocId = match[1];
        const vocName = extractVocabularyName(anchor);
        showVocabularyCreationPopup(groups, e, vocId, vocName, main);
      }
    }
  });
}

/**
 * Attach contextmenu event to vocabulary links within appropriate containers.
 * @param {Array} groups - Array of group objects.
 * @param {object} main - The main manager instance.
 */
export function attachVocabularyCreation(groups, main) {
  const containerSelector = getContainerSelector();

  if (!containerSelector) {
    console.warn('Vocabulary creation is not supported on this page.');
    return;
  }

  // Handle multiple selectors (comma-separated)
  const selectors = containerSelector.split(',').map(s => s.trim());

  selectors.forEach(selector => {
    // Always try to attach immediately
    const container = document.querySelector(selector);
    if (container) {
      attachEventToContainer(container, groups, main);
    }
    // Also set up waitFor in case the container appears later (will attach again if needed)
    waitFor(selector, (el) => attachEventToContainer(el, groups, main));
  });
}