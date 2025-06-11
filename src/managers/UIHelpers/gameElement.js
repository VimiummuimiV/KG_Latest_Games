import { createElement } from '../../utils.js';
import { createCustomTooltip } from '../../tooltip.js';
import { addDragFunctionality } from '../../drag.js';
import { icons } from '../../icons.js';

export function createGameElement(main, game, id) {
  const gametypeClass = game.pin ? ` pin-gametype-${game.params.gametype}` : '';
  const li = createElement('li', {
    className: `latest-game${game.pin ? ' pin-game' : ''}${gametypeClass}`,
    id: `latest-game-${id}`
  });
  // Add orientation class depending on description display
  const orientationClass = main.showButtonDescriptions ? 'vertical-orientation' : 'horizontal-orientation';
  const buttons = createElement('div', { className: `latest-game-buttons ${orientationClass}` });
  const pinButton = createElement('div', {
    className: 'latest-game-pin',
    innerHTML: icons.pin
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

  buttons.appendChild(pinButton);
  buttons.appendChild(deleteButton);

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
  createCustomTooltip(link, `
    [Клик] Перейти к игре с текущими параметрами
    [Shift + Клик] Перейти к игре с альтернативными параметрами
    [Удерживание (ЛКМ)] аналогично (Shift + Клик)
  `);

  li.appendChild(buttons);
  li.appendChild(link);
  if (game.pin && main.enableDragging) addDragFunctionality(main, li);
  return li;
}