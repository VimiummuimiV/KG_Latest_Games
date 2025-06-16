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
  const page = getCurrentPage();
  if (page === 'vocabularies') return '.columns.voclist';
  if (page === 'profile') return '.profile-root, .dlg-profile-vocs .vocs';
  if (page === 'forum') return '#posts-list .list';
  return null; // No vocabulary creation on other pages
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
 * Tracks which containers have had our listener attached
 */
const attachedContainers = new WeakSet();

/**
 * Extract vocabulary ID from an anchor’s href only if there’s nothing after the id.
 * 
 * For links containing "/create/", we check for a query parameter "voc".
 * For other links, we only accept a URL whose pathname exactly matches "/vocs/{id}/"
 * with no additional segments.
 *
 * @param {HTMLElement} anchor - The anchor element.
 * @returns {string|null} The extracted vocabulary ID, or null if invalid.
 */
function extractVocabularyId(anchor) {
  const href = anchor.getAttribute('href');
  
  if (/\/create\//.test(href)) {
    // Extract the voc parameter from query string
    const createMatch = href.match(/[?&]voc=(\d+)/);
    return createMatch ? createMatch[1] : null;
  } else {
    try {
      const url = new URL(href, window.location.origin);
      const pathname = url.pathname; // e.g. "/vocs/176053/" or "/vocs/176053/top/week/"
      
      // Only accept if pathname strictly matches "/vocs/{id}/" (or without trailing slash)
      const strictMatch = pathname.match(/^\/vocs\/(\d+)\/?$/);
      return strictMatch ? strictMatch[1] : null;
    } catch (error) {
      console.error('Error parsing URL:', href, error);
      return null;
    }
  }
}

/**
 * Attach event listener to a container if not already attached
 * @param {HTMLElement} container - The container element
 * @param {Array} groups - Array of group objects
 * @param {object} main - The main manager instance
 */
function attachEventToContainer(container, groups, main) {
  if (attachedContainers.has(container)) return;
  attachedContainers.add(container);

  container.addEventListener('contextmenu', (e) => {
    // Search for an anchor with "/vocs/" or "/create/" in its href
    const anchor = e.target.closest('a[href*="/vocs/"], a[href*="/create/"]');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const vocId = extractVocabularyId(anchor);
      if (!vocId) return; // Exit if no valid vocId is found

      const vocName = extractVocabularyName(anchor); // Your function for extracting vocabulary name
      showVocabularyCreationPopup(groups, e, vocId, vocName, main);
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
    // Immediately attach if container exists now
    const container = document.querySelector(selector);
    if (container) {
      attachEventToContainer(container, groups, main);
    }
    // Also observe for future containers
    waitFor(selector, (el) => attachEventToContainer(el, groups, main));
  });
}
