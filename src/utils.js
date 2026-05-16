import { gameTypes, POSITION_MODES, POSITION_MODE_LABELS, POSITION_MODE_EMOJI } from "./definitions.js";

export function generateRandomString() {
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
  let startTime = Date.now();
  let remainingMs = ms;
  let isPaused = false;
  let resolveFn;

  const promise = new Promise(resolve => {
    resolveFn = resolve;
    timeoutId = setTimeout(resolve, ms);
  });

  promise.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  promise.pause = () => {
    if (isPaused || !timeoutId) return;
    isPaused = true;
    clearTimeout(timeoutId);
    timeoutId = null;
    // Snapshot how much time is left
    remainingMs = Math.max(0, remainingMs - (Date.now() - startTime));
  };

  promise.resume = () => {
    if (!isPaused) return;
    isPaused = false;
    startTime = Date.now();
    timeoutId = setTimeout(resolveFn, remainingMs);
  };

  // Expose remaining ms for the visual timer to read
  promise.getRemainingMs = () => {
    if (isPaused) return remainingMs;
    return Math.max(0, remainingMs - (Date.now() - startTime));
  };

  return promise;
}

// Function to determine the current page based on URL pathname
export function getCurrentPage() {
  const pathname = window.location.pathname;
  if (pathname === '/') return 'main';
  if (pathname === '/gamelist/') return 'gamelist';
  if (pathname === '/create/') return 'create';
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
  if (options.textContent !== undefined && options.textContent !== null) {
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
  if (page === 'gamelist') return '#gamelist';
  if (page === 'game') return '#gamedesc';
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

/**
 * Detects the type of game from the #gamedesc element.
 * Returns an object with category ('competition', 'qualification', 'vocabulary', 'default')
 * and subtype (from gameTypes map, e.g., 'Oбычный' or 'Словарь').
 * @returns {Object} { category: string, subtype: string }
 */
export function detectGameType() {
  const gamedesc = document.querySelector('#gamedesc');
  if (!gamedesc) return { category: 'default', subtype: 'Unknown' };

  const text = gamedesc.textContent.toLowerCase();
  const span = gamedesc.querySelector('span');
  if (!span) return { category: 'default', subtype: 'Unknown' };

  const classMatch = span.className.match(/gametype-(\w+)/);
  const gametypeKey = classMatch ? classMatch[1] : null;
  const subtype = gametypeKey ? gameTypes[gametypeKey] || 'Unknown' : 'Unknown';

  // Check for competition
  if (text.includes('соревнование')) {
    return { category: 'competition', subtype };
  }

  // Check for qualification
  if (text.includes('квалификация')) {
    return { category: 'qualification', subtype };
  }

  // Check for vocabulary (gametype-voc + vocs link)
  if (gametypeKey === 'voc') {
    const vocLink = gamedesc.querySelector('a[href*="/vocs/"]');
    if (vocLink) {
      return { category: 'vocabulary', subtype };
    }
  }

  // Default for other gametypes (abra, chars, etc.)
  return { category: 'default', subtype };
}

/**
 * Returns true when a fetched vocabulary page signals the vocabulary no longer exists.
 * The server returns HTTP 200 with "Словарь не найден." in the page body, or HTTP 403.
 * Centralised here so vocabularyCreation.js, vocabularyContent.js and any future
 * consumer can share the same detection without duplicating it.
 *
 * @param {Response} response - The fetch Response object (before reading body).
 * @param {string} html - The already-read response body text.
 * @returns {boolean}
 */
export function isVocabularyRemoved(response, html) {
  if (response.status === 403) return true;
  return html.includes('Словарь не найден');
}

// ─────────────────────────────────────────────────────────────────────────────
// Playlist position display mode helpers
// Shared by playlistsManager.js and GamesDataContainer.js
// ─────────────────────────────────────────────────────────────────────────────
export function formatPosition(current, total, mode) {
  if (mode === 'current')            return `${current}`;
  if (mode === 'remaining')          return `${total - current + 1}`;
  if (mode === 'remaining_fraction') return `${total - current + 1}/${total}`;
  return `${current}/${total}`;
}

// Returns a one-line hint showing the current position display mode.
// interaction — the modifier shown in brackets, e.g. 'Ctrl + Клик' or 'Клик'.
export function positionTooltip(mode, interaction = 'Клик') {
  const currentIndex = POSITION_MODES.indexOf(mode);
  const emoji        = POSITION_MODE_EMOJI[currentIndex] ?? `${currentIndex + 1}.`;
  const label        = POSITION_MODE_LABELS[mode];
  return `[${interaction}] ${emoji} ${label}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable stepper / button-hold interaction helpers
// Used by playlistsManager.js (via PlaylistsManager methods) and controls.js.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach long-press auto-repeat to a button.
 * A single click still fires stepFn once (via the click event).
 * Holding LMB fires stepFn after HOLD_DELAY ms, then every HOLD_INTERVAL ms.
 * The click that fires on release after a hold is suppressed.
 * @param {HTMLElement} btn
 * @param {Function} stepFn        — called on click / hold
 * @param {Function} [ctrlStepFn] — called instead when Ctrl is held
 */
export function _attachButtonHold(btn, stepFn, ctrlStepFn) {
  const HOLD_DELAY    = 400;
  const HOLD_INTERVAL = 120;
  let holdTimer = null;
  let interval  = null;
  let holdFired = false;
  let activeFn  = null;

  const stop = () => {
    clearTimeout(holdTimer);
    clearInterval(interval);
    holdTimer = null;
    interval  = null;
    activeFn  = null;
  };

  btn.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    activeFn  = (ctrlStepFn && e.ctrlKey) ? ctrlStepFn : stepFn;
    holdFired = false;
    holdTimer = setTimeout(() => {
      holdFired = true;
      activeFn();
      interval = setInterval(() => activeFn(), HOLD_INTERVAL);
    }, HOLD_DELAY);
  });
  btn.addEventListener('mouseup',    stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (holdFired) { holdFired = false; return; }
    ((ctrlStepFn && e.ctrlKey) ? ctrlStepFn : stepFn)();
  });
}

/**
 * Drag-to-scrub on a stepper span: hold LMB and drag up/down to inc/dec.
 * One step fires every PX_PER_STEP pixels. Shift for fine control (4× slower).
 * @param {HTMLElement} span
 * @param {Function} decFn
 * @param {Function} incFn
 */
export function _attachStepperDrag(span, decFn, incFn) {
  const PX_PER_STEP      = 8;
  const PX_PER_STEP_SLOW = 32;
  let startY = 0;
  let accum  = 0;

  const onMove = e => {
    const step = e.shiftKey ? PX_PER_STEP_SLOW : PX_PER_STEP;
    accum += startY - e.clientY;
    startY = e.clientY;
    while (accum >=  step) { incFn(); accum -= step; }
    while (accum <= -step) { decFn(); accum += step; }
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.body.style.removeProperty('cursor');
    document.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });
  };

  span.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    startY = e.clientY;
    accum  = 0;
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

/**
 * Double-click on a stepper span to enter a value directly via an inline input.
 * Enter/blur commits (clamped to [min, max]); Escape or double-click discards.
 * @param {HTMLElement} span
 * @param {{ getValue: () => number, setValue: (v: number) => void, min?: number, max?: number, inputClass?: string, editingClass?: string }} opts
 */
export function _attachCountDblClick(span, { getValue, setValue, min = 1, max = Infinity, inputClass = 'stepper-inline-input', editingClass = 'stepper-count--editing' }) {
  span.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (span.querySelector(`.${inputClass}`)) return;

    const input = document.createElement('input');
    input.type      = 'text';
    input.inputMode = 'numeric';
    input.className = inputClass;
    input.value     = String(getValue());

    input.addEventListener('keypress', e => {
      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
    });

    const savedText = span.textContent;
    span.textContent = '';
    span.classList.add(editingClass);
    span.appendChild(input);

    requestAnimationFrame(() => { input.focus(); input.select(); });

    let done = false;
    const close = (commit) => {
      if (done) return;
      done = true;
      input.remove();
      span.classList.remove(editingClass);
      if (commit) {
        const v = parseInt(input.value, 10);
        if (!isNaN(v)) setValue(Math.max(min, max < Infinity ? Math.min(max, v) : v));
        else span.textContent = savedText;
      } else {
        span.textContent = savedText;
      }
    };

    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter')  { e.preventDefault(); close(true);  }
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    });
    input.addEventListener('dblclick', e => { e.stopPropagation(); close(false); });
    input.addEventListener('blur',     () => close(true));
    input.addEventListener('click',     e => e.stopPropagation());
    input.addEventListener('mousedown', e => e.stopPropagation());
  });
}