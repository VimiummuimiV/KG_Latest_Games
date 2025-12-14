import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent, hideTooltipElement } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag/gameButtonDrag.js';
import { icons } from '../../icons.js';
import { gameStatsApi } from '../../gameStatsApi.js';
import { createGameInfoPopup } from '../../gameInfo.js';
import { fetchVocabularyContent, showTooltip, hideTooltip, startHideTimeout } from '../../vocabularyContent.js';

export function createGameElement(main, game, id) {
  const previousGameId = main.gamesManager.getPreviousGameId();
  const pinGame = game.pin ? 'pin-game' : '';
  const gametypeClass = game.params && game.params.gametype ? `pin-gametype-${game.params.gametype}` : '';
  const previousClass = id === previousGameId ? 'previous-game' : '';

  // Determine state icon for previous game
  let stateIcon = '';
  if (id === previousGameId) {
    stateIcon = getCurrentPage() === 'game' ? icons.playing : icons.paused;
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

  createCustomTooltip(
    pinButton,
    game.pin
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

  createCustomTooltip(
    deleteButton,
    '[Клик] Удалить с подтверждением. [Shift + Клик] Удалить без подтверждения.'
  );

  deleteButton.addEventListener('click', (e) => {
    if (e.shiftKey || confirm('Удалить игру?')) {
      main.gamesManager.deleteGame(id);
    }
  });

  const infoButton = createElement('div', {
    className: 'latest-game-info',
    innerHTML: icons.info
  });

  const tooltipText =
    game.params.gametype === 'voc' && game.params.vocId
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
    try {
      const li = link.closest('li');
      if (li && li.id && li.id.startsWith('latest-game-')) {
        const id = li.id.replace('latest-game-', '');
        const data = JSON.parse(localStorage.getItem('latestGamesData')) || {};
        data.previousGameId = id;
        localStorage.setItem('latestGamesData', JSON.stringify(data));
      }
    } catch (_) {}

    const vocId = String(game.params.vocId || '');
    if (vocId) {
      try {
        main.gamesManager.registerPendingPlayed(
          vocId,
          game.params.vocName || null,
          game.params.vocType || null
        );
      } catch (_) {}
    }
  });

  const tooltipCache = {
    vocabulary: new WeakMap(),
    stats: new WeakMap()
  };

  const defaultTooltipContent = `
    [Shift + Наведение] Показать содержимое словаря
    [Удерживание ЛКМ] Создать игру с альтернативными параметрами
    [Shift + Клик] Перейти к игре с альтернативными параметрами
    [Ctrl + Наведение] Показать статистику игры
  `;

  link.addEventListener('mouseover', async (e) => {
    const isVocGame = game.params?.gametype === 'voc' && game.params?.vocId;
    
    // Shift + hover: vocabulary preview
    if (e.shiftKey && isVocGame) {
      e.preventDefault();
      e.stopPropagation();
      
      hideTooltipElement(); // Only hide custom tooltip system
      
      try {
        if (!tooltipCache.vocabulary.has(link)) {
          const content = await fetchVocabularyContent(game.params.vocId);
          tooltipCache.vocabulary.set(link, content);
        }
        
        showTooltip(link, tooltipCache.vocabulary.get(link));
      } catch (err) {
        console.error('Error loading vocabulary:', err);
      }
      return;
    }
    
    // Ctrl + hover: stats tooltip
    if (e.ctrlKey) {
      hideTooltip(); // Only hide vocabulary tooltip
      
      updateTooltipContent(link, '[Loading] Загрузка статистики...', 'stats');
      
      try {
        if (!tooltipCache.stats.has(link)) {
          const statsContent = await gameStatsApi.getGameStats(link);
          tooltipCache.stats.set(link, statsContent);
        }
        
        updateTooltipContent(link, tooltipCache.stats.get(link), 'stats');
      } catch (error) {
        console.error('Error loading game stats:', error);
        updateTooltipContent(link, '[Ошибка] Не удалось загрузить статистику', 'stats');
      }
      return;
    }
    
    // Default tooltip
    updateTooltipContent(link, defaultTooltipContent, 'info');
  });

  link.addEventListener('mouseleave', () => {
    startHideTimeout();
  });

  li.appendChild(gameActionButtons);
  li.appendChild(link);

  if (game.pin && main.enableDragging) addDragFunctionality(main, li);

  return li;
}
