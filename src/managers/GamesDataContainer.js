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
      indicator.classList.add('sleep-indicator-cancelled');
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
      if (!indicator) return;
      this[indicatorProp] = null;
      if (animated && !indicator.classList.contains('sleep-indicator-cancelled')) {
        indicator.classList.add('sleep-indicator-cancelled');
        setTimeout(() => indicator.remove(), 300);
      } else {
        indicator.remove();
      }
    };

    if (type === 'start') {
      doRemove(this.startIndicator, 'startTimer', 'startIndicator');
    } else if (type === 'replay') {
      doRemove(this.replayIndicator, 'replayTimer', 'replayIndicator');
    }
  }
}