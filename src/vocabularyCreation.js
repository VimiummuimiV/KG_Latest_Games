import { generateUniqueId, getContainerSelector, extractVocabularyId } from "./utils.js";
import { highlightExistingVocabularies } from "./vocabularyChecker.js";
import { createPopup } from "./menuPopup.js";
import { hideTooltip } from "./vocabularyContent.js";
import { typeMapping } from "./definitions.js";

// Function to fetch basic vocabulary data (name, rating, fans, author, type) from the server
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

        // extract basic data
        const vocabularyName = titleCell.childNodes[0].textContent.trim();
        const ratingCount = parseInt(ratingSpan.textContent.trim(), 10);
        const fansCount = parseInt(fansSpan.textContent.trim(), 10);

        // try to get author data and vocabulary type
        let vocabularyAuthor = '';
        let vocabularyType = null;
        
        const dlElements = doc.querySelectorAll('.user-content dl');
        for (const dl of dlElements) {
          const dt = dl.querySelector('dt');
          const dd = dl.querySelector('dd');
          
          if (!dt || !dd) continue;
          
          const dtText = dt.textContent.trim();
          
          // Get author
          if (dtText === 'Автор:') {
            const authorLink = dd.querySelector('a[href^="/profile/"]');
            if (authorLink) {
              vocabularyAuthor = authorLink.textContent.trim();
            }
          }
          
          // Get vocabulary type
          if (dtText === 'Тип словаря:') {
            const typeText = dd.childNodes[0]?.textContent?.trim();
            if (typeText && typeMapping[typeText]) {
              vocabularyType = typeMapping[typeText];
            }
          }
        }

        return { vocId, vocabularyName, ratingCount, fansCount, vocabularyAuthor, vocabularyType };
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

export function addGameToGroup(group, vocId, vocName, vocType, groups, main) {
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
      vocType: vocType || null,
      type: 'normal',
      level_from: 1,
      level_to: 9,
      timeout: 10,
      qual: 0,
      premium_abra: 0
    },
    pin: 1
  };
  group.games.push(newGame);
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
 * @param {string|null} vocType - The vocabulary type.
 * @param {object} main - The main manager instance.
 */
export function showVocabularyCreationPopup(groups, event, vocId, vocName, vocType, main) {
  hideTooltip(); // Hide any existing tooltip

  // Create button configurations for each group
  const buttonConfigs = groups.map(group => {
    const alreadyExists = group.games.some(game => String(game.params?.vocId) === String(vocId));
    return {
      text: group.title,
      className: `group-tab${alreadyExists ? ' active' : ''}`,
      dataset: { groupId: group.id },
      onClick: () => {
        addGameToGroup(group, vocId, vocName, vocType, groups, main);
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

  // Helper function to fetch vocabulary data
  async function getVocabularyData(vocId, href) {
    const basicData = await fetchVocabularyBasicData(vocId);
    if (basicData && basicData.vocabularyName) {
      return {
        success: true,
        vocName: basicData.vocabularyName,
        vocType: basicData.vocabularyType || null
      };
    } else {
      alert('⚠️ Не удалось получить данные словаря. Добавление отменено.');
      return { success: false };
    }
  }

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

          const data = await getVocabularyData(vocId, href);
          if (!data.success) return; // Abort on fetch failure

          addGameToGroup(group, vocId, data.vocName, data.vocType, groups, main);
          return; // Exit early
        }
      }
      // If ctrl is held but no previous group found, let default context menu show
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const data = await getVocabularyData(vocId, href);
    if (!data.success) return; // Abort on fetch failure

    showVocabularyCreationPopup(groups, e, vocId, data.vocName, data.vocType, main);
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