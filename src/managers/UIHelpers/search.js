import { createElement } from '../../utils.js';

function fuzzyScore(text, query) {
  const textLower = text.toLowerCase(), queryLower = query.toLowerCase();
  if (!queryLower) return 0;
  if (textLower === queryLower) return -1000;
  if (textLower.startsWith(queryLower)) return -500;
  if (textLower.includes(queryLower)) return -100;
  
  let textIndex = 0, queryIndex = 0, gaps = 0;
  while (textIndex < textLower.length && queryIndex < queryLower.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) queryIndex++;
    else gaps++;
    textIndex++;
  }
  return queryIndex === queryLower.length ? gaps : Infinity;
}

export function createSearchBox(main) {
  const searchContainer = createElement('div', {
    className: `latest-games-search-container ${main.showSearchBox ? '' : 'latest-games-hidden'}`
  });
  
  const searchBox = createElement('input', {
    type: 'search',
    id: 'latest-games-search-input',
  });
  
  const clearButton = createElement('button', {
    type: 'button',
    id: 'latest-games-clear-button',
    className: 'latest-games-clear-btn',
    innerHTML: '×'
  });
  
  // Handle input events
  searchBox.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    handleSearch(main, value);
    updateClearButtonVisibility(clearButton, value);
  });
  
  // Handle clear button click
  clearButton.addEventListener('click', () => {
    searchBox.value = '';
    searchBox.focus();
    handleSearch(main, '');
    updateClearButtonVisibility(clearButton, '');
  });
  
  // Initial clear button state
  updateClearButtonVisibility(clearButton, '');
  
  searchContainer.appendChild(searchBox);
  searchContainer.appendChild(clearButton);
  
  return searchContainer;
}

function updateClearButtonVisibility(clearButton, value) {
  clearButton.classList.toggle('visible', !!value);
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
      const name = main.gamesManager.generateGameName(game);
      const score = fuzzyScore(name, query);
      if (score !== Infinity) {
        results.push({ group, game, score });
      }
    });
  });
  
  if (results.length === 0) {
    const noResults = createElement('li', { 
      className: 'latest-games-search-noresults', 
      textContent: 'Ничего не найдено' 
    });
    gamesList.appendChild(noResults);
    return;
  }
  
  results.sort((a, b) => a.score - b.score);
  
  const maxResults = 50;
  const displayedResults = results.slice(0, maxResults);
  const hiddenCount = results.length - maxResults;
  
  displayedResults.forEach(({ group, game }) => {
    const listItem = main.uiManager.createGameElement(game, game.id);
    listItem.classList.add('latest-games-search-result');
    listItem.addEventListener('click', () => {
      main.groupsManager.currentGroupId = group.id;
      main.uiManager.refreshContainer();
      setTimeout(() => {
        const element = document.getElementById(`latest-game-${game.id}`);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    });
    gamesList.appendChild(listItem);
  });
  
  if (hiddenCount > 0) {
    const hiddenMessage = createElement('li', { 
      className: 'latest-games-search-more', 
      textContent: `Ещё ${hiddenCount} результатов скрыто` 
    });
    gamesList.appendChild(hiddenMessage);
  }
}

export function toggleSearchBox(main) {
  const searchContainer = document.querySelector('.latest-games-search-container');
  if (!searchContainer) return;
  
  const isHidden = searchContainer.classList.toggle('latest-games-hidden');
  main.showSearchBox = !isHidden;
  
  if (main.settingsManager && typeof main.settingsManager.saveSettings === 'function') {
    main.settingsManager.saveSettings();
  }
  
  if (!isHidden) {
    const searchBox = document.getElementById('latest-games-search-input');
    if (searchBox) {
      searchBox.focus();
      searchBox.select();
    }
  }
}