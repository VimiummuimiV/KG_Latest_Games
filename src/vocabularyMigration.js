import { createPopup } from './groupsPopup.js';
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
  const sourceGroup = main.groupsManager.groups.find(group => group.id === main.groupsManager.currentGroupId);
  const targetGroup = main.groupsManager.groups.find(group => group.id === targetGroupId);

  if (!sourceGroup || !targetGroup) return;

  const gameIndex = sourceGroup.games.findIndex(game => game.id === gameId);
  if (gameIndex === -1) return;

  const [game] = sourceGroup.games.splice(gameIndex, 1);
  targetGroup.games.push(game);

  main.gamesManager.saveGameData();
  main.uiManager.refreshContainer();
}