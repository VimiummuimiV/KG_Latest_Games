export const popupIcons = {
  day: '☀️',
  week: '📅',
  general: '📋',
  history: '📜',
  comments: '💬',
  stats: '⚡'
};

export const gameTypes = {
  normal: 'Oбычный',
  abra: 'Абракадабра',
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

// Map Russian vocabularies type names to English constants
export const typeMapping = {
  'Слова': 'words',
  'Фразы': 'phrases',
  'Тексты': 'texts',
  'Книга': 'books',
  'Генератор': 'generator'
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

export const idleTimes = [0, 5, 10, 15, 20, 30, 45, 60, 120, 180, 300];

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
  randomVocabulariesType: {
    words: true,
    phrases: true,
    texts: true,
    books: true,
    generator: true
  },
  showSearchBox: false,
  randomLocalExcludePlayed: true,
  randomLocalByActiveGroup: false,
  showButtonDescriptions: true,
  showHelpTooltips: true,
  qualificationEnabled: false,
  saveModeEnabled: true,
  showVocabularyData: true,
  rankRange: [1, 9],
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
    main: false,
    gamelist: false,
    profile: false,
    chatlogs: false,
    rating: false,
    vocabularies: false,
    about: false,
    donation: false,
    forum: false,
    game: false 
  }
};