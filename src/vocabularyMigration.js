import { createPopup } from './menuPopup.js';
import { hideTooltipElement } from './tooltip.js';

export function showMigrationPopup(main, groups, currentGroupId, event, gameId) {
  hideTooltipElement();

  const prevGroupId = (main.gamesManager.latestGamesData || {}).latestGroupMigratedGameId ?? null;

  const buttonConfigs = groups
    .filter(group => group.id !== currentGroupId)
    .map(group => ({
      text: group.title,
      className: 'group-tab',
      dataset: { groupId: group.id },
      onClick: () => {
        migrateGame(main, gameId, group.id);
      }
    }));

  createPopup(buttonConfigs, event, 'game-migration-popup', 'Переместить', false, prevGroupId);
}

export function migrateGame(main, gameId, targetGroupId) {
  // Find the actual source group that currently contains the game
  const sourceGroup = main.groupsManager.groups.find(group => group.games.some(game => game.id === gameId));
  const targetGroup = main.groupsManager.groups.find(group => group.id === targetGroupId);

  if (!sourceGroup || !targetGroup) return;

  // If the game is already in the target group, nothing to do
  if (sourceGroup.id === targetGroup.id) return;

  const gameIndex = sourceGroup.games.findIndex(game => game.id === gameId);
  if (gameIndex === -1) return;

  const [game] = sourceGroup.games.splice(gameIndex, 1);
  targetGroup.games.push(game);

  // Remember the last migration target for Ctrl+RMB shortcut
  (main.gamesManager.latestGamesData ||= {}).latestGroupMigratedGameId = targetGroupId;

  main.gamesManager.saveGamesData();
  main.uiManager.refreshContainer();
}

export function getPreviousMigrationGroup(main) {
  const id = (main.gamesManager.latestGamesData || {}).latestGroupMigratedGameId;
  return id ? main.groupsManager.groups.find(g => g.id === id) || null : null;
}

export function migrateGameToPreviousGroup(main, gameId) {
  const group = getPreviousMigrationGroup(main);
  if (group) migrateGame(main, gameId, group.id);
  return !!group;
}