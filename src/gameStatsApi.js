import { gameTypes, gameCategories } from './definitions.js';

export class GameStatsApi {
  constructor() {
    this.cache = new Map(); // Cache API responses
  }

  /**
   * Extract user ID from avatar image
   * @returns {string|null} User ID or null if not found
   */
  getUserId() {
    const avatarImg = document.querySelector('.userpanel .user-block .name img');
    if (!avatarImg) return null;

    const src = avatarImg.src;
    const match = src.match(/\/avatars\/(\d+)_/);
    return match ? match[1] : null;
  }

  /**
   * Parse game parameters from anchor href
   * @param {HTMLAnchorElement} anchor 
   * @returns {Object} Parsed parameters
   */
  parseGameParams(anchor) {
    const href = anchor.href;
    const url = new URL(href);
    const params = {};

    for (const [key, value] of url.searchParams) {
      params[key] = value;
    }

    return params;
  }

  /**
   * Get game ID from anchor URL (voc ID for voc games, or gametype for others)
   * @param {HTMLAnchorElement} anchor 
   * @returns {string|null} Game ID or null if not found
   */
  getGameId(anchor) {
    const params = this.parseGameParams(anchor);

    if (params.gametype === 'voc' && params.voc) {
      return params.voc; // Return voc ID for voc games
    } else if (params.gametype) {
      return params.gametype; // Return gametype for other games
    }

    return 'normal'; // Default fallback
  }

  /**
   * Build API URL based on game type and parameters
   * @param {string} userId 
   * @param {Object} gameParams 
   * @returns {string} API URL
   */
  buildApiUrl(userId, gameParams) {
    const baseUrl = 'https://klavogonki.ru/api/profile/get-stats-details';
    const params = new URLSearchParams({
      userId: userId
    });

    // Valid game types that the API supports (using imported gameTypes)
    const validApiGameTypes = Object.keys(gameTypes);

    if (gameParams.gametype === 'voc' && gameParams.voc) {
      params.append('gametype', `voc-${gameParams.voc}`);
    } else if (gameParams.gametype && validApiGameTypes.includes(gameParams.gametype)) {
      params.append('gametype', gameParams.gametype);
    } else {
      // For unsupported game types, default to 'normal'
      console.warn(`Unsupported gametype "${gameParams.gametype}", defaulting to "normal"`);
      params.append('gametype', 'normal');
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Fetch game stats from API
   * @param {string} apiUrl 
   * @returns {Promise<Object|null>} API response or null if failed
   */
  async fetchGameStats(apiUrl) {
    // Check cache first
    if (this.cache.has(apiUrl)) {
      return this.cache.get(apiUrl);
    }

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Cache the response
      this.cache.set(apiUrl, data);

      return data;
    } catch (error) {
      console.error('Failed to fetch game stats:', error);
      return null;
    }
  }

  /**
   * Format time from seconds to MM:SS format
   * @param {number} seconds 
   * @returns {string} Formatted time
   */
  formatTime(seconds) {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format date to Russian locale
   * @param {string} dateString 
   * @returns {string} Formatted date
   */
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }

  /**
   * Format game stats for tooltip display with bracket formatting
   * @param {Object} statsData 
   * @param {string} gameId 
   * @param {Object} gameParams 
   * @returns {string} Formatted tooltip content
   */
  formatStats(statsData, gameId, gameParams) {
    if (!statsData || !statsData.ok) {
      return `Данные отсутствуют`;
    }

    const { gametype, info } = statsData;
    let content = '';

    content += '## Информация';

    // Game type information
    if (gametype) {
      if (gametype.name) content += `[Название] ${gametype.name}`;
      if (gametype.id) content += `[ID словаря] ${gametype.id}`;
      if (gametype.type) {
        const categoryName = gameCategories[gametype.type] || gametype.type;
        content += `[Категория] ${categoryName}`;
      }
      if (gametype.symbols) content += `[Символов] ${gametype.symbols.toLocaleString()}`;
      if (gametype.rows) content += `[Строк] ${gametype.rows.toLocaleString()}`;
    }

    content += '## Статистика';

    // User performance information
    if (info) {
      if (info.num_races) content += `[Заездов] ${info.num_races}`;
      if (info.avg_speed) content += `[Средняя скорость] ${Math.round(info.avg_speed)} зн/мин`;
      if (info.best_speed) content += `[Лучшая скорость] ${info.best_speed} зн/мин`;
      if (info.avg_error !== undefined) content += `[Средний % ошибок] ${info.avg_error.toFixed(2)}%`;
      if (info.qual !== undefined) content += `[Квалификация] ${info.qual === 0 ? 'Нет' : 'Да'}`;

      // Total time (seconds)
      if (info.haul && info.haul.total) {
        content += `[Общее время] ${this.formatTime(info.haul.total)}`;
      }

      // Time breakdown (hours/minutes)
      if (info.haul) {
        const parts = [];
        if (info.haul.hour) parts.push(`${info.haul.hour}ч`);
        if (info.haul.min) parts.push(`${info.haul.min}м`);
        if (parts.length) {
          content += `[Время в игре] ${parts.join(' ')}`;
        }
      }
    }

    return content.trim();
  }

  /**
   * Get complete game stats for tooltip
   * @param {HTMLElement} element 
   * @returns {Promise<string>} Formatted tooltip content
   */
  async getGameStats(element) {
    // Find the anchor element to get game parameters
    const anchor = element.closest('li').querySelector('a');
    if (!anchor) {
      return '[Ошибка] Не удалось найти параметры игры';
    }

    const gameId = this.getGameId(anchor);
    if (!gameId) {
      return '[Ошибка] Не удалось получить ID игры';
    }

    const userId = this.getUserId();
    if (!userId) {
      return `[Game ID] ${gameId} [Ошибка] Не удалось получить ID пользователя`;
    }

    const gameParams = this.parseGameParams(anchor);
    const apiUrl = this.buildApiUrl(userId, gameParams);

    // Fetch data asynchronously
    try {
      const statsData = await this.fetchGameStats(apiUrl);
      return this.formatStats(statsData, gameId, gameParams);
    } catch (error) {
      console.error('Error getting game stats:', error);
      return `[Game ID] ${gameId} [Ошибка] Ошибка загрузки статистики`;
    }
  }
}

// Create singleton instance
export const gameStatsApi = new GameStatsApi();
