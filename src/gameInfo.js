import { createPopup } from './menuPopup.js';
import { popupIcons } from './definitions.js';

/**
 * Create a game info popup with game-related links
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {Object} game - The game object containing params
 * @returns {HTMLElement} The created popup element
 */
export function createGameInfoPopup(event, game) {
  const isVocGame = game.params.gametype === 'voc' && game.params.vocId;
  const gameType = game.params.gametype;
  
  let buttonConfigs = [
    {
      text: `${popupIcons.day} День`,
      className: 'popup-button',
      onClick: () => {
        const url = isVocGame 
          ? `https://klavogonki.ru/vocs/${game.params.vocId}/top/day/`
          : `https://klavogonki.ru/top/day/${gameType}/`;
        window.open(url, '_blank');
      }
    },
    {
      text: `${popupIcons.week} Неделя`,
      className: 'popup-button',
      onClick: () => {
        const url = isVocGame 
          ? `https://klavogonki.ru/vocs/${game.params.vocId}/top/week/`
          : `https://klavogonki.ru/top/week/${gameType}/`;
        window.open(url, '_blank');
      }
    }
  ];

  // Add vocabulary-specific links only for voc games
  if (isVocGame) {
    const vocId = game.params.vocId;
    const baseUrl = `https://klavogonki.ru/vocs/${vocId}`;
    
    buttonConfigs.unshift({
      text: `${popupIcons.general} Общая`,
      className: 'popup-button',
      onClick: () => window.open(baseUrl + '/', '_blank')
    });
    
    buttonConfigs.push(
      {
        text: `${popupIcons.history} История`,
        className: 'popup-button',
        onClick: () => window.open(baseUrl + '/history/', '_blank')
      },
      {
        text: `${popupIcons.comments} Комментарии`,
        className: 'popup-button',
        onClick: () => window.open(baseUrl + '/comments/', '_blank')
      }
    );
  }

  return createPopup(buttonConfigs, event, 'game-popup', 'Информация');
}