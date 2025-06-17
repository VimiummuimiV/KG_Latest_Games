import { generateUniqueId, getContainerSelector, extractVocabularyId } from './utils.js';
import { highlightExistingVocabularies } from './vocabularyChecker.js';
import { createPopup } from './menuPopup.js';
import { hideTooltip } from './vocabularyParser.js';

// Function to fetch basic vocabulary data (name, rating, fans) from the server
export async function fetchVocabularyBasicData(vocId) {
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const response = await fetch(`https://klavogonki.ru/vocs/${vocId}/`, { signal });
    if (!response.ok) {
      console.error('Failed to fetch vocabulary content for vocId:', vocId);
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let htmlChunk = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      htmlChunk += decoder.decode(value, { stream: true });

      // Quick sanity check: if the chunk doesn't even contain "</td>", skip full DOM parse
      if (!htmlChunk.includes('</td>')) continue;

      const doc = new DOMParser().parseFromString(htmlChunk, 'text/html');
      const userTitle = doc.querySelector('.user-title');
      if (!userTitle) continue;

      const titleCell = userTitle.querySelector('td.title');
      if (!titleCell) continue;

      const ratingSpan = titleCell.querySelector('#rating_cnt');
      const fansSpan = titleCell.querySelector('#fav_cnt');
      if (ratingSpan && fansSpan) {
        // abort the fetch (stops downloading the rest of the page)
        controller.abort();

        // extract data
        const vocabularyName = titleCell.childNodes[0].textContent.trim();
        const ratingCount = parseInt(ratingSpan.textContent.trim(), 10);
        const fansCount = parseInt(fansSpan.textContent.trim(), 10);

        return { vocId, vocabularyName, ratingCount, fansCount };
      }
    }

    return null; // didn't find the data
  } catch (err) {
    if (err.name === 'AbortError') {
      // Fetch was aborted because we already got our data — not really an error
      return null;
    }
    console.error('Error fetching/parsing vocabulary basic data:', err);
    return null;
  }
}

function addGameToGroup(group, vocId, vocName, groups, main) {
  if (group.games.some(game => String(game.params?.vocId) === String(vocId))) {
    alert(`Этот словарь уже добавлен в ${group.title}`);
    return;
  }
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
    pin: 1
  };
  group.games.unshift(newGame);
  let latestGamesData = main.gamesManager.latestGamesData || {};
  latestGamesData = { ...latestGamesData, latestGroupAddedGameId: group.id };
  main.gamesManager.latestGamesData = latestGamesData;
  main.gamesManager.saveGameData();
  main.uiManager.refreshContainer();
  highlightExistingVocabularies(groups);
}

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
        addGameToGroup(group, vocId, vocName, groups, main);
      }
    };
  });

  createPopup(buttonConfigs, event, 'vocabulary-creation-popup', 'Добавить');
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
 * Tracks which containers have had our listener attached
 */
const attachedContainers = new WeakSet();

/**
 * Attach event listener to a container if not already attached
 * @param {HTMLElement} container - The container element
 * @param {Array} groups - Array of group objects
 * @param {object} main - The main manager instance
 */
function attachEventToContainer(container, groups, main) {
  if (attachedContainers.has(container)) return;
  attachedContainers.add(container);

  container.addEventListener('contextmenu', async (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href || (!href.includes('/vocs/') && !href.includes('/create/'))) return;

    const vocId = extractVocabularyId(anchor);
    if (!vocId) {
      console.warn('Invalid vocabulary link (extra path segments present), ignoring:', href);
      return;
    }

    let latestGamesData = main.gamesManager.latestGamesData || {};

    // Handle ctrl + contextmenu case FIRST
    if (e.ctrlKey) {
      const previousGroupId = latestGamesData.latestGroupAddedGameId;
      if (previousGroupId) {
        const group = groups.find(g => g.id === previousGroupId);
        if (group) {
          // Only prevent default if we're actually handling the event
          e.preventDefault();
          e.stopPropagation();

          let vocName = '';
          if (href.includes('/create/')) {
            const basicData = await fetchVocabularyBasicData(vocId);
            if (basicData && basicData.vocabularyName) {
              vocName = basicData.vocabularyName;
            } else {
              vocName = prompt('Не удалось получить название словаря. Введите название для словаря:') || '';
            }
          } else {
            vocName = extractVocabularyName(anchor);
          }

          addGameToGroup(group, vocId, vocName, groups, main);
          return; // Exit early
        }
      }
      // If ctrl is held but no previous group found, let default context menu show
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    let vocName = '';
    if (href.includes('/create/')) {
      const basicData = await fetchVocabularyBasicData(vocId);
      if (basicData && basicData.vocabularyName) {
        vocName = basicData.vocabularyName;
      } else {
        // If fetching basic data fails, prompt the user to set a name manually.
        vocName = prompt('Не удалось получить название словаря. Введите название для словаря:') || '';
      }
    } else {
      vocName = extractVocabularyName(anchor);
    }

    showVocabularyCreationPopup(groups, e, vocId, vocName, main);
  });
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