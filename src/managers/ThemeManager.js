import { icons } from '../icons.js';
import { createCustomTooltip } from '../tooltip.js';
import { createElement } from '../utils.js';

export class ThemeManager {
  constructor(main) {
    this.main = main;
  }

  applyTheme() {
    document.documentElement.classList.remove('latest-games-light-theme', 'latest-games-dark-theme');
    document.documentElement.classList.add(
      this.main.currentTheme === 'light' ? 'latest-games-light-theme' : 'latest-games-dark-theme'
    );
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const toggleThemeButton = document.querySelector('#latest-games-container .theme-toggle');
    if (toggleThemeButton) {
      toggleThemeButton.innerHTML = this.main.currentTheme === 'light' ? icons.sun : icons.moon;
    }
  }

  toggleTheme(button) {
    this.main.currentTheme = this.main.currentTheme === 'light' ? 'dark' : 'light';
    createCustomTooltip(button, `Изменить тему на ${this.main.currentTheme === 'light' ? 'тёмную' : 'светлую'}`);
    this.main.settingsManager.saveSettings();
    this.applyTheme();
  }

  createThemeToggle() {
    const toggleThemeButton = createElement('div', {
      className: 'theme-toggle control-button'
    });
    toggleThemeButton.innerHTML = this.main.currentTheme === 'light' ? icons.sun : icons.moon;
    toggleThemeButton.addEventListener('click', () => this.toggleTheme(toggleThemeButton));
    createCustomTooltip(toggleThemeButton, `Изменить тему на ${this.main.currentTheme === 'light' ? 'тёмную' : 'светлую'}`);
    return toggleThemeButton;
  }
}
