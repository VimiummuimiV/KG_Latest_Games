export class GamesDataContainer {
  constructor(main) {
    this.main = main;
    this.container = null;
    this.startIndicator = null;
    this.replayIndicator = null;
    this.startTimer = null;
    this.replayTimer = null;
  }

  createGamesDataContainer() {
    const container = document.createElement('div');
    container.className = 'games-data-container';
    document.body.appendChild(container);
    this.container = container;
    this.createRemainingCountIndicator();
  }

  createRemainingCountIndicator() {
    // No need to create indicator if replay more is not enabled
    if (!this.main.shouldReplayMore) return;
    // Ensure the games data container exists
    if (!this.container) this.createGamesDataContainer();

    const indicator = document.createElement('div');
    indicator.className = 'remaining-count-indicator';
    indicator.textContent = `${this.main.remainingReplayCount}`;
    this.container.appendChild(indicator);
  }

  createSleepIndicator(type, totalMs) {
    // Ensure the games data container exists
    if (!this.container) this.createGamesDataContainer();

    const indicator = document.createElement('div');
    indicator.className = type === 'start' ? 'sleep-start-indicator' : 'sleep-replay-indicator';
    this.container.insertBefore(indicator, this.container.firstChild);

    let remainingMs = totalMs;
    const startTime = Date.now();

    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(0, totalMs - elapsed);

      const seconds = Math.floor(remainingMs / 1000);
      const milliseconds = Math.floor((remainingMs % 1000) / 10); // Show 2 decimal places
      indicator.textContent = `${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;

      if (remainingMs > 0) {
        const timerId = requestAnimationFrame(updateTimer);
        if (type === 'start') {
          this.startTimer = timerId;
        } else {
          this.replayTimer = timerId;
        }
      }
    };

    updateTimer();
    return indicator;
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