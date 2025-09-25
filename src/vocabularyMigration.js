import { createPopup } from './menuPopup.js';
import { hideTooltipElement } from './tooltip.js';

export function showMigrationPopup(main, groups, currentGroupId, event, gameId) {
  hideTooltipElement(); // Hide any existing tooltip

  // Create button configurations for groups (excluding current group)
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

  createPopup(buttonConfigs, event, 'game-migration-popup', 'Переместить');
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

  main.gamesManager.saveGameData();
  main.uiManager.refreshContainer();
}