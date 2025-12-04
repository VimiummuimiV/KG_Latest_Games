import { createCustomTooltip } from "../tooltip.js";

export class GamesDataContainer {
  constructor(main) {
    this.main = main;
    this.container = null;
    this.startIndicator = null;
    this.replayIndicator = null;
    this.startTimer = null;
    this.replayTimer = null;
    this.todayPlayCountIndicator = null;
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

  createIndicator(className, textContent, tooltipText = null) {
    this.ensureContainer();
    const indicator = document.createElement('div');
    indicator.className = className;
    indicator.textContent = textContent;
    if (tooltipText) {
      createCustomTooltip(indicator, tooltipText);
    }
    this.container.appendChild(indicator);
    return indicator;
  }

  // ============================================================================
  // Container Initialization
  // ============================================================================

  createGamesDataContainer() {
    this.ensureContainer();
    this.createTodayPlayCountIndicator();
    this.createRemainingCountIndicator();
  }

  // ============================================================================
  // Static Indicators
  // ============================================================================

  getTodayPlayCount() {
    try {
      const playedVocabularies = JSON.parse(localStorage.getItem('playedVocabularies') || '[]');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      let totalCount = 0;
      for (const vocab of playedVocabularies) {
        if (!vocab.playHistory) continue;
        for (const history of vocab.playHistory) {
          const historyDate = new Date(history.date);
          historyDate.setHours(0, 0, 0, 0);
          if (historyDate.toISOString() === todayStr) {
            totalCount += history.count || 0;
          }
        }
      }
      return totalCount;
    } catch (error) {
      console.error('Error calculating today play count:', error);
      return 0;
    }
  }

  createTodayPlayCountIndicator() {
    this.todayPlayCountIndicator = this.createIndicator(
      'today-play-count-indicator',
      `${this.getTodayPlayCount()}`,
      "Количество сыгранных за сегодня словарей"
    );
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

    // Add tooltip based on type
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