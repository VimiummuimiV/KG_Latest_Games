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

// Selectors for KG game page elements, grouped by purpose.
export const gameSelectors = {
  // replayWithoutWaiting=true watches #bookinfo (appears when typing block loads, before others join).
  // replayWithoutWaiting=false watches #finished (appears only after the game is fully over).
  finish: {
    immediate: '#typeblock #bookinfo',
    normal:    '#status-inner #finished'
  },
  // For noerror games or AFK players, the "fail" state is indicated by a specific image element.
  fail: {
    noError: '.player.you img.noerror-fail'
  }
};

export const timeouts = [5, 10, 20, 30, 45, 60];

export const idleTimes = [0, 5, 10, 15, 20, 30, 45, 60, 120, 180, 300];

// Modes for displaying the player's position in the playlist relative to the total number of games.
export const POSITION_MODES = ['fraction', 'remaining_fraction', 'current', 'remaining'];

export const POSITION_MODE_LABELS = {
  fraction:           'текущий/всего',
  remaining_fraction: 'осталось/всего',
  current:            'текущий',
  remaining:          'осталось',
};

export const POSITION_MODE_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

// Tooltip shown on any stepper element that supports drag-to-scrub + double-click input.
export const STEPPER_DRAG_TIP = `
      [ЛКМ + ↑↓] изменить
      [Shift + ЛКМ + ↑↓] изменить точнее
      [Двойной клик] ввести значение
`;

// Default params for games auto-created from daily task conditions.
// Mirrors the shape parseGameParams() produces; only gametype/vocId/vocName are overridden per condition.
export const TASK_GAME_DEFAULTS = {
  gametype: 'normal', vocName: '', vocId: '', vocType: null,
  type: 'normal', level_from: 1, level_to: 9,
  timeout: 10, idletime: 0, qual: 0, premium_abra: 0,
};

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
  hoverAreaEnabled: true,
  shouldStart: false,
  startDelay: 1000,
  shouldReplay: false,
  replayDelay: 1000,
  replayNextGame: true,
  shouldReplayMore: false,
  replayNextGameCount: 1,
  remainingReplayCount: null,
  replayWithoutWaiting: true,
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
  randomLocalIncludeStandardModes: false,
  showButtonDescriptions: true,
  showHelpTooltips: true,
  qualificationEnabled: false,
  saveModeEnabled: true,
  showVocabularyData: true,
  rankRange: [1, 9],
  playlistPanelAutoOpen: 0,
  positionDisplayMode: 'fraction',
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
