import { icons } from '../../icons.js';
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
function updateClearButtonPosition(searchBox, clearButton, margin = 8) {
  const text = searchBox.value;
  if (!text) {
    clearButton.style.left = '';
    return;
  }
  
  const font = getFontStyle(searchBox);
  const textWidth = getTextWidth(text, font);
  
  // Get the left padding of the search box
  const computedStyle = window.getComputedStyle(searchBox);
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  
  // Position the clear button at the end of the text with margin
  const leftPosition = paddingLeft + textWidth + margin;
  clearButton.style.left = `${leftPosition}px`;
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
  
  // Handle input events
  searchBox.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    handleSearch(main, value);
    updateClearButtonVisibility(clearButton, value);
    updateClearButtonPosition(searchBox, clearButton);
  });
  
  // Handle clear button click
  clearButton.addEventListener('click', () => {
    searchBox.value = '';
    searchBox.focus();
    handleSearch(main, '');
    updateClearButtonVisibility(clearButton, '');
    updateClearButtonPosition(searchBox, clearButton);
  });
  
  // Handle font loading and resize events
  const updatePosition = () => updateClearButtonPosition(searchBox, clearButton);
  
  // Update position when fonts are loaded
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updatePosition);
  }
  
  // Update position on window resize (in case of zoom changes)
  window.addEventListener('resize', updatePosition);
  
  // Initial setup
  updateClearButtonVisibility(clearButton, '');
  updateClearButtonPosition(searchBox, clearButton);
  
  searchContainer.appendChild(searchBox);
  searchContainer.appendChild(clearButton);
  
  return searchContainer;
}

function updateClearButtonVisibility(clearButton, value) {
  clearButton.classList.toggle('visible', !!value);
}

// Rest of your existing functions remain the same...
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