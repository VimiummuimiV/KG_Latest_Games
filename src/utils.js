function generateRandomString() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => (b % 36).toString(36))
    .join('');
}

export function generateUniqueId(groups) {
  const allIds = new Set([
    ...groups.map(g => g.id),
    ...groups.flatMap(g => g.games.map(game => game.id))
  ]);
  let id;
  do {
    id = generateRandomString();
  } while (allIds.has(id));
  return id;
}

export function sleep(ms) {
  let timeoutId;
  const promise = new Promise(resolve => {
    timeoutId = setTimeout(resolve, ms);
  });

  promise.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return promise;
}

// Function to determine the current page based on URL pathname
export function getCurrentPage() {
  const pathname = window.location.pathname;
  if (pathname === '/') return 'main';
  if (pathname === '/gamelist/') return 'gamelist';
  if (pathname === '/u/') return 'profile';
  if (pathname.startsWith('/chatlogs/')) return 'chatlogs';
  if (pathname.startsWith('/top/')) return 'rating';
  if (pathname.startsWith('/vocs/')) return 'vocabularies';
  if (pathname === '/about/') return 'about';
  if (pathname === '/fuel/') return 'donation';
  if (pathname.startsWith('/forum/')) return 'forum';
  if (pathname === '/g/') return 'game';
  return 'unknown';
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.id) {
    element.id = options.id;
  }
  if (options.innerHTML) {
    element.innerHTML = options.innerHTML;
  }
  if (options.textContent) {
    element.textContent = options.textContent;
  }
  if (options.href) {
    element.href = options.href;
  }
  if (options.title) {
    element.title = options.title;
  }
  if (options.src) {
    element.src = options.src;
  }
  if (options.style) {
    Object.assign(element.style, options.style);
  }
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }
  return element;
}

/**
 * Get the appropriate container selector based on current page
 * @returns {string|null} CSS selector for the container
 */
export function getContainerSelector() {
  const page = getCurrentPage();
  if (page === 'vocabularies') return '.columns.voclist';
  if (page === 'profile') return '.profile-root, .dlg-profile-vocs .vocs';
  if (page === 'forum') return '#posts-list .list';
  return null;
}

/**
 * Extract vocabulary ID from an anchor’s href only if there’s nothing after the id.
 * For links containing "/create/", we check for a query parameter "voc".
 * For other links, we only accept a URL whose pathname exactly matches "/vocs/{id}/"
 * with no additional segments.
 * @param {HTMLElement} anchor - The anchor element.
 * @returns {string|null} The extracted vocabulary ID, or null if invalid.
 */
export function extractVocabularyId(anchor) {
  const href = anchor.getAttribute('href');
  if (/\/create\//.test(href)) {
    const createMatch = href.match(/[?&]voc=(\d+)/);
    return createMatch ? createMatch[1] : null;
  } else {
    try {
      const url = new URL(href, window.location.origin);
      const pathname = url.pathname;
      const strictMatch = pathname.match(/^\/vocs\/(\d+)\/?$/);
      return strictMatch ? strictMatch[1] : null;
    } catch (error) {
      return null;
    }
  }
}