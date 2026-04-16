import { generateUniqueId, getContainerSelector, extractVocabularyId, isVocabularyRemoved } from "./utils.js";
import { highlightExistingVocabularies } from "./vocabularyChecker.js";
import { createPopup } from "./menuPopup.js";
import { hideTooltip } from "./vocabularyContent.js";
import { typeMapping } from "./definitions.js";

// Extracts all relevant dl fields from .user-content section of a parsed voc page document
function extractDlFields(doc) {
  let vocabularyAuthor   = '';
  let vocabularyType     = null;
  let vocabularyIsPublic = null;
  let createdDate        = null;
  let versionDate        = null;

  for (const dl of doc.querySelectorAll('.user-content dl')) {
    const dt = dl.querySelector('dt');
    const dd = dl.querySelector('dd');
    if (!dt || !dd) continue;

    const dtText = dt.textContent.trim();

    if (dtText === 'Автор:') {
      const authorLink = dd.querySelector('a[href^="/profile/"]');
      if (authorLink) vocabularyAuthor = authorLink.textContent.trim();
    }

    if (dtText === 'Тип словаря:') {
      const typeText = dd.childNodes[0]?.textContent?.trim();
      if (typeText && typeMapping[typeText]) vocabularyType = typeMapping[typeText];
    }

    if (dtText === 'Публичный:') {
      vocabularyIsPublic = dd.textContent.trim();
    }

    if (dtText === 'Создан:') {
      const dateText = Array.from(dd.childNodes)
        .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (dateText) createdDate = dateText.textContent.trim();
      const versionNote = dd.querySelector('.note');
      if (versionNote) versionDate = versionNote.textContent.trim();
    }
  }

  return { vocabularyAuthor, vocabularyType, vocabularyIsPublic, createdDate, versionDate };
}

export async function fetchVocabularyBasicData(vocId) {
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const response = await fetch(`https://klavogonki.ru/vocs/${vocId}/`, { signal });
    if (!response.ok) {
      if (response.status === 403) return { removed: true };
      console.error('Failed to fetch vocabulary content for vocId:', vocId);
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let htmlChunk = '';

    // Phase 1: stream until we find .user-title with name, rating, and fans count
    let titleData = null;

    while (!titleData) {
      const { done, value } = await reader.read();
      if (done) return null;

      htmlChunk += decoder.decode(value, { stream: true });

      // Quick sanity check: if the chunk doesn't even contain "</td>", skip full DOM parse
      if (!htmlChunk.includes('</td>')) continue;

      const doc = new DOMParser().parseFromString(htmlChunk, 'text/html');
      if (isVocabularyRemoved(response, htmlChunk)) { controller.abort(); return { removed: true }; }
      const userTitle = doc.querySelector('.user-title');
      if (!userTitle) continue;

      const titleCell  = userTitle.querySelector('td.title');
      const ratingSpan = titleCell?.querySelector('#rating_cnt');
      const fansSpan = titleCell?.querySelector('#fav_cnt');
      if (!titleCell || !ratingSpan || !fansSpan) continue;

      titleData = {
        vocId,
        vocabularyName: titleCell.childNodes[0]?.textContent?.trim() ?? '',
        ratingCount:    parseInt(ratingSpan.textContent.trim(), 10),
        fansCount:      parseInt(fansSpan.textContent.trim(),   10),
      };
    }

    // Phase 2: keep streaming until we have all dl fields from .user-content.
    // 'Тип словаря:' is the last dl field we care about, so we use it as the completion signal.
    // 'Публичный:' appears just before it and is the minimum we need, but waiting for
    // 'Тип словаря:' ensures we don't cut off mid-section.
    const dlCompleteSentinel = 'Тип словаря:';

    while (!htmlChunk.includes(dlCompleteSentinel)) {
      const { done, value } = await reader.read();
      if (done) break;

      htmlChunk += decoder.decode(value, { stream: true });
    }

    const finalDoc = new DOMParser().parseFromString(htmlChunk, 'text/html');
    const dlFields = extractDlFields(finalDoc);

    controller.abort();

    return { ...titleData, ...dlFields };

  } catch (err) {
    if (err.name === 'AbortError') return null;
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
      idletime: 0,
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
 * @param {string} vocName - The vocabulary name.
 * @param {string|null} vocType - The vocabulary type.
 * @param {object} main - The main manager instance.
 */
export function showVocabularyCreationPopup(groups, event, vocId, vocName, vocType, main) {
  hideTooltip();

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
 * Check if current page supports vocabulary creation.
 * @returns {boolean}
 */
export function isVocabularyCreationSupported() {
  return getContainerSelector() !== null;
}

const attachedContainers = new WeakSet();

function attachEventToContainer(container, groups, main) {
  if (attachedContainers.has(container)) return;
  attachedContainers.add(container);

  async function getVocabularyData(vocId) {
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

    // Ctrl + right-click: add vocabulary directly to the last used group without showing the popup
    if (e.ctrlKey) {
      const previousGroupId = latestGamesData.latestGroupAddedGameId;
      if (previousGroupId) {
        const group = groups.find(g => g.id === previousGroupId);
        if (group) {
          e.preventDefault();
          e.stopPropagation();

          const data = await getVocabularyData(vocId);
          if (!data.success) return;

          addGameToGroup(group, vocId, data.vocName, data.vocType, groups, main);
          return;
        }
      }
      // No previous group found — let the browser's default context menu show
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const data = await getVocabularyData(vocId);
    if (!data.success) return;

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
            node.querySelectorAll(selector).forEach((el) => callback(el));
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

  const selectors = containerSelector.split(',').map(s => s.trim());

  selectors.forEach(selector => {
    const container = document.querySelector(selector);
    if (container) {
      attachEventToContainer(container, groups, main);
    }
    waitFor(selector, (el) => attachEventToContainer(el, groups, main));
  });
}