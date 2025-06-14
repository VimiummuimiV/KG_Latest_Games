import { createElement } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag/gameButtonDrag.js';
import { icons } from '../../icons.js';
import { gameStatsApi } from '../../gameStatsApi.js';

export function createGameElement(main, game, id) {
  const gametypeClass = game.pin ? ` pin-gametype-${game.params.gametype}` : '';
  const li = createElement('li', {
    className: `latest-game${game.pin ? ' pin-game' : ''}${gametypeClass}`,
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

  // Add vocabulary link button first for voc type games
  if (game.params.gametype === 'voc' && game.params.vocId) {
    const vocButton = createElement('div', {
      className: 'latest-game-info',
      innerHTML: icons.info
    });
    createCustomTooltip(vocButton, 'Перейти на страницу словаря');
    vocButton.addEventListener('click', () => {
      window.open(`https://klavogonki.ru/vocs/${game.params.vocId}/`, '_blank');
    });
    gameActionButtons.appendChild(vocButton);
  }

  gameActionButtons.appendChild(pinButton);
  gameActionButtons.appendChild(deleteButton);

  const link = createElement('a', {
    href: main.gamesManager.generateGameLink(game),
    innerHTML: main.gamesManager.generateGameName(game)
  });

  link.addEventListener('click', (e) => {
    if (main.wasDragging) {
      e.preventDefault();
      main.wasDragging = false;
    }
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
      updateTooltipContent(link, '[Loading] Загрузка статистики...');
      try {
        const statsContent = await gameStatsApi.getGameStats(link);
        updateTooltipContent(link, statsContent);
      } catch (error) {
        console.error('Error loading game stats:', error);
        updateTooltipContent(link, '[Ошибка] Не удалось загрузить статистику');
      }
    } else {
      // Set default content
      updateTooltipContent(link, defaultTooltipContent);
    }
  });

  li.appendChild(gameActionButtons);
  li.appendChild(link);
  
  if (game.pin && main.enableDragging) addDragFunctionality(main, li);
  
  return li;
}