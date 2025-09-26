import { icons } from './icons.js';
import { createCustomTooltip } from './tooltip.js';
import { getCurrentPage, extractVocabularyId } from './utils.js';

let vocIdToGroups = new Map();
let vocabularyHighlightObserver = null;

const VOCABULARY_ANCHOR_SELECTOR = 'a[href*="/vocs/"], a[href*="/create/"]';

// List of selectors to exclude from processing
const EXCLUSION_SELECTORS = [
  '#latest-games-container',
  '.userpanel',
  '#head',
  '#footer'
];

function shouldProcessElement(element) {
  // Check if element is within excluded containers
  for (const selector of EXCLUSION_SELECTORS) {
    if (element.closest(selector)) {
      return false;
    }
  }

  return true;
}

function processAnchor(anchor) {
  const vocId = extractVocabularyId(anchor);
  if (!vocId) return;

  const parent = anchor.parentNode;
  const oldIcon = parent.querySelector('.kg-voc-checkmark');
  if (oldIcon) oldIcon.remove();

  if (vocIdToGroups.has(vocId)) {
    const icon = document.createElement('span');
    icon.className = 'kg-voc-checkmark';
    icon.innerHTML = icons.checkmark;
    createCustomTooltip(icon, 'Словарь уже существует в группе: ' + vocIdToGroups.get(vocId).join(', '));

    const isVocPage = window.location.pathname.startsWith('/vocs/');
    const desc = parent.querySelector('.desc');

    if (isVocPage && desc) {
      parent.insertBefore(icon, desc);
    } else {
      // Insert the icon as the first child of the parent (before the anchor)
      parent.insertBefore(icon, parent.firstChild);
    }
  }
}

function processExistingAnchors() {
  const anchors = document.querySelectorAll(VOCABULARY_ANCHOR_SELECTOR);
  anchors.forEach(anchor => {
    if (shouldProcessElement(anchor)) {
      processAnchor(anchor);
    }
  });
}

function handleMutations(mutations) {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && shouldProcessElement(node)) {
        if (node.matches && node.matches(VOCABULARY_ANCHOR_SELECTOR)) {
          processAnchor(node);
        }

        const anchors = node.querySelectorAll && node.querySelectorAll(VOCABULARY_ANCHOR_SELECTOR);
        if (anchors) {
          anchors.forEach(anchor => {
            if (shouldProcessElement(anchor)) {
              processAnchor(anchor);
            }
          });
        }
      }
    });

    if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
      const target = mutation.target;
      if (shouldProcessElement(target) && target.matches && target.matches('a')) {
        processAnchor(target);
      }
    }
  });
}

function startVocabularyHighlightObserver() {
  if (vocabularyHighlightObserver) {
    vocabularyHighlightObserver.disconnect();
  }

  vocabularyHighlightObserver = new MutationObserver(handleMutations);
  vocabularyHighlightObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href']
  });
}

export function highlightExistingVocabularies(groups) {
  const currentPage = getCurrentPage();
  if (!['profile', 'forum', 'vocabularies', 'gamelist', 'game'].includes(currentPage)) {
    return;
  }

  vocIdToGroups.clear();
  groups.forEach(group => {
    group.games.forEach(game => {
      if (game.params && game.params.vocId) {
        const vocIdStr = String(game.params.vocId);
        if (!vocIdToGroups.has(vocIdStr)) {
          vocIdToGroups.set(vocIdStr, []);
        }
        vocIdToGroups.get(vocIdStr).push(group.name || group.title || 'Группа');
      }
    });
  });

  processExistingAnchors();
  startVocabularyHighlightObserver();
}