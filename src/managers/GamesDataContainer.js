import { createCustomTooltip } from "../tooltip.js";

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
    indicator.className = className;
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let totalCount = 0;

      for (const vocab of playedVocabularies) {
        if (!vocab.playHistory) continue;
        for (const history of vocab.playHistory) {
          const historyDate = new Date(history.date);
          historyDate.setHours(0, 0, 0, 0);

          let shouldCount = false;

          switch (period) {
            case 'day':
              shouldCount = historyDate.toISOString() === today.toISOString();
              break;

            case 'week':
              const weekAgo = new Date(today);
              weekAgo.setDate(weekAgo.getDate() - 7);
              shouldCount = historyDate >= weekAgo && historyDate <= today;
              break;

            case 'month':
              shouldCount = historyDate.getMonth() === today.getMonth() && 
                           historyDate.getFullYear() === today.getFullYear();
              break;

            case 'year':
              shouldCount = historyDate.getFullYear() === today.getFullYear();
              break;
          }

          if (shouldCount) {
            totalCount += history.count || 0;
          }
        }
      }
      return totalCount;
    } catch (error) {
      console.error(`Error calculating ${period} play count:`, error);
      return 0;
    }
  }

  // ============================================================================
  // Container Initialization
  // ============================================================================

  createGamesDataContainer() {
    this.ensureContainer();
    this.createPlayCountIndicators();
    this.createRemainingCountIndicator();
  }

  // ============================================================================
  // Static Indicators
  // ============================================================================

  createPlayCountIndicators() {
    // Create period indicators container
    const periodContainer = document.createElement('div');
    periodContainer.className = 'period-indicators-container';
    this.container.appendChild(periodContainer);

    const indicators = [
      { period: 'day', class: 'today-play-count-indicator', tooltip: 'Количество сыгранных словарей за сегодня' },
      { period: 'week', class: 'week-play-count-indicator', tooltip: 'Количество сыгранных словарей за неделю' },
      { period: 'month', class: 'month-play-count-indicator', tooltip: 'Количество сыгранных словарей за месяц' },
      { period: 'year', class: 'year-play-count-indicator', tooltip: 'Количество сыгранных словарей за год' }
    ];

    indicators.forEach(({ period, class: className, tooltip }) => {
      const count = this.getPlayCount(period);
      if (period === 'year' && count === 0) return; // Skip year if no data
      
      this.playCountIndicators[period] = this.createIndicator(className, `${count}`, tooltip, periodContainer);
      
      if (period !== 'day') {
        this.playCountIndicators[period].style.display = 'none';
      }
    });

    // Add hover listeners to period container
    periodContainer.addEventListener('mouseenter', () => this.toggleExtendedIndicators(true));
    periodContainer.addEventListener('mouseleave', () => this.toggleExtendedIndicators(false));
  }

  toggleExtendedIndicators(show) {
    ['week', 'month', 'year'].forEach(period => {
      if (this.playCountIndicators[period]) {
        this.playCountIndicators[period].style.display = show ? 'flex' : 'none';
      }
    });
  }

  createRemainingCountIndicator() {
    if (!this.main.shouldReplayMore) return;
    this.createIndicator(
      'remaining-count-indicator',
      `${this.main.remainingReplayCount}`,
      "Колличество оставшихся повторов текущего словаря"
    );
  }

  // ============================================================================
  // Dynamic Timer Indicators
  // ============================================================================

  createSleepIndicator(type, totalMs) {
    this.ensureContainer();
    
    const indicator = document.createElement('div');
    indicator.className = type === 'start' ? 'sleep-start-indicator' : 'sleep-replay-indicator';
    this.container.insertBefore(indicator, this.container.firstChild);

    const tooltipText = type === 'start' 
      ? 'Таймер автоматического старта игры'
      : 'Таймер автоматического повтора игры';
    createCustomTooltip(indicator, tooltipText);
    
    type === 'start' ? this.startIndicator = indicator : this.replayIndicator = indicator;
    
    let remainingMs = totalMs;
    const startTime = Date.now();
    
    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(0, totalMs - elapsed);
      
      const seconds = Math.floor(remainingMs / 1000);
      const milliseconds = Math.floor((remainingMs % 1000) / 10);
      indicator.textContent = `${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
      
      if (remainingMs > 0) {
        const timerId = requestAnimationFrame(updateTimer);
        type === 'start' ? this.startTimer = timerId : this.replayTimer = timerId;
      }
    };
    
    updateTimer();
  }

  removeSleepIndicator(type) {
    if (type === 'start') {
      if (this.startTimer) {
        cancelAnimationFrame(this.startTimer);
        this.startTimer = null;
      }
      if (this.startIndicator) {
        this.startIndicator.remove();
        this.startIndicator = null;
      }
    } else if (type === 'replay') {
      if (this.replayTimer) {
        cancelAnimationFrame(this.replayTimer);
        this.replayTimer = null;
      }
      if (this.replayIndicator) {
        this.replayIndicator.remove();
        this.replayIndicator = null;
      }
    }
  }
}