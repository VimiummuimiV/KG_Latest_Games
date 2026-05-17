import { createElement, getCurrentPage } from '../../utils.js';
import { createCustomTooltip, updateTooltipContent, hideTooltipElement } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag/gameButtonDrag.js';
import { icons } from '../../icons.js';
import { gameStatsApi } from '../../gameStatsApi.js';
import { createGameInfoPopup } from '../../gameInfo.js';
import { fetchVocabularyData, showTooltip, hideTooltip, startHideTimeout } from '../../vocabularyContent.js';
import { setActivePlaylistSession } from '../../playlistsManager.js';
import { getPreviousMigrationGroup } from '../../vocabularyMigration.js';

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
        const state = JSON.parse(localStorage.getItem('latestGamesState')) || {};
        state.previousGameId = id;
        localStorage.setItem('latestGamesState', JSON.stringify(state));
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
const buildDefaultTooltip = (main, currentGroupId) => {
  const prev = getPreviousMigrationGroup(main);
  const showCtrlHint = prev && prev.id !== currentGroupId;
  const rmbHint = `
    [ПКМ] Переместить игру в другую группу
    ${showCtrlHint ? `[Ctrl + ПКМ] Переместить в «${prev.title}»` : ""}
  `;
  return `
  [Удерживание ЛКМ] Создать|Сохранить игру с альтернативными параметрами
  ${rmbHint}
  [Shift + Наведение] Показать содержимое словаря
  [Ctrl + Наведение] Показать статистику игры
`;
};

export function attachGameHover(gamesList, main) {
  const tooltipCache = {
    vocabulary: new Map(), // vocId  → content
    stats:      new Map(), // gameId → content
  };

  let buttonTimeout;

  gamesList.addEventListener('mouseover', (e) => {
    const li = e.target instanceof Element ? e.target.closest('.latest-game') : null;
    if (!li || !gamesList.contains(li)) return;
    const entered = e.relatedTarget instanceof Element ? e.relatedTarget.closest('.latest-game') : null;
    if (entered === li) return; // still inside the same li, ignore
    clearTimeout(buttonTimeout);
    buttonTimeout = setTimeout(() => {
      li.querySelector('.latest-game-buttons').style.visibility = 'visible';
    }, 400);
  });

  gamesList.addEventListener('mouseout', (e) => {
    const li = e.target instanceof Element ? e.target.closest('.latest-game') : null;
    if (!li || !gamesList.contains(li)) return;
    const entered = e.relatedTarget instanceof Element ? e.relatedTarget.closest('.latest-game') : null;
    if (entered === li) return; // still inside the same li, ignore
    clearTimeout(buttonTimeout);
    li.querySelector('.latest-game-buttons').style.visibility = 'hidden';
  });

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
    const gameGroup = main.groupsManager.groups.find(g => g.games.some(g2 => g2.id === gameId));
    updateTooltipContent(link, buildDefaultTooltip(main, gameGroup?.id), 'info');
  });

  gamesList.addEventListener('mouseout', (e) => {
    const left    = e.target instanceof Element ? e.target.closest('a') : null;
    const entered = e.relatedTarget instanceof Element ? e.relatedTarget.closest('a') : null;
    if (left && left !== entered) startHideTimeout();
  });
}