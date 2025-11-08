import { createPopup } from './menuPopup.js';
import { popupIcons } from './definitions.js';
import { gameStatsApi } from './gameStatsApi.js';

/**
 * Create a game info popup with game-related links
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {Object} game - The game object containing params
 * @returns {HTMLElement} The created popup element
 */
export function createGameInfoPopup(event, game) {
  const isVocGame = game.params.gametype === 'voc' && game.params.vocId;
  const gameType = game.params.gametype;
  const siteRoot = 'https://klavogonki.ru';
  
  let buttonConfigs = [
    {
      text: `${popupIcons.day} День`,
      className: 'popup-button',
      onClick: () => {
        const url = isVocGame 
          ? `${siteRoot}/vocs/${game.params.vocId}/top/day/`
          : `${siteRoot}/top/day/${gameType}/`;
        window.open(url, '_blank');
      }
    },
    {
      text: `${popupIcons.week} Неделя`,
      className: 'popup-button',
      onClick: () => {
        const url = isVocGame 
          ? `${siteRoot}/vocs/${game.params.vocId}/top/week/`
          : `${siteRoot}/top/week/${gameType}/`;
        window.open(url, '_blank');
      }
    }
  ];

  // Add vocabulary-specific links only for voc games
  if (isVocGame) {
    const vocId = game.params.vocId;
    const vocsBaseUrl = `${siteRoot}/vocs/${vocId}`;
    const userId = gameStatsApi.getUserId();
    const profileBaseUrl = `${siteRoot}/u/#/${userId}/stats`;
    
    buttonConfigs.unshift({
      text: `${popupIcons.general} Общая`,
      className: 'popup-button',
      onClick: () => window.open(vocsBaseUrl + '/', '_blank')
    });
    
    buttonConfigs.push(
      {
        text: `${popupIcons.history} История`,
        className: 'popup-button',
        onClick: () => window.open(vocsBaseUrl + '/history/', '_blank')
      },
      {
        text: `${popupIcons.comments} Комментарии`,
        className: 'popup-button',
        onClick: () => window.open(vocsBaseUrl + '/comments/', '_blank')
      },
      {
        text: `${popupIcons.stats} Статистика`,
        className: 'popup-button',
        onClick: () => window.open(profileBaseUrl + `/voc-${vocId}/`, '_blank')
      }
    );
  }

  return createPopup(buttonConfigs, event, 'game-popup', 'Информация');
}