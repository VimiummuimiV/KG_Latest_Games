import { icons } from './icons.js';
import { createCustomTooltip } from './tooltip.js';
import { waitFor, getContainerSelector, extractVocabularyId } from './utils.js';

function highlightInContainer(container, vocIdToGroups) {
  const anchors = container.querySelectorAll('a.name[href*="/vocs/"], a[href*="/create/"]');
  anchors.forEach(anchor => {
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
      if (isVocPage && desc) parent.insertBefore(icon, desc); // insert before description on vocabulary page
      else parent.appendChild(icon); // append to the end otherwise
    }
  });
}

export function highlightExistingVocabularies(groups) {
  const vocIdToGroups = new Map();
  groups.forEach(group => {
    group.games.forEach(game => {
      if (game.params && game.params.vocId) {
        const vocIdStr = String(game.params.vocId);
        if (!vocIdToGroups.has(vocIdStr)) vocIdToGroups.set(vocIdStr, []);
        vocIdToGroups.get(vocIdStr).push(group.name || group.title || 'Группа');
      }
    });
  });

  const containerSelector = getContainerSelector();
  if (!containerSelector) return;
  const selectors = containerSelector.split(',').map(s => s.trim());
  selectors.forEach(selector => {
    const containers = document.querySelectorAll(selector);
    containers.forEach(container => highlightInContainer(container, vocIdToGroups));
    waitFor(selector, (container) => highlightInContainer(container, vocIdToGroups));
  });
}
