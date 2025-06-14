// Font configuration - easy to add new fonts here
const FONTS = {
  montserrat: {
    id: 'kg-latest-games-montserrat-font',
    url: 'https://fonts.googleapis.com/css2?family=Montserrat&display=swap'
  },
  notoColorEmoji: {
    id: 'kg-latest-games-noto-emoji-font',
    url: 'https://fonts.googleapis.com/css2?family=Montserrat&family=Noto+Color+Emoji&display=swap'
  }
};

export function setupFonts() {
  Object.values(FONTS).forEach(font => {
    if (!document.getElementById(font.id)) {
      const link = document.createElement('link');
      link.id = font.id;
      link.rel = 'stylesheet';
      link.href = font.url;
      document.head.appendChild(link);
    }
  });
}