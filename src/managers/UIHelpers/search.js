import { createElement } from '../../utils.js';

export function createSearchBox(main) {
  const searchBox = createElement('input', {
    type: 'search',
    id: 'latest-games-search-input',
    className: main.showSearchBox ? '' : 'latest-games-hidden'
  });
  searchBox.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    handleSearch(main, query);
  });
  return searchBox;
}

export function handleSearch(main, query) {
  const gamesList = document.getElementById('latest-games');
  if (!gamesList) return;
  gamesList.innerHTML = '';
  if (!query) {
    main.uiManager.populateGamesList(gamesList);
    return;
  }
  const results = [];
  main.groupsManager.groups.forEach(group => {
    group.games.forEach(game => {
      const name = main.gamesManager.generateGameName(game).toLowerCase();
      if (name.includes(query)) {
        results.push({ group, game });
      }
    });
  });
  if (results.length === 0) {
    const noResults = createElement('li', { className: 'latest-games-search-noresults', textContent: 'Ничего не найдено' });
    gamesList.appendChild(noResults);
    return;
  }
  results.forEach(({ group, game }) => {
    const li = main.uiManager.createGameElement(game, game.id);
    li.classList.add('latest-games-search-result');
    li.addEventListener('click', () => {
      main.groupsManager.currentGroupId = group.id;
      main.uiManager.refreshContainer();
      setTimeout(() => {
        const el = document.getElementById(`latest-game-${game.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    });
    gamesList.appendChild(li);
  });
}

export function toggleSearchBox(main) {
  const searchBox = document.getElementById('latest-games-search-input');
  if (!searchBox) return;
  const isHidden = searchBox.classList.toggle('latest-games-hidden');
  main.showSearchBox = !isHidden;
  if (main.settingsManager && typeof main.settingsManager.saveSettings === 'function') {
    main.settingsManager.saveSettings();
  }
  if (!isHidden) {
    searchBox.focus();
    searchBox.select();
  }
}