import { createElement } from './utils.js';

export function showMigrationPopup(manager, groups, currentGroupId, event, gameId) {
  const existingPopup = document.querySelector('.game-migration-popup');
  if (existingPopup) existingPopup.remove();

  const popup = createElement('div', { className: 'game-migration-popup' });
  groups.forEach(group => {
    if (group.id !== currentGroupId) {
      const button = createElement('button', {
        className: 'group-tab',
        textContent: group.title,
        dataset: { groupId: group.id }
      });
      button.addEventListener('click', () => {
        migrateGame(manager, gameId, group.id);
        popup.remove();
      });
      popup.appendChild(button);
    }
  });

  popup.style.left = `${event.clientX}px`;
  popup.style.top = `${event.clientY}px`;
  document.body.appendChild(popup);

  const hidePopup = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', hidePopup);
    }
  };
  document.addEventListener('click', hidePopup);
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