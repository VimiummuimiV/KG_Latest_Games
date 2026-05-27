import { icons } from '../../icons.js';
import { createElement, attachInputClearButton } from '../../utils.js';
import { createCustomTooltip } from '../../tooltip.js';

const SEARCH_STORAGE_KEY = 'latestGamesSearchQuery';

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

// Function to save search query to localStorage
function saveSearchQuery(query) {
  try {
    if (query && query.trim()) {
      localStorage.setItem(SEARCH_STORAGE_KEY, query.trim());
    } else {
      localStorage.removeItem(SEARCH_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to save search query:', e);
  }
}

// Function to load search query from localStorage
function loadSearchQuery() {
  try {
    return localStorage.getItem(SEARCH_STORAGE_KEY) || '';
  } catch (e) {
    console.warn('Failed to load search query:', e);
    return '';
  }
}

// Function to clear saved search query
function clearSavedSearchQuery() {
  try {
    localStorage.removeItem(SEARCH_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear search query:', e);
  }
}

export function createSearchBox(main) {
  const searchContainer = createElement('div', {
    className: `latest-games-search-container ${main.showSearchBox ? '' : 'latest-games-hidden'}`
  });

  const searchInput = createElement('input', {
    type: 'search',
    id: 'latest-games-search-input',
  });

  searchContainer.appendChild(searchInput);

  // Restore saved search query on creation
  const savedQuery = loadSearchQuery();
  if (savedQuery) {
    searchInput.value = savedQuery;
    requestAnimationFrame(() => {
      handleSearch(main, savedQuery);
    });
  }

  // Handle input events (separate from the clear-button onChange so we can
  // also react to keyboard input and save/search accordingly)
  searchInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    handleSearch(main, value);
    saveSearchQuery(value);
  });

  // Handle keyboard events to detect explicit clearing via Backspace/Delete
  searchInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && searchInput.value.length === 1) {
      if (!searchInput.value.trim()) clearSavedSearchQuery();
    }
  });

  // Attach shared clear button; onChange fires when the button is clicked
  attachInputClearButton(searchInput, searchContainer, icons.delete, (value) => {
    handleSearch(main, value);
    if (!value) clearSavedSearchQuery();
  });

  return searchContainer;
}

export function handleSearch(main, query, showAll = false) {
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

  const maxResultsLimit = 50;
  const maxResults = showAll ? results.length : maxResultsLimit;
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
      textContent: `Ещё ${hiddenCount} результатов скрыто`,
    });

    createCustomTooltip(hiddenMessage, 'Нажмите для показа всех результатов');
    
    hiddenMessage.addEventListener('click', () => {
      handleSearch(main, query, true); // Show all results when clicked
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
    const searchInput = document.getElementById('latest-games-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
}
