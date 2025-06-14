import { createPopup } from './menuPopup.js';

/**
 * Create a game info popup with vocabulary-related links
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {Object} game - The game object containing params
 * @returns {HTMLElement} The created popup element
 */
export function createGameInfoPopup(event, game) {
  if (game.params.gametype !== 'voc' || !game.params.vocId) {
    console.warn('Game info popup is only available for vocabulary games');
    return null;
  }

  const vocId = game.params.vocId;
  const baseUrl = `https://klavogonki.ru/vocs/${vocId}`;

  const buttonConfigs = [
    {
      text: 'Общая',
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/', '_blank')
    },
    {
      text: 'День',
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/top/day/', '_blank')
    },
    {
      text: 'Неделя',
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/top/week/', '_blank')
    },
    {
      text: 'История',
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/history/', '_blank')
    },
    {
      text: 'Комментарии',
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/comments/', '_blank')
    }
  ];

  return createPopup(buttonConfigs, event, 'game-popup', 'Информация');
}