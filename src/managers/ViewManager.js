import { icons } from '../icons.js';
import { createElement } from '../utils.js';
import { createCustomTooltip } from '../tooltip.js';

export class ViewManager {
  constructor(main) {
    this.main = main;
  }

  getDisplayMode() {
    return this.main.displayMode;
  }

  setDisplayMode(mode) {
    this.main.displayMode = mode;
    this.main.settingsManager.saveSettings();
  }

  createDisplayModeToggle() {
    const toggleButton = createElement('div', {
      className: 'display-mode-toggle control-button'
    });
    toggleButton.innerHTML = this.getDisplayMode() === 'wrap' ? icons.wrap : icons.scroll;
    createCustomTooltip(toggleButton, this.getDisplayMode() === 'wrap'
      ? 'Переключить режим отображения в вертикальный вид'
      : 'Переключить режим отображения в горизонтальный вид');

    toggleButton.addEventListener('click', () => {
      const newMode = this.getDisplayMode() === 'scroll' ? 'wrap' : 'scroll';
      this.setDisplayMode(newMode);
      toggleButton.innerHTML = newMode === 'wrap' ? icons.wrap : icons.scroll;
      this.updateDisplayModeClass();
      createCustomTooltip(toggleButton, newMode === 'wrap'
        ? 'Переключить режим отображения в вертикальный вид'
        : 'Переключить режим отображения в горизонтальный вид');
      if (newMode === 'scroll') {
        const c = document.getElementById('latest-games-container');
        if (c) setTimeout(() => c.scrollTop = c.scrollHeight, 0);
      }
    });
    return toggleButton;
  }

  updateDisplayModeClass() {
    const container = document.getElementById('latest-games-container');
    const gamesList = document.getElementById('latest-games');
    if (!container || !gamesList) return;
    const mode = this.getDisplayMode();
    container.classList.toggle('display-mode-wrap', mode === 'wrap');
    gamesList.classList.toggle('display-mode-wrap', mode === 'wrap');
    this.updateContainerLeftOffset();
  }

  updateContainerLeftOffset() {
    const container = document.getElementById('latest-games-container');
    if (!container) return;
    const mode = this.getDisplayMode();
    if (mode === 'wrap') {
      container.style.left = 'calc(-1 * (100vw - 100px))';
    } else {
      container.style.left = '-330px';
    }
  }
}
