export function setupFonts() {
  if (!document.getElementById('kg-latest-games-montserrat-font')) {
    const link = document.createElement('link');
    link.id = 'kg-latest-games-montserrat-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat&display=swap';
    document.head.appendChild(link);
  }
}
