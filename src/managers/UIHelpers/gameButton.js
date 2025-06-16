import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag/gameButtonDrag.js';
import { icons } from '../../icons.js';
import { gameStatsApi } from '../../gameStatsApi.js';
import { createGameInfoPopup } from '../../gameInfo.js';

export function createGameElement(main, game, id) {
  const previousGameId = main.gamesManager.getPreviousGameId();
  const pinGame = game.pin ? 'pin-game' : '';
  const gametypeClass = game.params && game.params.gametype ? `pin-gametype-${game.params.gametype}` : '';
  const previousClass = id === previousGameId ? 'previous-game' : '';

  // Determine state icon for previous game
  let stateIcon = '';

  if (id === previousGameId) {
    if (getCurrentPage() === 'game') {
      stateIcon = icons.playing;
    } else {
      stateIcon = icons.paused;
    }
  }

  const li = createElement('li', {
    className: `latest-game ${pinGame} ${gametypeClass} ${previousClass}`.trim(),
    id: `latest-game-${id}`
  });

  let buttonTimeout;
  const gameActionButtons = createElement('div', { className: 'latest-game-buttons' });

  li.addEventListener('mouseenter', () => {
    buttonTimeout = setTimeout(() => {
      gameActionButtons.style.visibility = 'visible';
    }, 400);
  });

  li.addEventListener('mouseleave', () => {
    clearTimeout(buttonTimeout);
    gameActionButtons.style.visibility = 'hidden';
  });

  const pinButton = createElement('div', {
    className: 'latest-game-pin',
    innerHTML: game.pin ? icons.unpin : icons.pin
  });

  createCustomTooltip(pinButton, game.pin
    ? '[Клик] Открепить с подтверждением. [Shift + Клик] Открепить без подтверждения.'
    : '[Клик] Закрепить с подтверждением. [Shift + Клик] Закрепить без подтверждения.'
  );

  pinButton.addEventListener('click', (e) => {
    if (e.shiftKey || confirm(game.pin ? 'Открепить игру?' : 'Закрепить игру?')) {
      main.gamesManager.pinGame(id);
    }
  });

  const deleteButton = createElement('div', {
    className: 'latest-game-delete',
    innerHTML: icons.delete
  });

  createCustomTooltip(deleteButton,
    '[Клик] Удалить (с подтверждением). [Shift + Клик] Удалить без подтверждения.'
  );

  deleteButton.addEventListener('click', (e) => {
    if (e.shiftKey || confirm('Удалить игру?')) {
      main.gamesManager.deleteGame(id);
    }
  });

  // Add info button for all game types
  const infoButton = createElement('div', {
    className: 'latest-game-info',
    innerHTML: icons.info
  });

  const tooltipText = game.params.gametype === 'voc' && game.params.vocId
    ? 'Показать информацию о словаре'
    : 'Показать информацию об игре';

  createCustomTooltip(infoButton, tooltipText);

  infoButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    createGameInfoPopup(e, game);
  });

  gameActionButtons.append(infoButton, pinButton, deleteButton);

  const link = createElement('a', {
    href: main.gamesManager.generateGameLink(game),
    innerHTML: main.gamesManager.generateGameName(game, { stateIcon })
  });

  link.addEventListener('click', (e) => {
    if (main.wasDragging) {
      e.preventDefault();
      main.wasDragging = false;
    }
    // Save previousGameId on link click, preserving all other data
    try {
      const li = link.closest('li');
      if (li && li.id && li.id.startsWith('latest-game-')) {
        const id = li.id.replace('latest-game-', '');
        const data = JSON.parse(localStorage.getItem('latestGamesData')) || {};
        data.previousGameId = id;
        localStorage.setItem('latestGamesData', JSON.stringify(data));
      }
    } catch (err) { }
  });

  // Default tooltip content
  const defaultTooltipContent = `
    [Shift + Клик] Перейти к игре с альтернативными параметрами
    [Удерживание (ЛКМ)] аналогично (Shift + Клик)
    [Shift + Наведение] Показать статистику игры
  `;

  // Shift + hover event for game stats
  link.addEventListener('mouseover', async (e) => {
    if (e.shiftKey) {
      // Set loading content immediately
      updateTooltipContent(link, '[Loading] Загрузка статистики...', 'stats');
      try {
        const statsContent = await gameStatsApi.getGameStats(link);
        updateTooltipContent(link, statsContent, 'stats');
      } catch (error) {
        console.error('Error loading game stats:', error);
        updateTooltipContent(link, '[Ошибка] Не удалось загрузить статистику', 'stats');
      }
    } else {
      // Set default content
      updateTooltipContent(link, defaultTooltipContent, 'info');
    }
  });

  li.appendChild(gameActionButtons);
  li.appendChild(link);

  if (game.pin && main.enableDragging) addDragFunctionality(main, li);

  return li;
}