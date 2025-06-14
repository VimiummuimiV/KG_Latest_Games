export const gameTypes = {
  normal: 'Oбычный',
  abra: 'Абракадабра',
  referats: 'Яндекс.Рефераты',
  noerror: 'Безошибочный',
  marathon: 'Марафон',
  chars: 'Буквы',
  digits: 'Цифры',
  sprint: 'Спринт',
  voc: 'Словарь'
};

export const gameCategories = {
  words: 'Слова',
  phrases: 'Фразы',
  texts: 'Тексты',
  book: 'Книги'
};

export const visibilities = {
  normal: 'открытый',
  practice: 'одиночный',
  private: 'дружеский'
};

export const ranks = [
  "новички", "любители", "таксисты", "профи",
  "гонщики", "маньяки", "супермены", "кибергонщики", "экстракиберы"
];

export const ranksMap = {
  'новичков': 1, 'любителей': 2, 'таксистов': 3, 'профи': 4,
  'гонщиков': 5, 'маньяков': 6, 'суперменов': 7,
  'кибергонщиков': 8, 'экстракиберов': 9
};

export const timeouts = [5, 10, 20, 30, 45, 60];

// Centralized default values for LatestGamesManager and related managers
export const DEFAULTS = {
  maxGameCount: 5,
  currentTheme: 'light',
  displayMode: 'scroll',
  previousScrollPosition: 0,
  panelWidth: '95vw',
  hoverTimeout: null,
  isHovered: false,
  enableDragging: true,
  wasDragging: false,
  shouldAutoSave: true,
  alwaysVisiblePanel: false,
  panelYPosition: 0,
  hidePanelDelay: 1000,

  // Game start and replay settings
  shouldStart: false,
  startDelay: 1000,
  shouldReplay: false,
  replayDelay: 1000
};