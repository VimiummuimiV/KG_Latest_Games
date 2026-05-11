import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent, hideTooltipElement } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag/gameButtonDrag.js';
import { icons } from '../../icons.js';
import { gameStatsApi } from '../../gameStatsApi.js';
import { createGameInfoPopup } from '../../gameInfo.js';
import { fetchVocabularyData, showTooltip, hideTooltip, startHideTimeout } from '../../vocabularyContent.js';
import { setActivePlaylistSession } from '../../playlistsManager.js';

export function createGameElement(main, game, id) {
  const previousGameId = main.gamesManager.getPreviousGameId();
  const pinGame = game.pin ? 'pin-game' : '';
  const gametypeClass = game.params && game.params.gametype ? `pin-gametype-${game.params.gametype}` : '';
  const previousClass = id === previousGameId ? 'previous-game' : '';
  const privateClass = game.params?.vocIsPublic === false ? 'voc-private' : '';
  const removedClass = game.params?.vocIsRemoved === true  ? 'voc-removed' : '';

  // Determine state icon for previous game
  let stateIcon = '';
  if (id === previousGameId) {
    stateIcon = getCurrentPage() === 'game' ? icons.playing : icons.paused;
  }

  const li = createElement('li', {
    className: `latest-game ${pinGame} ${gametypeClass} ${previousClass} ${privateClass} ${removedClass}`.trim(),
    id: `latest-game-${id}`
  });

  const gameActionButtons = createElement('div', { className: 'latest-game-buttons' });

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
    // If a playlist is in progress, pause it — the user can resume it later
    const activeSession = (() => { try { const r = localStorage.getItem('latestGames_activePlaylist'); return r ? JSON.parse(r) : null; } catch { return null; } })();
    if (activeSession && !activeSession.paused) {
      setActivePlaylistSession({ ...activeSession, paused: true });
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

  li.appendChild(gameActionButtons);
  li.appendChild(link);

  if (game.pin && main.enableDragging) addDragFunctionality(main, li);

  return li;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegated hover listeners for game links (Shift = vocab preview,
// Ctrl = stats tooltip, default = info tooltip). Called once by UIManager
// on the shared #latest-games <ul> instead of attaching per <a> element.
// ─────────────────────────────────────────────────────────────────────────────
const defaultTooltipContent = `
  [Удерживание ЛКМ] Создать|Сохранить игру с альтернативными параметрами
  [ПКМ] Переместить игру в другую группу
  [Shift + Наведение] Показать содержимое словаря
  [Ctrl + Наведение] Показать статистику игры
`;

export function attachGameHover(gamesList, main) {
  const tooltipCache = {
    vocabulary: new Map(), // vocId  → content
    stats:      new Map(), // gameId → content
  };

  let buttonTimeout;

  gamesList.addEventListener('mouseenter', (e) => {
    const li = e.target instanceof Element ? e.target.closest('.latest-game') : null;
    if (!li || !gamesList.contains(li)) return;
    buttonTimeout = setTimeout(() => {
      li.querySelector('.latest-game-buttons').style.visibility = 'visible';
    }, 400);
  }, true);

  gamesList.addEventListener('mouseleave', (e) => {
    const li = e.target instanceof Element ? e.target.closest('.latest-game') : null;
    if (!li || !gamesList.contains(li)) return;
    clearTimeout(buttonTimeout);
    li.querySelector('.latest-game-buttons').style.visibility = 'hidden';
  }, true);

  gamesList.addEventListener('mouseover', async (e) => {
    const link = e.target instanceof Element ? e.target.closest('a') : null;
    if (!link || !gamesList.contains(link)) return;

    const li = link.closest('.latest-game');
    if (!li) return;
    // Extract game ID from the <li> element's ID attribute
    const gameId = li.id.replace('latest-game-', '');
    const game   = main.gamesManager.findGameById(gameId);
    if (!game) return;

    const isVocGame = game.params?.gametype === 'voc' && game.params?.vocId;

    // Shift + hover: vocabulary preview
    if (e.shiftKey && isVocGame) {
      e.preventDefault();
      e.stopPropagation();
      hideTooltipElement();

      try {
        const vocId = game.params.vocId;
        if (!tooltipCache.vocabulary.has(vocId)) {
          const content = await fetchVocabularyData(vocId);
          tooltipCache.vocabulary.set(vocId, content);
        }
        showTooltip(link, tooltipCache.vocabulary.get(vocId));
      } catch (err) {
        console.error('Error loading vocabulary:', err);
      }
      return;
    }

    // Ctrl + hover: stats tooltip
    if (e.ctrlKey) {
      hideTooltip();
      updateTooltipContent(link, '[Loading] Загрузка статистики...', 'stats');
      try {
        if (!tooltipCache.stats.has(gameId)) {
          const statsContent = await gameStatsApi.getGameStats(link);
          tooltipCache.stats.set(gameId, statsContent);
        }
        updateTooltipContent(link, tooltipCache.stats.get(gameId), 'stats');
      } catch (error) {
        console.error('Error loading game stats:', error);
        updateTooltipContent(link, '[Ошибка] Не удалось загрузить статистику', 'stats');
      }
      return;
    }

    // Default tooltip
    updateTooltipContent(link, defaultTooltipContent, 'info');
  });

  gamesList.addEventListener('mouseout', (e) => {
    const left    = e.target instanceof Element ? e.target.closest('a') : null;
    const entered = e.relatedTarget instanceof Element ? e.relatedTarget.closest('a') : null;
    if (left && left !== entered) startHideTimeout();
  });
}
