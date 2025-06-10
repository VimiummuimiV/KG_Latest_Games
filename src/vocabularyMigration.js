import { createPopup } from './groupsPopup.js';
import { hideTooltipElement } from './tooltip.js';

export function showMigrationPopup(manager, groups, currentGroupId, event, gameId) {
  hideTooltipElement(); // Hide any existing tooltip

  // Create button configurations for groups (excluding current group)
  const buttonConfigs = groups
    .filter(group => group.id !== currentGroupId)
    .map(group => ({
      text: group.title,
      className: 'group-tab',
      dataset: { groupId: group.id },
      onClick: () => {
        migrateGame(manager, gameId, group.id);
      }
    }));

  createPopup(buttonConfigs, event, 'game-migration-popup', 'Переместить');
}

export function migrateGame(manager, gameId, targetGroupId) {
  const sourceGroup = manager.groups.find(group => group.id === manager.currentGroupId);
  const targetGroup = manager.groups.find(group => group.id === targetGroupId);

  if (!sourceGroup || !targetGroup) return;

  const gameIndex = sourceGroup.games.findIndex(game => game.id === gameId);
  if (gameIndex === -1) return;

  const [game] = sourceGroup.games.splice(gameIndex, 1);
  targetGroup.games.push(game);

  manager.saveGameData();
  manager.refreshContainer();
}