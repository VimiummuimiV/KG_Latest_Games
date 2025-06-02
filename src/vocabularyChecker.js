import { icons } from './icons.js';

export function highlightExistingVocabularies(groups) {
  // Collect all vocIds from all groups' games
  const vocIdSet = new Set();
  groups.forEach(group => {
    group.games.forEach(game => {
      if (game.params && game.params.vocId) {
        vocIdSet.add(String(game.params.vocId));
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
      if (vocIdSet.has(vocId)) {
        // Append icon before the .desc element if not already present
        if (!anchor.querySelector('.kg-voc-checkmark')) {
          const icon = document.createElement('span');
          icon.className = 'kg-voc-checkmark';
          icon.innerHTML = icons.checkmark;
          icon.title = 'Словарь уже существует в группе';
          
          // Try to find the closest .desc element within the anchor's parent
          const parent = anchor.parentNode;
          const desc = parent.querySelector('.desc');
          if (desc) {
            parent.insertBefore(icon, desc);
          } else {
            anchor.appendChild(icon);
          }
        }
      }
    }
  });
}
