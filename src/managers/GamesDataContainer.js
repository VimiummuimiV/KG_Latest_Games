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
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const weekStart = new Date(Math.max(monthStart, new Date(today).setDate(today.getDate() - 6)));

      return playedVocabularies.reduce((total, vocab) => {
        if (!vocab.playHistory) return total;
        return total + vocab.playHistory.reduce((sum, history) => {
          const date = new Date(history.date);
          const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          
          const match = (
            (period === 'day' && localDate.getTime() === today.getTime()) ||
            (period === 'week' && localDate >= weekStart && localDate <= today) ||
            (period === 'month' && localDate.getMonth() === today.getMonth() && localDate.getFullYear() === today.getFullYear()) ||
            (period === 'year' && localDate.getFullYear() === today.getFullYear())
          );
          
          return sum + (match ? (history.count || 0) : 0);
        }, 0);
      }, 0);
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
      { period: 'day', class: 'today-play-count-indicator', tooltip: 'Количество сыгранных словарей за сегодня', description: 'День' },
      { period: 'week', class: 'week-play-count-indicator', tooltip: 'Количество сыгранных словарей за неделю', description: 'Неделя' },
      { period: 'month', class: 'month-play-count-indicator', tooltip: 'Количество сыгранных словарей за месяц', description: 'Месяц' },
      { period: 'year', class: 'year-play-count-indicator', tooltip: 'Количество сыгранных словарей за год', description: 'Год' }
    ];

    indicators.forEach(({ period, class: className, tooltip, description }) => {
      const count = this.getPlayCount(period);
      if (count === 0 && period !== 'day') return; // Skip if no data (except for day which always shows)
      
      this.playCountIndicators[period] = this.createIndicator(className, `${count}`, tooltip, periodContainer);
      this.playCountIndicators[period].dataset.description = description;
      this.playCountIndicators[period].dataset.count = count;
      
      if (period !== 'day') {
        this.playCountIndicators[period].style.display = 'none';
      }
    });

    // Add hover listeners to period container
    periodContainer.addEventListener('mouseenter', () => this.toggleExtendedIndicators(true));
    periodContainer.addEventListener('mouseleave', () => this.toggleExtendedIndicators(false));
  }

  toggleExtendedIndicators(show) {
    ['day', 'week', 'month', 'year'].forEach(period => {
      const indicator = this.playCountIndicators[period];
      if (indicator) {
        if (period !== 'day') {
          indicator.style.display = show ? 'flex' : 'none';
        }
        if (show) {
          indicator.textContent = '';
          const descSpan = document.createElement('span');
          descSpan.className = 'period-indicator-description';
          descSpan.textContent = indicator.dataset.description;
          indicator.appendChild(descSpan);
          indicator.appendChild(document.createTextNode(indicator.dataset.count));
        } else {
          indicator.textContent = indicator.dataset.count;
        }
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