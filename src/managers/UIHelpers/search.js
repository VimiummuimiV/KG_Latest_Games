import { icons } from '../../icons.js';
import { createElement } from '../../utils.js';

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

// Function to calculate text width
function getTextWidth(text, font) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = font;
  return context.measureText(text).width;
}

// Function to get computed font style from element
function getFontStyle(element) {
  const style = window.getComputedStyle(element);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

// Function to update clear button position
function updateClearButtonPosition(searchBox, clearButton) {
  const text = searchBox.value;
  if (!text) {
    clearButton.style.left = '';
    return;
  }

  const font = getFontStyle(searchBox);
  const textWidth = getTextWidth(text, font);

  const marginLeft = 20;

  // Position the clear button at the end of the text
  const leftPosition = textWidth + marginLeft;
  clearButton.style.left = `${leftPosition}px`;

  // Get the actual width of the clear button
  const buttonWidth = clearButton.offsetWidth || 24; // fallback to 24px if not rendered yet

  // Calculate if the button would fit within the input boundaries
  const inputWidth = searchBox.offsetWidth;
  // Assume paddingRight and borderRight are small/fixed, or set a safe value
  const inputContentEnd = inputWidth - 8;
  const buttonEndPosition = leftPosition + buttonWidth;

  // Hide button if it would extend beyond the input's content area
  if (buttonEndPosition > inputContentEnd) {
    clearButton.classList.remove('visible');
  }
}

export function createSearchBox(main) {
  const searchContainer = createElement('div', {
    className: `latest-games-search-container ${main.showSearchBox ? '' : 'latest-games-hidden'}`
  });

  const searchBox = createElement('input', {
    type: 'search',
    id: 'latest-games-search-input',
  });

  const clearButton = createElement('div', {
    id: 'latest-games-clear-button',
    className: 'latest-games-clear-btn',
    innerHTML: icons.delete
  });

  // Make sure the search container has relative positioning for absolute positioning of clear button
  searchContainer.style.position = 'relative';

  // Restore saved search query on creation
  const savedQuery = loadSearchQuery();
  if (savedQuery) {
    searchBox.value = savedQuery;
    handleSearch(main, savedQuery);
    updateClearButtonVisibility(clearButton, savedQuery);
    updateClearButtonPosition(searchBox, clearButton);
  }

  // Handle input events
  searchBox.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    handleSearch(main, value);
    updateClearButtonVisibility(clearButton, value);
    updateClearButtonPosition(searchBox, clearButton);

    // Save search query (or remove if empty)
    saveSearchQuery(value);
  });

  // Handle clear button click
  clearButton.addEventListener('click', () => {
    searchBox.value = '';
    searchBox.focus();
    handleSearch(main, '');
    updateClearButtonVisibility(clearButton, '');
    updateClearButtonPosition(searchBox, clearButton);

    // Clear saved search query when explicitly cleared
    clearSavedSearchQuery();
  });

  // Handle keyboard events to detect explicit clearing
  searchBox.addEventListener('keydown', (e) => {
    // If backspace or delete is pressed and the input becomes empty, clear saved query
    if ((e.key === 'Backspace' || e.key === 'Delete') && searchBox.value.length === 1) {
      // The input will be empty after this keypress
      if (!searchBox.value.trim()) clearSavedSearchQuery();
    }
  });

  // Initial setup
  updateClearButtonVisibility(clearButton, searchBox.value);
  updateClearButtonPosition(searchBox, clearButton);

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
