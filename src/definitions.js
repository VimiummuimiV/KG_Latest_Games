export const popupIcons = {
  day: '☀️',
  week: '📅',
  general: '📋',
  history: '📜',
  comments: '💬'
};

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
  panelWidth: '70vw',
  panelHeight: '40vh',
  panelWidths: {},
  panelHeights: {},
  hoverTimeout: null,
  isHovered: false,
  enableDragging: true,
  wasDragging: false,
  shouldAutoSave: true,
  hidePanelDelay: 1000,
  shouldStart: false,
  startDelay: 1000,
  shouldReplay: false,
  replayDelay: 1000,
  replayNextGame: false,
  shouldReplayMore: false,
  replayNextGameCount: 1,
  remainingReplayCount: null,
  replayWithoutWaiting: false,
  // randomGameId: false | 'local' | 'global' - mode for random selection
  randomGameId: false,
  showSearchBox: false,
  showButtonDescriptions: true,
  showHelpTooltips: true,
  panelYPosition: {
    main: 0,
    gamelist: 0,
    profile: 0,
    chatlogs: 0,
    rating: 0,
    vocabularies: 0,
    about: 0,
    donation: 0,
    forum: 0,
    game: 0
  },
  alwaysVisiblePanel: {
    main: true,
    gamelist: false,
    profile: false,
    chatlogs: false,
    rating: false,
    vocabularies: false,
    about: false,
    donation: false,
    forum: false,
    game: true
  }
};