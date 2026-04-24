import { createCustomTooltip } from "../tooltip.js";
import { getActivePlaylistSession, PlaylistsManager } from "../playlistsManager.js";
import { icons } from "../icons.js";

export class GamesDataContainer {
  constructor(main) {
    this.main = main;
    this.container = null;
    this.startIndicator = null;
    this.replayIndicator = null;
    this.startTimer = null;
    this.replayTimer = null;
    this.playCountIndicators = {
      day: null,
      week: null,
      month: null,
      year: null
    };
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  ensureContainer() {
    if (this.container) return;
    const container = document.createElement('div');
    container.className = 'games-data-container';
    document.body.appendChild(container);
    this.container = container;
  }

  createIndicator(className, textContent, tooltipText = null, parent = null) {
    this.ensureContainer();
    const indicator = document.createElement('div');
    indicator.className = `indicator ${className}`;
    indicator.textContent = textContent;
    if (tooltipText) {
      createCustomTooltip(indicator, tooltipText);
    }
    (parent || this.container).appendChild(indicator);
    return indicator;
  }

  getPlayCount(period) {
    try {
      const playedVocabularies = JSON.parse(localStorage.getItem('playedVocabularies') || '[]');
      const now = new Date();
      
      // Get local dates at midnight
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      // Week starts on Monday: convert Sunday=0 to Sunday=6, Monday=1 to Monday=0
      const dayOfWeek = (now.getDay() + 6) % 7;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
      
      let uniqueVocabs = 0;
      let totalGames = 0;
      
      playedVocabularies.forEach(vocab => {
        if (!vocab.playHistory) return;
        
        let hasMatchInPeriod = false;
        
        vocab.playHistory.forEach(history => {
          // Convert UTC stored date to local midnight date
          const storedDate = new Date(history.date);
          const localDate = new Date(
            storedDate.getFullYear(), 
            storedDate.getMonth(), 
            storedDate.getDate()
          ).getTime();
          
          const match = (
            (period === 'day' && localDate === today) ||
            (period === 'week' && localDate >= weekStart && localDate <= today) ||
            (period === 'month' && localDate >= monthStart && localDate <= today) ||
            (period === 'year' && localDate >= yearStart && localDate <= today)
          );
          
          if (match) {
            hasMatchInPeriod = true;
            totalGames += (history.count || 0);
          }
        });
        
        if (hasMatchInPeriod) {
          uniqueVocabs++;
        }
      });
      
      return { uniqueVocabs, totalGames };
    } catch (error) {
      console.error(`Error calculating ${period} play count:`, error);
      return { uniqueVocabs: 0, totalGames: 0 };
    }
  }

  // ============================================================================
  // Container Initialization
  // ============================================================================

  createGamesDataContainer() {
    this.ensureContainer();
    this.createPlayCountIndicators();
    this.createRemainingCountIndicator();
    this.createPlaylistIndicator();
  }

  // ============================================================================
  // Static Indicators
  // ============================================================================

  createPlayCountIndicators() {
    // Create period indicators container
    const periodContainer = document.createElement('div');
    periodContainer.className = 'period-indicators-container';
    this.container.appendChild(periodContainer);

    const tooltipPrefix = 'Количество словарей / Количество заездов за';
    
    const indicators = [
      { period: 'day', class: 'today-play-count-indicator', description: 'День', tooltipSuffix: 'сегодня' },
      { period: 'week', class: 'week-play-count-indicator', description: 'Неделя', tooltipSuffix: 'неделю' },
      { period: 'month', class: 'month-play-count-indicator', description: 'Месяц', tooltipSuffix: 'месяц' },
      { period: 'year', class: 'year-play-count-indicator', description: 'Год', tooltipSuffix: 'год' }
    ];

    let periodIndex = 0;

    indicators.forEach(({ period, class: className, description, tooltipSuffix }) => {
      const { uniqueVocabs, totalGames } = this.getPlayCount(period);
      if (totalGames === 0 && period !== 'day') return;
      
      const indicator = this.createIndicator(className, '', `${tooltipPrefix} ${tooltipSuffix}`, periodContainer);
      this.playCountIndicators[period] = indicator;
      
      // Pre-build complete structure once
      const descSpan = document.createElement('span');
      descSpan.className = 'period-indicator-description';
      descSpan.textContent = description;
      descSpan.style.display = 'none';
      
      const countText = document.createTextNode(`${uniqueVocabs}/${totalGames}`);
      
      indicator.appendChild(descSpan);
      indicator.appendChild(countText);
      indicator._descSpan = descSpan;
      
      if (period !== 'day') {
        indicator.classList.add('period-indicator');
        indicator.style.setProperty('--fall-delay', `${periodIndex++ * 90}ms`);
      }
    });

    periodContainer.addEventListener('mouseenter', () => this.toggleExtendedIndicators(true));
    periodContainer.addEventListener('mouseleave', () => this.toggleExtendedIndicators(false));
  }

  toggleExtendedIndicators(show) {
    ['day', 'week', 'month', 'year'].forEach(period => {
      const indicator = this.playCountIndicators[period];
      if (indicator) {
        if (period !== 'day') indicator.classList.toggle('show', show);
        indicator._descSpan.style.display = show ? '' : 'none';
      }
    });
  }

  createRemainingCountIndicator() {
    // Only show replay-more indicator if we're in replay-more mode and not in a playlist session (which has its own indicator)
    if (!this.main.shouldReplayMore || getActivePlaylistSession()) return;
    this.createIndicator(
      'remaining-count-indicator',
      `${this.main.remainingReplayCount}`,
      "Колличество оставшихся повторов текущего словаря"
    );
  }

  updateRemainingCountIndicator() {
    if (!this.container) return;
    // If we're in a playlist session, the remaining count is managed by the playlist indicator, so remove any standalone indicator if it exists
    if (getActivePlaylistSession()) {
      const rep = this.container.querySelector('.remaining-count-indicator');
      if (rep) rep.remove();
      return;
    }
    const indicator = this.container.querySelector('.remaining-count-indicator');
    if (indicator) indicator.textContent = `${this.main.remainingReplayCount}`;
  }

  // Update today play count indicator in realtime (called after marking a vocab as played)
  updateTodayIndicator() {
    const indicator = this.playCountIndicators['day'];
    if (!indicator) return;
    const { uniqueVocabs, totalGames } = this.getPlayCount('day');
    // The indicator's text node is the last child (after the descSpan)
    const textNode = Array.from(indicator.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = `${uniqueVocabs}/${totalGames}`;
  }

  // ============================================================================
  // Playlist Indicator Helpers
  // ============================================================================

  // Shared data-fetch logic for both createPlaylistIndicator and updatePlaylistIndicator.
  // Returns { session, playlist, pos, total, reps } or null if no active playlist.
  _getPlaylistIndicatorData() {
    const session = getActivePlaylistSession();
    if (!session) return null;
    try {
      const playlists = JSON.parse(localStorage.getItem('latestGamesPlaylists') || '[]');
      const playlist  = playlists.find(p => p.id === session.playlistId);
      if (!playlist) return null;
      return {
        session,
        playlist,
        total: playlist.entries.length,
        pos:   session.entryIndex + 1,
        reps:  session.remainingRepeats
      };
    } catch { return null; }
  }

  createPlaylistIndicator() {
    const data = this._getPlaylistIndicatorData();
    if (!data) return;
    const { playlist, pos, total, reps } = data;
    const tip = `[Плейлист] ${playlist.title}[Позиция] ${pos} из ${total}[Осталось повторов] ${reps}`;

    this.ensureContainer();
    const indicator = document.createElement('div');
    indicator.className = 'indicator playlist-progress-indicator';
    indicator.innerHTML = this._playlistIndicatorHTML(pos, total, reps);
    createCustomTooltip(indicator, tip);

    // State 2 (pinned): clicking the HUD indicator opens but never closes the panel
    indicator.addEventListener('click', () => {
      const rect = indicator.getBoundingClientRect();
      if (this.main.playlistPanelAutoOpen === 2) {
        if (!PlaylistsManager.popup) PlaylistsManager.show(rect.left, rect.bottom);
      } else {
        PlaylistsManager.toggle(rect.left, rect.bottom);
      }
    });

    this.container.appendChild(indicator);

    // Auto-open on page load for states 1 and 2
    if (this.main.playlistPanelAutoOpen >= 1 && !PlaylistsManager.popup) {
      requestAnimationFrame(() => {
        const rect = indicator.getBoundingClientRect();
        PlaylistsManager.show(rect.left, rect.bottom);
      });
    }
  }

  _playlistIndicatorHTML(pos, total, reps) {
    return `<span class="playlist-hud-icon">${icons.playing}</span><span class="playlist-hud-counter">${pos}/${total} ×${reps}</span>`;
  }

  updatePlaylistIndicator() {
    if (!this.container) return;
    const indicator = this.container.querySelector('.playlist-progress-indicator');
    if (!indicator) return;
    const data = this._getPlaylistIndicatorData();
    if (!data) { indicator.remove(); return; }
    const { playlist, pos, total, reps } = data;
    indicator.innerHTML = this._playlistIndicatorHTML(pos, total, reps);
    createCustomTooltip(indicator,
      `[Плейлист] ${playlist.title}[Позиция] ${pos} из ${total}[Осталось повторов] ${reps}`);
  }

  // ============================================================================
  // Dynamic Timer Indicators
  // ============================================================================

  createSleepIndicator(type, totalMs, sleepPromise = null, onCancel = null) {
    this.ensureContainer();

    const indicator = document.createElement('div');
    indicator.className = `indicator ${type === 'start' ? 'sleep-start-indicator' : 'sleep-replay-indicator'}`;
    this.container.insertBefore(indicator, this.container.firstChild);

    const tooltipText = type === 'start'
      ? '[Наведение] Заморозить таймер  [Клик] Отменить автоматический старт игры'
      : '[Наведение] Заморозить таймер  [Клик] Отменить автоматический повтор игры';
    createCustomTooltip(indicator, tooltipText);

    // Click cancels the countdown
    indicator.addEventListener('click', () => {
      indicator.classList.add('sleep-indicator-dismissing');
      setTimeout(() => { if (onCancel) onCancel(); }, 300);
    }, { once: true });

    type === 'start' ? this.startIndicator = indicator : this.replayIndicator = indicator;

    // Visual countdown — reads remaining time from the sleep promise
    let rafId = null;
    let frozen = false;

    const formatTime = ms => {
      const seconds      = Math.floor(ms / 1000);
      const centiseconds = Math.floor((ms % 1000) / 10);
      return `${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
    };

    const tick = () => {
      if (frozen) return;
      const ms = sleepPromise?.getRemainingMs?.() ?? 0;
      indicator.textContent = formatTime(ms);
      if (ms > 0) {
        rafId = requestAnimationFrame(tick);
        type === 'start' ? this.startTimer = rafId : this.replayTimer = rafId;
      }
    };

    // Hover: pause sleep + freeze visual display
    indicator.addEventListener('mouseenter', () => {
      frozen = true;
      cancelAnimationFrame(rafId);
      rafId = null;
      sleepPromise?.pause?.();
      indicator.classList.add('sleep-indicator-paused');
    });

    // Leave: resume sleep + restart visual loop
    indicator.addEventListener('mouseleave', () => {
      frozen = false;
      indicator.classList.remove('sleep-indicator-paused');
      sleepPromise?.resume?.();
      tick();
    });

    tick();
  }

  removeSleepIndicator(type, animated = false) {
    const doRemove = (indicator, timerProp, indicatorProp) => {
      if (this[timerProp]) {
        cancelAnimationFrame(this[timerProp]);
        this[timerProp] = null;
      }
      if (!indicator) return Promise.resolve();
      this[indicatorProp] = null;

      const isDismissing = indicator.classList.contains('sleep-indicator-dismissing');
      if (animated && !isDismissing) indicator.classList.add('sleep-indicator-dismissing');
      if (animated || isDismissing) return new Promise(resolve => setTimeout(() => { indicator.remove(); resolve(); }, 300));
      indicator.remove();
      return Promise.resolve();
    };

    if (type === 'start') {
      return doRemove(this.startIndicator, 'startTimer', 'startIndicator');
    } else if (type === 'replay') {
      return doRemove(this.replayIndicator, 'replayTimer', 'replayIndicator');
    }
    return Promise.resolve();
  }
}