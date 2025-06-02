import { icons } from './icons.js';

export function highlightExistingVocabularies(groups) {
  // Map vocId to group name(s)
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

  // Select only anchor tags with class "name" and href containing "/vocs/"
  const vocAnchors = document.querySelectorAll('a.name[href*="/vocs/"]');

  vocAnchors.forEach(anchor => {
    const href = anchor.getAttribute('href');
    const match = href && href.match(/\/vocs\/(\d+)(?:\/|$)/);
    if (match) {
      const vocId = match[1];
      // Remove any existing checkmark in the anchor's parent before adding a new one
      const parent = anchor.parentNode;
      const oldIcon = parent.querySelector('.kg-voc-checkmark');
      if (oldIcon) oldIcon.remove();
      if (vocIdToGroups.has(vocId)) {
        // Append icon before the .desc element
        const icon = document.createElement('span');
        icon.className = 'kg-voc-checkmark';
        icon.innerHTML = icons.checkmark;
        const groupNames = vocIdToGroups.get(vocId);
        icon.title = 'Словарь уже существует в группе: ' + groupNames.join(', ');
        const desc = parent.querySelector('.desc');
        if (desc) {
          parent.insertBefore(icon, desc);
        } else {
          anchor.appendChild(icon);
        }
      }
    }
  });
}
