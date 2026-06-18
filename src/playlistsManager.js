import { createCustomTooltip, updateTooltipContent, hideTooltipElement } from './tooltip.js';
import { icons } from './icons.js';
import { gameTypes, gameCategories, typeMapping, visibilities, timeouts, idleTimes, POSITION_MODES, TASK_GAME_DEFAULTS, STEPPER_DRAG_TIP } from './definitions.js';
import { generateRandomString, generateUniqueId, getCurrentPage, formatPosition, positionTooltip, _attachButtonHold, _attachStepperDrag, _attachCountDblClick, attachInputClearButton } from './utils.js';
import { fetchVocabularyData, showTooltip, startHideTimeout } from './vocabularyContent.js';
import { fetchVocabularyBasicData } from './vocabularyCreation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Storage / session keys
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'latestGamesPlaylists';
const SESSION_KEY    = 'latestGames_activePlaylist';
const SHUFFLE_KEY    = 'latestGames_randomShuffleBag';
const DTASK_PREF_KEY = 'latestGames_dtaskTypePrefs';

function _getDtaskTypePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(DTASK_PREF_KEY) || '{}');
    return { favorites: new Set(raw.favorites || []), blocked: new Set(raw.blocked || []) };
  } catch { return { favorites: new Set(), blocked: new Set() }; }
}
function _saveDtaskTypePrefs(prefs) {
  try { localStorage.setItem(DTASK_PREF_KEY, JSON.stringify({ favorites: [...prefs.favorites], blocked: [...prefs.blocked] })); } catch {}
}

function _getPositionMode() {
  return PlaylistsManager.main?.positionDisplayMode ?? 'fraction';
}
function _cyclePositionMode() {
  const next = POSITION_MODES[(POSITION_MODES.indexOf(_getPositionMode()) + 1) % POSITION_MODES.length];
  if (PlaylistsManager.main) {
    PlaylistsManager.main.positionDisplayMode = next;
    PlaylistsManager.main.settingsManager?.saveSettings();
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────────────────────────────
export function getActivePlaylistSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setActivePlaylistSession(data) {
  try {
    if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    else localStorage.removeItem(SESSION_KEY);
  } catch { }
}

// Auto-pause: if a non-paused playlist session exists and we are not on the
// game page, the user navigated away manually — mark it paused immediately.
// Runs once at module load; is a no-op on all subsequent pages because the
// session will already be paused.
{
  const session = getActivePlaylistSession();
  if (session && !session.paused && getCurrentPage() !== 'game') {
    setActivePlaylistSession({ ...session, paused: true });
  }
}

/** Cancel the active playlist. */
export function cancelActivePlaylist() {
  const session = getActivePlaylistSession();
  if (!session) return;
  setActivePlaylistSession(null);
}

// Returns the URL for the current active playlist entry, or null if none.
export function getActivePlaylistUrl(main) {
  const session = getActivePlaylistSession();
  if (!session) return null;
  try {
    const playlist = PlaylistsManager.load().find(p => p.id === session.playlistId);
    const entry = _getPlaylistEntry(playlist, session);
    const game = entry && main.gamesManager.findGameById(entry.gameId);
    return game ? _generatePlaylistEntryLink(main, game, entry) : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advance to the next step and navigate. Returns true if navigation triggered.
// ─────────────────────────────────────────────────────────────────────────────
// advancePlaylist computes the next destination and returns one of:
//   { url: string }  — ready to navigate (caller applies replayDelay)
//   'paused'         — playlist is paused, caller must do nothing (no decrement, no replay)
//   false            — no active playlist, playlist finished, or game not found
export function advancePlaylist(main) {
  const session = getActivePlaylistSession();
  if (!session) return false;

  // Paused: the game was not finished intentionally — do not decrement, do not navigate
  if (session.paused) return 'paused';

  const playlists = PlaylistsManager.load();
  const playlist  = playlists.find(p => p.id === session.playlistId);
  if (!playlist || !playlist.entries.length) {
    _finishPlaylist(main, playlist);
    return false;
  }

  // If shuffle is active, entryIndex is an index into the shuffleOrder, not directly into entries[].
  const order = Array.isArray(session.shuffleOrder) && session.shuffleOrder.length === playlist.entries.length
    ? session.shuffleOrder
    : null;
  const cycleLength = order ? order.length : playlist.entries.length;

  let { entryIndex, remainingRepeats } = session;
  remainingRepeats--;

  if (remainingRepeats > 0) {
    setActivePlaylistSession({ ...session, remainingRepeats });
  } else {
    entryIndex++;
    if (entryIndex >= cycleLength) {
      // End of entries in this cycle — check if playlist-level cycles remain
      const remainingCycles = (session.remainingCycles ?? 1) - 1;
      if (remainingCycles > 0) {
        const nextOrder = order ? _createShuffleOrder(playlist.entries.length) : null;
        const firstIndex = nextOrder ? nextOrder[0] : 0;
        const firstEntry = playlist.entries[firstIndex];
        setActivePlaylistSession({
          ...session,
          entryIndex: 0,
          remainingRepeats: firstEntry.repeatCount,
          remainingCycles,
          shuffleOrder: nextOrder,
        });
      } else {
        _finishPlaylist(main, playlist);
        return false;
      }
    } else {
      const nextEntryIndex = order ? order[entryIndex] : entryIndex;
      const nextEntry = playlist.entries[nextEntryIndex];
      setActivePlaylistSession({ ...session, entryIndex, remainingRepeats: nextEntry.repeatCount });
    }
  }

  const updated = getActivePlaylistSession();
  const entry   = _getPlaylistEntry(playlist, updated);
  const game    = entry && main.gamesManager.findGameById(entry.gameId);
  // Skip deleted/missing games by recursing
  if (!game) return advancePlaylist(main);

  return { url: _generatePlaylistEntryLink(main, game, entry) };
}

function _finishPlaylist(main, playlist) {
  cancelActivePlaylist();
  // Immediately remove the HUD indicator and refresh the panel so the UI
  // reflects the cleared session before the completion alert fires.
  try { main?.pageHandler?.gamesDataContainer?.updatePlaylistIndicator(); } catch (_) {}
  try { PlaylistsManager.refresh(); } catch (_) {}
  const name = playlist?.title || 'Плейлист';
  setTimeout(() => alert(`✅ Плейлист «${name}» завершён!`), 300);
}

// Fisher-Yates shuffle implementation to randomize playlist order for shuffle mode and random playlist picking.
function _shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function _createShuffleOrder(length) {
  return _shuffleArray([...Array(length).keys()]);
}

function _getPlaylistEntry(playlist, session) {
  if (!playlist || !session) return null;
  return playlist.entries[_getActiveEntryIndex(playlist, session)] ?? null;
}

// Returns the real entries[] index for the current session position,
// accounting for shuffle order when active.
function _getActiveEntryIndex(playlist, session) {
  if (!playlist || !session) return 0;
  const order = Array.isArray(session.shuffleOrder) && session.shuffleOrder.length === playlist.entries.length
    ? session.shuffleOrder : null;
  const position = session.entryIndex ?? 0;
  return order ? (order[position] ?? 0) : position;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-entry param override helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true when the entry has at least one param override set. */
function _hasEntryParamOverrides(params) {
  return !!(params && ('type' in params || 'timeout' in params || 'idletime' in params));
}

// Cache for vocabulary basic data to avoid redundant fetches during daily task games review before playlist creation.
const _vocBasicDataCache = new Map();

function _fetchVocBasicData(vocId) {
  const key = String(vocId);
  if (!_vocBasicDataCache.has(key)) {
    _vocBasicDataCache.set(key, fetchVocabularyBasicData(key).catch(() => null));
  }
  return _vocBasicDataCache.get(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary preview on Shift+hover via delegation
// ─────────────────────────────────────────────────────────────────────────────
function _attachVocabularyPreview(container, selector) {
  if (!container || !selector) return;
  
  const tooltipCache = new Map();
  
  container.addEventListener('mouseover', async (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (!target || !container.contains(target) || !e.shiftKey) return;
    
    const vocId = target.closest('[data-voc-id]')?.dataset.vocId;
    if (!vocId) return;

    e.preventDefault();
    e.stopPropagation();
    hideTooltipElement();

    try {
      if (!tooltipCache.has(vocId)) {
        const content = await fetchVocabularyData(vocId);
        tooltipCache.set(vocId, content);
      }
      showTooltip(target, tooltipCache.get(vocId));
    } catch (err) {
      console.error('Error loading vocabulary:', err);
    }
  });
  
  container.addEventListener('mouseout', (e) => {
    const left = e.target instanceof Element ? e.target.closest(selector) : null;
    const entered = e.relatedTarget instanceof Element ? e.relatedTarget.closest(selector) : null;
    if (left && left !== entered) {
      startHideTimeout();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Button tooltip registry
// Top-level key: button name. Second-level key: state (or 'default' if only one).
// Each state maps modifier keys → action strings.
// Supported modifiers: click, ctrl, shift, alt, ctrlShift, shiftAlt
// buildBtnTooltip(button, state?) assembles them into [Modifier + Клик] format.
// ─────────────────────────────────────────────────────────────────────────────
const BTN_TOOLTIPS = {
  paramsBtn: {
    default: {
      click: 'Переопределить параметры (режим, TM, AFK)',
    },
    override: {
      click: 'Изменить переопределённые параметры',
      ctrl:  'Сбросить все переопределения',
    },
  },
  createTaskBtn: {
    default: {
      clickLabel: 'Клик / T',
      click: 'Выбрать игры перед созданием плейлиста',
      ctrl:  'Создать плейлист из задачи дня',
    },
  },
};

function buildBtnTooltip(button, state = 'default') {
  const t = BTN_TOOLTIPS[button]?.[state];
  if (!t) return '';
  const lines = [];
  if (t.click)     lines.push(`[${t.clickLabel ?? 'Клик'}] ${t.click}`);
  if (t.shift)     lines.push(`[Shift + Клик] ${t.shift}`);
  if (t.ctrl)      lines.push(`[Ctrl + Клик] ${t.ctrl}`);
  if (t.alt)       lines.push(`[Alt + Клик] ${t.alt}`);
  if (t.shiftAlt)  lines.push(`[Shift + Alt + Клик] ${t.shiftAlt}`);
  if (t.ctrlShift) lines.push(`[Ctrl + Shift + Клик] ${t.ctrlShift}`);
  return lines.join(' ');
}

/** Sync has-overrides class + tooltip on the params button from current entry.params. */
function _syncParamsBtnState(paramsBtn, params) {
  const hasOv = _hasEntryParamOverrides(params);
  paramsBtn.classList.toggle('has-overrides', hasOv);
  updateTooltipContent(paramsBtn, buildBtnTooltip('paramsBtn', hasOv ? 'override' : 'default'));
}

/** Rebuild the entry label tooltip to reflect current ep overrides vs game defaults. */
function _refreshEntryLabelTooltip(label, game, ep, sessionInfo = null, customLabel = null) {
  const visLabel = visibilities[ep.type ?? game.params.type] || (ep.type ?? game.params.type);
  const tmVal    = ep.timeout  ?? game.params.timeout;
  const afkVal   = ep.idletime ?? game.params.idletime;
  const gtype    = gameTypes[game.params.gametype] || game.params.gametype;
  const gameName = game.params.vocName ? `«${game.params.vocName}»` : gtype;
  let tip = '';
  if (customLabel) tip += `[Название] ${customLabel}[Игра] ${gameName}`;
  if (_hasEntryParamOverrides(ep)) tip += `[Параметры] переопределены`;
  tip += `[Режим] ${visLabel}[TM] ${tmVal}`;
  if (afkVal) tip += `[AFK] ${afkVal}`;
  if (sessionInfo) tip += `[Пройдено] ${sessionInfo.played} из ${sessionInfo.total}`;
  updateTooltipContent(label, tip);
}

/**
 * Generate a game link for a playlist entry, merging any entry-level param
 * overrides (type / timeout / idletime) on top of the saved game params.
 */
function _generatePlaylistEntryLink(main, game, entry) {
  const ep = entry?.params;
  const mergedParams = {
    ...game.params,
    ...(_hasEntryParamOverrides(ep) ? {
      ...('type'     in ep ? { type:     ep.type     } : {}),
      ...('timeout'  in ep ? { timeout:  ep.timeout  } : {}),
      ...('idletime' in ep ? { idletime: ep.idletime } : {})
    } : {})
  };
  // Safety: открытый (normal) cannot have timeout 5 — clamp to 10
  if (mergedParams.type === 'normal' && mergedParams.timeout === 5) mergedParams.timeout = 10;
  // If there are no overrides, generate a normal link without the redundant params in the URL.
  if (!_hasEntryParamOverrides(ep)) return main.gamesManager.generateGameLink(game);
  // Otherwise, generate a link with the merged params so that the playlist entry plays with the intended settings
  // even if the original game params have changed since the entry was added to the playlist.
  return main.gamesManager.generateGameLink({ ...game, params: mergedParams });
}

/**
 * Shared param group builder used by both _buildParamsSection and _buildBulkParamsSection.
 * Appends Вид / TM / AFK groups into `section`, wires buttons to mutate `ep` and call
 * `onPersist()`. Returns `syncConstraints` so the caller can run it once after build.
 */
function _buildParamsGroups(section, ep, onPersist) {
  function syncConstraints() {
    // If the type is normal, disable the TM 5 button; if TM is currently 5, switch it to 10.
    const isNormal = ep.type === 'normal';
    section.querySelectorAll('.playlist-entry-params-option[data-group="timeout"]').forEach(btn => {
      const blocked = isNormal && Number(btn.dataset.val) === 5;
      btn.disabled = blocked;
      btn.classList.toggle('playlist-entry-params-option--disabled', blocked);
    });
    if (isNormal && ep.timeout === 5) {
      ep.timeout = 10;
      section.querySelectorAll('.playlist-entry-params-option[data-group="timeout"]').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.val) === ep.timeout);
      });
      onPersist();
    }
  }

  function makeGroup(labelText, groupKey, options, getCurrentVal, setVal) {
    const group = _el('div', 'playlist-entry-params-group');
    group.append(_el('span', 'playlist-entry-params-label', labelText));

    options.forEach(([val, text]) => {
      const btn = _el('button', 'playlist-entry-params-option');
      btn.textContent = text;
      btn.dataset.val   = val;
      btn.dataset.group = groupKey;
      if (getCurrentVal() === val) btn.classList.add('active');

      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.disabled) return;
        const wasActive = getCurrentVal() === val;
        setVal(wasActive ? null : val);
        group.querySelectorAll('.playlist-entry-params-option').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
        onPersist();
        syncConstraints();
      });

      group.append(btn);
    });
    return group;
  }

  section.append(
    makeGroup(
      'Вид', 'type',
      Object.entries(visibilities),
      () => ep.type ?? null,
      val => { if (val == null) delete ep.type;     else ep.type     = val; }
    ),
    makeGroup(
      'TM', 'timeout',
      timeouts.map(t => [t, t]),
      () => ep.timeout ?? null,
      val => { if (val == null) delete ep.timeout;  else ep.timeout  = val; }
    ),
    makeGroup(
      'AFK', 'idletime',
      idleTimes.map(t => [t, t]),
      () => ep.idletime ?? null,
      val => { if (val == null) delete ep.idletime; else ep.idletime = val; }
    )
  );

  return syncConstraints;
}

/**
 * Build the collapsible per-entry params section.
 */
function _buildParamsSection(playlist, entry, paramsBtn) {
  if (!entry.params) entry.params = {};
  const ep = entry.params;
  const section = _el('div', 'playlist-entry-params');

  function onPersist() {
    PlaylistsManager.setEntryParams(playlist.id, entry.id, ep);
    _syncParamsBtnState(paramsBtn, ep);
    const row = paramsBtn.closest('.playlist-entry-row');
    if (row) {
      const label = row.querySelector('.playlist-entry-label');
      const game  = PlaylistsManager.main?.gamesManager?.findGameById(entry.gameId);
      if (label && game) _refreshEntryLabelTooltip(label, game, ep);
    }
  }

  const syncConstraints = _buildParamsGroups(section, ep, onPersist);
  syncConstraints();
  return section;
}


// ─────────────────────────────────────────────────────────────────────────────
// Shared autoscroll helpers — used by both drag-to-reorder and drag-to-select.
// ─────────────────────────────────────────────────────────────────────────────

// Walk up from `el` to find the nearest scrollable ancestor.
function _findScrollParent(el) {
  let node = el.parentElement;
  while (node) {
    const ov = getComputedStyle(node).overflowY;
    if (ov === 'auto' || ov === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

// Start (or restart) an edge-triggered autoscroll rAF loop.
// rafRef   — single-element array [rafId] used as a mutable cancel handle
// scrollEl — the element whose scrollTop is mutated
// clientY  — current cursor Y in viewport coords
// onTick   — optional callback fired after every scroll step (e.g. to re-hit-test rows)
const _AUTOSCROLL_ZONE  = 48; // px from edge where scrolling begins
const _AUTOSCROLL_SPEED =  8; // px per frame

function _startAutoscroll(rafRef, scrollEl, clientY, onTick) {
  cancelAnimationFrame(rafRef[0]);
  if (!scrollEl) return;
  const r   = scrollEl.getBoundingClientRect();
  const dir = clientY < r.top + _AUTOSCROLL_ZONE ? -1
            : clientY > r.bottom - _AUTOSCROLL_ZONE ? 1
            : 0;
  if (!dir) return;
  const tick = () => {
    scrollEl.scrollTop += dir * _AUTOSCROLL_SPEED;
    if (onTick) onTick();
    rafRef[0] = requestAnimationFrame(tick);
  };
  rafRef[0] = requestAnimationFrame(tick);
}

// One-shot scroll to make `entryEl` visible in its nearest scrollable ancestor.
// Reuses _findScrollParent; _startAutoscroll is not reused — it drives a
// continuous rAF loop for edge-triggered drag scrolling, wrong primitive here.
function _scrollToEntry(entryEl) {
  if (!entryEl) return;
  const scrollEl = _findScrollParent(entryEl);
  if (!scrollEl) return;
  const pRect = scrollEl.getBoundingClientRect();
  const eRect = entryEl.getBoundingClientRect();
  // Center the element in the scroll parent instead of edge-aligning,
  // so group headers above the first item in a group don't obscure it.
  const elCenter     = eRect.top  + eRect.height  / 2;
  const parentCenter = pRect.top  + pRect.height  / 2;
  scrollEl.scrollBy({ top: elCenter - parentCenter, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────────────────
// PlaylistsManager singleton
// ─────────────────────────────────────────────────────────────────────────────

// Returns the best available display name for a playlist entry.
// Prefers the custom label set by the user, then the game's vocabulary name,
// then the game title, falling back to '?' if nothing is resolvable.
function _entryDisplayName(entry, main) {
  const game = main?.gamesManager?.findGameById(entry?.gameId);
  return entry?.label || game?.params?.vocName || game?.title || '?';
}

export const PlaylistsManager = {
  popup: null,
  isDragging: false,
  offsetX: 0,
  offsetY: 0,
  main: null,
  expandedPlaylistId: null,
  _intendedX: null,
  _intendedY: null,
  // Multi-select: maps playlistId → Set<entryId>. Survives refresh().
  _selectedEntries: {},
  // Which playlists currently have multi-select mode active (Set<playlistId>).
  _selectionMode: new Set(),
  // Undo stack — each entry is the raw JSON string saved before a destructive op.
  _undoStack: [],
  _redoStack: [],
  _UNDO_LIMIT: 20,

  // ── Persistence ────────────────────────────────────────────────────────────

  // Load → find playlist by id → call fn(playlist, allPlaylists) → save → return fn's result.
  // Returns undefined (and skips save) when the playlist is not found.
  // Use for any mutation that targets a single playlist identified by playlistId.
  _updatePlaylist(playlistId, fn) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return undefined;
    const result = fn(p, playlists);
    this.save(playlists);
    return result;
  },

  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  },

  save(playlists) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists)); }
    catch { }
  },

  // Snapshot the current playlists state before a destructive operation.
  // Any new destructive action discards the redo stack.
  _pushUndo(label) {
    this._undoStack.push({ snapshot: localStorage.getItem(STORAGE_KEY) ?? '[]', label });
    if (this._undoStack.length > this._UNDO_LIMIT) this._undoStack.shift();
    this._redoStack = [];
    this._syncUndoBtn();
  },

  // Pops from `from`, saves current state to `to`, restores the snapshot.
  _swapState(from, to) {
    if (!from.length) return;
    const { snapshot, label } = from.pop();
    to.push({ snapshot: localStorage.getItem(STORAGE_KEY) ?? '[]', label });
    try { localStorage.setItem(STORAGE_KEY, snapshot); } catch { }
    if (this.popup) this.refresh();
  },
  _undo() { this._swapState(this._undoStack, this._redoStack); },
  _redo() { this._swapState(this._redoStack, this._undoStack); },

  // Show/hide the undo button and update its tooltip to reflect the top of the stack.
  // Called after every push and implicitly after undo/redo (refresh rebuilds the button fresh).
  _syncUndoBtn() {
    const btn = this.popup?.querySelector('.playlists-undo-btn');
    if (!btn) return;
    const stack = this._undoStack;
    btn.classList.toggle('playlists-undo-btn--hidden', !stack.length);
    if (stack.length) {
      const lines = [...stack].reverse().map((item, i) => `[${i + 1}] ${item.label}`).join('');
      const undo  = this._undoStack.length ? '[Ctrl + Z] Шаг назад' : '';
      const redo  = this._redoStack.length ? '[Ctrl + Shift + Z] Шаг вперёд' : '';
      updateTooltipContent(btn, lines + undo + redo);
    }
  },

  createPlaylist(title) {
    const playlists = this.load();
    let name = (title || '').trim();
    if (!name) {
      let n = 1;
      while (playlists.some(p => p.title === `Плейлист-${n}`)) n++;
      name = `Плейлист-${n}`;
    }
    const playlist = { id: generateRandomString(), title: name, entries: [], shuffle: false };
    playlists.push(playlist);
    this.save(playlists);
    return playlist;
  },

  exportPlaylist(id, toFile = false) {
    const playlist = this.load().find(p => p.id === id);
    if (!playlist) return;
    const json = JSON.stringify({ playlist }, null, 2);
    if (toFile) {
      const a = document.createElement('a');
      a.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
      a.download = `${playlist.title}.json`;
      a.click();
    } else {
      navigator.clipboard.writeText(json).then(
        () => alert(`✅ Плейлист «${playlist.title}» скопирован в буфер.`),
        () => alert('⚠️ Не удалось скопировать в буфер.')
      );
    }
  },

  _importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.importPlaylist(reader.result);
      reader.readAsText(file, 'utf-8');
    });
    input.click();
  },

  importPlaylist(jsonStr) {
    let data;
    try { data = JSON.parse(jsonStr); } catch { alert('⚠️ Некорректный формат JSON.'); return; }
    const p = data?.playlist;
    if (!p || typeof p.title !== 'string' || !Array.isArray(p.entries)) {
      alert('⚠️ Файл не содержит корректного плейлиста.');
      return;
    }
    this._pushUndo(`Импорт плейлиста «${p.title}»`);
    const playlists = this.load();
    const imported = {
      id: generateRandomString(),
      title: p.title,
      entries: p.entries.map(e => ({
        id: generateRandomString(),
        gameId: e.gameId,
        repeatCount: Math.max(1, e.repeatCount ?? 1),
        params: e.params ? { ...e.params } : {},
        ...(e.label        ? { label:        e.label }        : {}),
        ...(e.repeatLocked ? { repeatLocked: e.repeatLocked } : {}),
      })),
      shuffle: !!p.shuffle,
      ...(p.repeatCount ? { repeatCount: p.repeatCount } : {}),
    };
    playlists.push(imported);
    this.save(playlists);
    this.expandedPlaylistId = imported.id;
    this.refresh();
  },

  renamePlaylist(id, newTitle) {
    if (!newTitle.trim()) return;
    this._updatePlaylist(id, p => { p.title = newTitle.trim(); });
  },

  deletePlaylist(id) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === id);
    this._pushUndo(`Удаление плейлиста «${p?.title ?? id}»`);
    this.save(playlists.filter(p => p.id !== id));
    if (this.expandedPlaylistId === id) this.expandedPlaylistId = null;
  },

  duplicatePlaylist(id) {
    const playlists = this.load();
    const source = playlists.find(p => p.id === id);
    if (!source) return null;
    // Strip any existing " (копия)" or " (копия N)" suffix to get a clean base title,
    // so copying a copy doesn't keep appending "(копия) (копия) (копия)...".
    const baseTitle = source.title.replace(/ \(копия(?: \d+)?\)$/, '');
    let n = 1;
    let title;
    do { title = `${baseTitle} (копия ${n++})`; } while (playlists.some(p => p.title === title));
    const copy = {
      id: generateRandomString(),
      title,
      entries: source.entries.map(e => ({
        id: generateRandomString(),
        gameId: e.gameId,
        repeatCount: e.repeatCount,
        params: e.params ? { ...e.params } : {},
        ...(e.repeatLocked ? { repeatLocked: true } : {}),
      })),
      shuffle: source.shuffle,
      repeatCount: source.repeatCount,
    };
    playlists.push(copy);
    this.save(playlists);
    return copy;
  },

  addEntry(playlistId, gameId, repeatCount = 1) {
    this._updatePlaylist(playlistId, p => {
      p.entries.push({ id: generateRandomString(), gameId, repeatCount: Math.max(1, repeatCount), params: {} });
    });
  },

  // If the playlist was created from a daily task, redistribute the total
  // required repetitions evenly across the remaining entries so the sum of
  // repeatCounts always equals dailyTaskRemaining.
  // When there are more entries than remaining games needed, excess entries are
  // trimmed so we never inflate the total via a forced minimum of 1 per entry.
  // Call this AFTER modifying p.entries, BEFORE saving.
  // Returns the max repeatCount allowed for a locked entry in a task playlist,
  // reserving the other locked sums + 1 per unlocked entry.
  _lockedEntryCap(p, entryId) {
    const otherLockedSum = p.entries.reduce((s, x) => s + (x.repeatLocked && x.id !== entryId ? (x.repeatCount ?? 1) : 0), 0);
    const unlockedCount  = p.entries.filter(x => !x.repeatLocked).length;
    return Math.max(1, p.dailyTaskRemaining - otherLockedSum - unlockedCount);
  },

  _redistributeTaskRepeats(p) {
    const total = p.dailyTaskRemaining;
    if (!total || !p.entries.length) return;
    const lockedSum = p.entries.reduce((s, e) => s + (e.repeatLocked ? (e.repeatCount ?? 1) : 0), 0);
    const unlocked  = p.entries.filter(e => !e.repeatLocked);
    if (!unlocked.length) return;
    // Each unlocked entry gets at least 1; distribute the remainder evenly.
    const available = Math.max(0, total - lockedSum - unlocked.length);
    const base = Math.floor(available / unlocked.length);
    const rem  = available % unlocked.length;
    unlocked.forEach((e, i) => { e.repeatCount = 1 + base + (i < rem ? 1 : 0); });
  },

  removeEntry(playlistId, entryId, syncTarget = null) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    const entry = p?.entries.find(e => e.id === entryId);
    const name  = _entryDisplayName(entry, this.main);
    this._pushUndo(`Удаление «${name}» из «${p?.title ?? playlistId}»`);
    if (!p) return;
    p.entries = p.entries.filter(e => e.id !== entryId);
    this._redistributeTaskRepeats(p);
    this.save(playlists);
    if (syncTarget) {
      const idx = syncTarget.entries.findIndex(e => e.id === entryId);
      if (idx !== -1) syncTarget.entries.splice(idx, 1);
      const countMap = new Map(p.entries.map(e => [e.id, e.repeatCount]));
      syncTarget.entries.forEach(e => { e.repeatCount = countMap.get(e.id) ?? e.repeatCount; });
    }
  },

  duplicateEntry(playlistId, entryId) {
    return this._updatePlaylist(playlistId, p => {
      const source = p.entries.find(e => e.id === entryId);
      if (!source) return null;
      const copy = {
        id: generateRandomString(),
        gameId: source.gameId,
        repeatCount: source.repeatCount,
        params: source.params ? { ...source.params } : {},
        ...(source.repeatLocked ? { repeatLocked: true } : {}),
      };
      p.entries.push(copy);
      return copy;
    }) ?? null;
  },

  setRepeat(playlistId, entryId, count) {
    const session = getActivePlaylistSession();
    let oldCount, newCount, isActiveEntry;
    this._updatePlaylist(playlistId, p => {
      const e = p.entries.find(e => e.id === entryId);
      if (!e) return;
      oldCount = e.repeatCount;
      const cap = (p.dailyTaskRemaining && e.repeatLocked) ? this._lockedEntryCap(p, e.id) : Infinity;
      newCount = Math.min(Math.max(1, count), cap);
      e.repeatCount = newCount;
      // For daily-task playlists, changing a locked entry's value must redistribute
      // the remaining budget across all unlocked entries so the total stays consistent.
      if (p.dailyTaskRemaining && e.repeatLocked) this._redistributeTaskRepeats(p);
      isActiveEntry = session?.playlistId === playlistId &&
        p.entries.findIndex(e => e.id === entryId) === _getActiveEntryIndex(p, session);
    });
    if (newCount === undefined) return;
    // If this entry is the currently active one, update sessionStorage immediately.
    // remainingRepeats shifts by the same delta so the user gets exactly the
    // extra (or fewer) repeats they just dialled in.
    if (isActiveEntry) {
      const delta = newCount - oldCount;
      const newRemaining = Math.min(newCount, Math.max(1, session.remainingRepeats + delta));
      setActivePlaylistSession({ ...session, remainingRepeats: newRemaining });
      _updatePlaylistHud();
    }
  },

  setEntryRepeatLock(playlistId, entryId, locked) {
    this._updatePlaylist(playlistId, p => {
      const e = p.entries.find(e => e.id === entryId);
      if (!e) return;
      if (locked) e.repeatLocked = true;
      else delete e.repeatLocked;
    });
  },

  setShuffle(playlistId, enabled) {
    this._updatePlaylist(playlistId, p => { p.shuffle = enabled; });
  },

  setPlaylistCycles(playlistId, count) {
    const newCount = Math.max(1, count);
    this._updatePlaylist(playlistId, p => { p.repeatCount = newCount; });
    // Sync session remainingCycles by the same delta so in-flight runs adjust correctly
    const session = getActivePlaylistSession();
    if (session && session.playlistId === playlistId && newCount > 1) {
      const remaining = Math.min(newCount, session.remainingCycles ?? newCount);
      setActivePlaylistSession({ ...session, remainingCycles: remaining });
      _updatePlaylistHud();
    }
  },

  setEntryParams(playlistId, entryId, params) {
    this._updatePlaylist(playlistId, p => {
      const e = p.entries.find(e => e.id === entryId);
      if (e) e.params = { ...params };
    });
  },

  setEntryLabel(playlistId, entryId, label) {
    this._updatePlaylist(playlistId, p => {
      const e = p.entries.find(e => e.id === entryId);
      if (!e) return;
      if (label && label.trim()) e.label = label.trim();
      else delete e.label;
    });
  },

  // ── Bulk operations ────────────────────────────────────────────────────────

  bulkRemoveEntries(playlistId, entryIds) {
    const ids = new Set(entryIds);
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const removed = p.entries.filter(e => ids.has(e.id));
    const names = removed.slice(0, 2).map(e => _entryDisplayName(e, this.main));
    const extra = removed.length > 2 ? ` и ещё ${removed.length - 2}` : '';
    this._pushUndo(`Удаление ${removed.length} игр из «${p.title}»: «${names.join('», «')}»${extra}`);
    p.entries = p.entries.filter(e => !ids.has(e.id));
    this._redistributeTaskRepeats(p);
    this.save(playlists);
    this._selectedEntries[playlistId]?.clear();
    this._selectionMode.delete(playlistId);
  },

  // Duplicates an ordered group of entries N times, preserving their relative
  // order in each copy. Appends all copies to the end of the playlist.
  // Does NOT clear selection or selectionMode — the caller decides that.
  // Returns the flat array of all newly created entry objects.
  bulkDuplicateEntriesN(playlistId, entryIds, n) {
    if (!n || n < 1) return [];
    const idSet = new Set(entryIds);
    return this._updatePlaylist(playlistId, p => {
      // Preserve the order from p.entries, not from the entryIds array.
      const sources = p.entries.filter(e => idSet.has(e.id));
      if (!sources.length) return [];
      const allNew = [];
      for (let i = 0; i < n; i++) {
        const copies = sources.map(e => ({
          id: generateRandomString(),
          gameId: e.gameId,
          repeatCount: e.repeatCount,
          params: e.params ? { ...e.params } : {},
          ...(e.repeatLocked ? { repeatLocked: true } : {}),
        }));
        p.entries.push(...copies);
        allNew.push(...copies);
      }
      return allNew;
    }) ?? [];
  },

  // Merges params onto each selected entry. null value removes that key.
  bulkSetParams(playlistId, entryIds, params) {
    const ids = new Set(entryIds);
    this._updatePlaylist(playlistId, p => {
      p.entries.forEach(e => {
        if (!ids.has(e.id)) return;
        e.params = e.params ? { ...e.params } : {};
        Object.entries(params).forEach(([k, v]) => {
          if (v == null) delete e.params[k];
          else e.params[k] = v;
        });
      });
    });
    this._selectedEntries[playlistId]?.clear();
    this._selectionMode.delete(playlistId);
  },

  bulkSetRepeat(playlistId, entryIds, count) {
    const ids = new Set(entryIds);
    const newCount = Math.max(1, count);
    this._updatePlaylist(playlistId, p => {
      p.entries.forEach(e => { if (ids.has(e.id)) e.repeatCount = newCount; });
    });
    return newCount;
  },

  // Converts selected entries' repeatCounts into separate interleaved entry rows.
  // With chunkSize=2 and entries [A×10, B×10], produces: A×5, B×5, A×5, B×5.
  // Remainder repeats are front-loaded (e.g. 10÷3 → 4, 3, 3).
  // Replaces the selected entries in-place (at the position of the first selected entry).
  bulkConvertRepeatsToEntries(playlistId, entryIds, chunkSize) {
    const chunks = Math.max(1, chunkSize);
    const idSet = new Set(entryIds);

    this._updatePlaylist(playlistId, p => {
      const sources = p.entries.filter(e => idSet.has(e.id));
      if (!sources.length) return;

      this._pushUndo(`Конвертация ${sources.length} игр из «${p.title}», разбивка на ${chunks} части`);

      const newEntries = [];

      for (let round = 0; round < chunks; round++) {
        for (const src of sources) {
          const total = src.repeatCount ?? 1;
          const base  = Math.floor(total / chunks);
          const rem   = total % chunks;
          const count = base + (round < rem ? 1 : 0);

          if (count <= 0) continue;

          newEntries.push({
            id: generateRandomString(),
            gameId: src.gameId,
            repeatCount: count,
            params: src.params ? { ...src.params } : {},
            ...(src.label ? { label: src.label } : {}),
            ...(src.repeatLocked ? { repeatLocked: true } : {}),
          });
        }
      }

      const firstIdx = p.entries.findIndex(e => idSet.has(e.id));
      p.entries = p.entries.filter(e => !idSet.has(e.id));
      p.entries.splice(firstIdx < 0 ? p.entries.length : firstIdx, 0, ...newEntries);
    });
  },

  // ── Shared helpers ─────────────────────────────────────────────────────────

  // After a drag reorder, reload entries from storage and update the chip tooltip.
  _syncPlaylistEntriesAndChip(entryList, playlistId) {
    const block = entryList.closest('.playlist-block');
    if (!block) return;
    const fresh = this.load().find(p => p.id === playlistId);
    if (!fresh) return;
    const chip = block.querySelector('.playlist-game-count-chip');
    if (!chip) return;
    const { text, tip } = _buildGameCountChipContent(fresh, this.main);
    chip.textContent = text;
    if (tip) updateTooltipContent(chip, tip);
  },

  // Wraps _attachSortableDrag + _attachDragSelect with the fixed entry-row options.
  // Single guard on the container prevents double-attachment on repeated calls.
  _attachEntryDrag(entryList, playlistId, sel) {
    if (entryList.dataset.entryDragAttached) return;
    entryList.dataset.entryDragAttached = '1';

    this._attachSortableDrag(entryList, {
      itemSelector:   '.playlist-entry-row',
      handleSelector: '.playlist-entry-drag-handle',
      draggingClass:  'playlist-entry-row--dragging',
      onReorder: (from, to) => {
        this.reorderEntries(playlistId, from, to);
        this._syncPlaylistEntriesAndChip(entryList, playlistId);
      },
      onGroupReorder: (newIds) => {
        this.reorderEntriesOrder(playlistId, newIds);
        this._syncPlaylistEntriesAndChip(entryList, playlistId);
      },
    });

    this._attachDragSelect(entryList, '.playlist-entry-checkbox', (cb, checked) => {
      const entryId = cb.dataset.entryId;
      checked ? sel.add(entryId) : sel.delete(entryId);
      cb.closest('.playlist-entry-row')?.classList.toggle('playlist-entry-row--selected', checked);
      const span = entryList.querySelector('.playlist-multiselect-count');
      if (span) span.textContent = `${sel.size}`;
      if (checked) {
        const msBar = entryList.querySelector('.playlist-multiselect-bar');
        if (msBar?._setSeedEntry) msBar._setSeedEntry(entryId);
      }
    }, {
      rowSelector:  '.playlist-entry-row',
      activeClass:  'playlist-entries--selection',
      skipSelector: 'button, input, .playlist-entry-drag-handle',
    });
  },

  // Drag-to-select: mousedown records the target state; mouseover while LMB
  // held applies it to every checkbox the cursor crosses.
  // cbSelector        — matches checkbox elements inside container
  // onToggle(cb, checked) — called after each state change
  // opts.rowSelector  — wider hit target; clicking/dragging the row also toggles
  //                     its checkbox (only when opts.activeClass is on container)
  // opts.activeClass  — class on container that enables row-level selection
  // opts.skipSelector — elements inside a row that should NOT trigger row-select
  _attachDragSelect(container, cbSelector, onToggle, opts = {}) {
    let dragState = null;
    const selectScrollRAF = [null];
    let selectLastY = 0;

    const resolveCb = target => {
      const directCb = target.closest(cbSelector);
      if (directCb) return directCb;
      if (!opts.rowSelector || !opts.activeClass) return null;
      if (!container.classList.contains(opts.activeClass)) return null;
      if (opts.skipSelector && target.closest(opts.skipSelector)) return null;
      const row = target.closest(opts.rowSelector);
      if (!row) return null;
      return row.querySelector(cbSelector) ?? null;
    };

    const tryToggle = target => {
      const cb = resolveCb(target);
      if (cb && !cb.disabled && cb.checked !== dragState) { cb.checked = dragState; onToggle(cb, dragState); }
    };

    container.addEventListener('mousedown', e => {
      const cb = resolveCb(e.target);
      if (!cb || cb.disabled) return;
      // Prevent text selection while dragging across rows
      e.preventDefault();
      dragState = !cb.checked;
      selectLastY = e.clientY;
      // Apply to the first checkbox immediately — mousemove won't fire for it
      cb.checked = dragState;
      onToggle(cb, dragState);
    });
    // mousedown already handled the toggle, so prevent the browser's click from
    // re-toggling the same checkbox — which would undo the change on a single click.
    container.addEventListener('click', e => {
      const cb = resolveCb(e.target);
      if (!cb || cb.disabled) return;
      e.preventDefault();
    });
    // mousemove: sweep all rows in the Y range covered since the last event,
    // catching any skipped when moving fast; also drives autoscroll.
    document.addEventListener('mousemove', e => {
      if (dragState === null || e.buttons !== 1) { dragState = null; cancelAnimationFrame(selectScrollRAF[0]); return; }
      if (opts.rowSelector) {
        const lo = Math.min(selectLastY, e.clientY);
        const hi = Math.max(selectLastY, e.clientY);
        container.querySelectorAll(opts.rowSelector).forEach(row => {
          const r = row.getBoundingClientRect();
          if (r.bottom >= lo && r.top <= hi) tryToggle(row);
        });
      }
      selectLastY = e.clientY;
      _startAutoscroll(selectScrollRAF, _findScrollParent(container), e.clientY, () => {
        if (!opts.rowSelector) return;
        container.querySelectorAll(opts.rowSelector).forEach(row => {
          const r = row.getBoundingClientRect();
          if (r.top <= selectLastY && r.bottom >= selectLastY) tryToggle(row);
        });
      });
    });
    const stopDrag = () => { dragState = null; cancelAnimationFrame(selectScrollRAF[0]); };
    document.addEventListener('mouseup', stopDrag, { capture: true });
  },

  // Attach long-press selection-mode activation to a scrollable container.
  // container       — the element to listen on (entryList or picker overlay)
  // rowSelector     — CSS selector to find the pressed row
  // skipSelector    — elements that should NOT start a long press
  // activeClass     — CSS class toggled on container to enter selection mode
  // isAlreadyActive — fn() → bool: returns true if selection mode is already on
  // onActivate(row) — called once when the long press fires; pre-selects the row
  _attachLongPressSelection(container, { rowSelector, skipSelector, activeClass, isAlreadyActive, onActivate }) {
    let timer = null;
    let startX = 0;
    let startY = 0;

    container.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest(skipSelector)) return;
      const row = e.target.closest(rowSelector);
      if (!row) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        if (isAlreadyActive()) return;
        container.classList.add(activeClass);
        onActivate(row);
      }, 500);
    });

    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    container.addEventListener('pointerup',     cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointermove', e => {
      if (!timer) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 6) cancel();
    });
  },

  reorderPlaylists(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const playlists = this.load();
    const [moved] = playlists.splice(fromIndex, 1);
    playlists.splice(toIndex, 0, moved);
    this.save(playlists);
  },

  reorderEntries(playlistId, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    this._updatePlaylist(playlistId, p => {
      const [moved] = p.entries.splice(fromIndex, 1);
      p.entries.splice(toIndex, 0, moved);
    });
    // Update session entryIndex if active
    const session = getActivePlaylistSession();
    if (session && session.playlistId === playlistId) {
      let idx = session.entryIndex;
      if (idx === fromIndex) idx = toIndex;
      else if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) idx--;
      else if (fromIndex > toIndex && idx >= toIndex && idx < fromIndex) idx++;
      setActivePlaylistSession({ ...session, entryIndex: idx });
    }
  },

  // Atomically saves a fully reordered entry list (used by group drag-and-drop).
  // newEntryIds is the complete ordered array of entry IDs as reflected in the DOM.
  reorderEntriesOrder(playlistId, newEntryIds) {
    const session = getActivePlaylistSession();
    let activeEntryId = null;
    let newIdx = null;
    this._updatePlaylist(playlistId, p => {
      // Capture the active entry ID before modifying so we can update the session index.
      if (session && session.playlistId === playlistId && !session.shuffleOrder) {
        activeEntryId = p.entries[session.entryIndex]?.id ?? null;
      }
      const map = new Map(p.entries.map(e => [e.id, e]));
      p.entries = newEntryIds.map(id => map.get(id)).filter(Boolean);
      if (activeEntryId) newIdx = p.entries.findIndex(e => e.id === activeEntryId);
    });
    if (newIdx !== null && newIdx !== -1 && newIdx !== session.entryIndex) {
      setActivePlaylistSession({ ...session, entryIndex: newIdx });
    }
  },

  // ── Playback ───────────────────────────────────────────────────────────────
  startPlaylist(playlistId, options = {}) {
    if (!this.main) return;
    const playlists = this.load();
    const playlist  = playlists.find(p => p.id === playlistId);
    if (!playlist || !playlist.entries.length) {
      alert('⚠️ Плейлист пуст. Добавьте игры перед запуском.');
      return;
    }

    // If another playlist is active, ask first with both playlist names
    const existing = getActivePlaylistSession();
    if (existing && existing.playlistId !== playlistId) {
      const existingPlaylist = playlists.find(p => p.id === existing.playlistId);
      const existingName = existingPlaylist?.title || 'Неизвестный плейлист';
      if (!confirm(`Запущен плейлист «${existingName}». Остановить его и запустить «${playlist.title}»?`)) return;
    }

    const shuffle = options.shuffle !== undefined ? options.shuffle : !!playlist.shuffle;
    const shuffleOrder = shuffle ? _createShuffleOrder(playlist.entries.length) : null;

    const startAt = (ei, rr) => {
      const firstEntryIndex = shuffleOrder ? shuffleOrder[ei] : ei;
      const firstEntry = playlist.entries[firstEntryIndex];
      const game = this.main.gamesManager.findGameById(firstEntry.gameId);
      if (!game) { alert('⚠️ Первая игра плейлиста не найдена.'); return; }
      setActivePlaylistSession({
        playlistId,
        entryIndex: ei,
        remainingRepeats: rr ?? firstEntry.repeatCount,
        remainingCycles: playlist.repeatCount ?? 1,
        shuffleOrder,
        shuffleActive: shuffle,
      });
      window.location.href = _generatePlaylistEntryLink(this.main, game, firstEntry);
    };

    // Daily task: silently start from the correct position based on server progress.
    // Only applies to today's active (not expired/completed) task playlists.
    if (playlist.dailyTaskRequire && playlist.dailyTaskDate === _getTaskDate() && !playlist.dailyTaskData) {
      _fetchDailyTask(playlist.dailyTaskDate, playlist).then(taskData => {
        // Map server progress onto this playlist's repeat total.
        // progress counts from 0 toward dailyTaskRequire; the playlist covers the
        // last N of those (N = sum of entry repeatCounts). So alreadyDone is how
        // many of *this playlist's* slots the user has already passed.
        // If the result is <= 0 the loop won't match and we start from 0 (fresh playlist).
        const totalReps   = playlist.entries.reduce((s, e) => s + (e.repeatCount ?? 1), 0);
        const alreadyDone = (taskData?.progress ?? 0) - (playlist.dailyTaskRequire - totalReps);
        let ei = 0, rr = playlist.entries[0]?.repeatCount ?? 1;
        let cursor = 0;
        for (let i = 0; i < playlist.entries.length; i++) {
          const reps = playlist.entries[i].repeatCount ?? 1;
          if (alreadyDone < cursor + reps) { ei = i; rr = (cursor + reps) - alreadyDone; break; }
          cursor += reps;
        }
        startAt(ei, rr);
      });
      return;
    }

    startAt(0);
  },

  startRandomPlaylist() {
    if (!this.main) return;
    const playlists = this.load().filter(p => p.entries.length > 0);
    if (!playlists.length) {
      alert('⚠️ Нет плейлистов с играми.');
      return;
    }

    // ── Shuffle bag ───────────────────────────────────────────────────────────
    // Keep a persisted queue of playlist IDs shuffled with Fisher-Yates.
    // Pop from the front each call. When the bag is empty (or stale — contains
    // IDs that no longer exist), rebuild it from the current playlist set,
    // but exclude the last-played ID to guarantee it never repeats back-to-back
    // even across a refill boundary.
    const validIds = playlists.map(p => p.id);

    let bag = [];
    try { bag = JSON.parse(localStorage.getItem(SHUFFLE_KEY) || '[]'); } catch { }
    // Drop any IDs that have since been deleted
    bag = bag.filter(id => validIds.includes(id));

    if (!bag.length) {
      // Refill: Fisher-Yates shuffle of all valid IDs
      const pool = _shuffleArray(validIds);
      // Avoid immediate back-to-back repeat: if the last played id is at the
      // front after the shuffle, rotate it to the back.
      let lastPlayed = null;
      try { lastPlayed = localStorage.getItem(SHUFFLE_KEY + '_last'); } catch { }
      if (pool.length > 1 && pool[0] === lastPlayed) pool.push(pool.shift());
      bag = pool;
    }

    const pickedId = bag.shift();
    try {
      localStorage.setItem(SHUFFLE_KEY, JSON.stringify(bag));
      localStorage.setItem(SHUFFLE_KEY + '_last', pickedId);
    } catch { }

    this.startPlaylist(pickedId);
  },

  // ── Panel lifecycle ────────────────────────────────────────────────────────
  show(x = 100, y = 100) {
    if (this.popup) { this.hide(); }
    // Auto-expand the active playlist if any
    const session = getActivePlaylistSession();
    if (session && !this.expandedPlaylistId) {
      this.expandedPlaylistId = session.playlistId;
    }
    this.popup = this._buildPanel();
    document.body.appendChild(this.popup);
    this._syncUndoBtn();
    this._intendedX = x + 20;
    this._intendedY = y + 20;
    this.popup.style.left = this._intendedX + 'px';
    this.popup.style.top  = this._intendedY + 'px';
    this._constrain();
    // Scroll active playlist block + active entry into view (centered)
    if (session) {
      requestAnimationFrame(() => this._scrollToActiveEntry());
    }
    setTimeout(() => {
      document.addEventListener('click', this._outside);
      document.addEventListener('keydown', this._keydown);
    }, 100);
    window.addEventListener('resize', this._onResize);
  },

  showCentered() {
    this.show(0, 0);
    requestAnimationFrame(() => {
      if (!this.popup) return;
      const x = Math.max(0, (window.innerWidth  - this.popup.offsetWidth)  / 2);
      const y = Math.max(0, (window.innerHeight - this.popup.offsetHeight) / 2);
      this._intendedX = x;
      this._intendedY = y;
      this.popup.style.left = x + 'px';
      this.popup.style.top  = y + 'px';
    });
  },

  hide() {
    if (this.popup) {
      document.body.removeChild(this.popup);
      this.popup = null;
      this.isDragging = false;
      document.removeEventListener('click', this._outside);
      document.removeEventListener('keydown', this._keydown);
      document.removeEventListener('mousemove', this._drag);
      document.removeEventListener('mouseup', this._stopDrag);
      window.removeEventListener('resize', this._onResize);
    }
  },

  toggle(x, y) {
    if (this.popup) this.hide();
    else this.show(x, y);
  },

  updatePositionDisplay() { _updatePlaylistHud(); },

  refresh(playlistId) {
    if (!this.popup) return;
    this.popup.classList.remove('playlist-picker-open');

    // Partial refresh: rebuild only the one playlist block that changed.
    // Falls back to full rebuild if the block isn't found (e.g. it was just deleted).
    if (playlistId) {
      const oldBlock = this.popup.querySelector(`.playlist-block[data-playlist-id="${playlistId}"]`);
      if (oldBlock) {
        const session  = getActivePlaylistSession();
        const playlist = this.load().find(p => p.id === playlistId);
        if (playlist) {
          const newBlock = this._buildPlaylistBlock(playlist, session);
          oldBlock.parentNode.replaceChild(newBlock, oldBlock);
          // Full rebuild resets the header cursor via _buildPanel, but partial refresh
          // skips that — so sync it here whenever pin state may have changed.
          const panelHeader = this.popup.querySelector('.popup-header');
          if (panelHeader) panelHeader.style.cursor = this._isPinned() ? '' : 'move';
          _dtaskSyncBtn();
          return;
        }
      }
    }

    // Full panel rebuild (structure changed: playlist added/removed/reordered, undo/redo, etc.)
    const newPopup = this._buildPanel();
    // Restore intended position (may differ from displayed if viewport shrank)
    const left = this._intendedX !== null ? this._intendedX : this.popup.getBoundingClientRect().left;
    const top  = this._intendedY !== null ? this._intendedY : this.popup.getBoundingClientRect().top;
    newPopup.style.left = left + 'px';
    newPopup.style.top  = top  + 'px';
    this.popup.parentNode.replaceChild(newPopup, this.popup);
    this.popup = newPopup;
    this._syncUndoBtn();
    this._constrain();
    // Re-register outside click after rebuild
    document.removeEventListener('click', this._outside);
    document.removeEventListener('keydown', this._keydown);
    setTimeout(() => {
      document.addEventListener('click', this._outside);
      document.addEventListener('keydown', this._keydown);
    }, 100);
    // Scroll active entry to center
    const session = getActivePlaylistSession();
    if (session) {
      requestAnimationFrame(() => this._scrollToActiveEntry());
    }
    _dtaskSyncBtn();
  },

  // Only close on click that is truly outside the popup and not a prompt/confirm dialog
  // Returns true only when ALL of: state 2 is active, we are on the game page,
  // and a playlist is currently playing (active, non-paused session).
  // On all other pages, or when no playlist is running, the panel behaves normally.
  _isPinned() {
    if (getCurrentPage() !== 'game') return false;
    if (PlaylistsManager.main?.playlistPanelAutoOpen !== 2) return false;
    const session = getActivePlaylistSession();
    return !!(session && !session.paused);
  },

  _outside: e => {
    if (!PlaylistsManager.popup) return;
    if (PlaylistsManager.popup.contains(e.target)) return;
    if (PlaylistsManager._isPinned()) return;
    // Don't close if the click was on a button anywhere in the document
    if (e.target.closest('button, input, select, textarea')) return;
    PlaylistsManager.hide();
  },

  // Returns the button that opens/closes whichever picker is currently active:
  // the daily-task overlay's cancel, or the regular picker toggle.
  _pickerToggleBtn() {
    const popup = PlaylistsManager.popup;
    if (!popup) return null;
    const visibleOverlay = popup.querySelector('.playlist-picker-overlay--overlay:not(.playlist-picker-overlay--hidden)');
    return visibleOverlay && !visibleOverlay.closest('.playlist-game-picker')
      ? visibleOverlay.querySelector('.playlist-picker-overlay-footer .playlist-picker-toggle')
      : popup.querySelector('.playlist-picker-btn-row .playlist-picker-toggle');
  },

  _keydown: e => {
    if (PlaylistsManager._isPinned()) return;
    if (e.key === 'Escape' && !document.activeElement?.matches('input, textarea')) PlaylistsManager.hide();
    const inTextField = !!document.activeElement?.matches('input, textarea');
    if (e.code === 'KeyQ') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      // Q: expand/collapse the hovered playlist — layout-independent.
      // Collapsed → hovering the header is enough.
      // Expanded  → hovering the header OR anywhere inside the playlist-block works.
      const hoveredHeader = popup.querySelector('.playlist-header-row:hover');
      const hoveredBlock  = !hoveredHeader && popup.querySelector('.playlist-block:hover');
      const targetHeader  = hoveredHeader ?? hoveredBlock?.querySelector('.playlist-header-row');
      if (!targetHeader) return;
      e.preventDefault();
      targetHeader.click();
    }
    if (e.key === 'Tab') {
      const target = PlaylistsManager._pickerToggleBtn();
      if (!target) return;
      e.preventDefault();
      target.click();
    }
    if (e.code === 'KeyR') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      // R: rename hovered entry first, fall back to hovered playlist header.
      const hoveredEntry = popup.querySelector('.playlist-entry-row:hover');
      if (hoveredEntry) {
        e.preventDefault();
        hoveredEntry.querySelector('.playlist-entry-rename-btn')?.click();
        return;
      }
      const hoveredRow = popup.querySelector('.playlist-header-row:hover');
      if (!hoveredRow) return;
      e.preventDefault();
      hoveredRow.querySelector('.playlist-rename-btn')?.click();
    }
    if (e.code === 'KeyD') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      // D: duplicate the hovered entry row — or the hovered playlist header when
      // no entry row is hovered.
      const hoveredEntry = popup.querySelector('.playlist-entry-row:hover');
      if (hoveredEntry) {
        e.preventDefault();
        hoveredEntry.querySelector('.playlist-entry-duplicate-btn')?.click();
        return;
      }
      const hoveredHeader = popup.querySelector('.playlist-header-row:hover');
      if (!hoveredHeader) return;
      e.preventDefault();
      hoveredHeader.querySelector('.playlist-duplicate-btn')?.click();
    }
    if (e.code === 'KeyF') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      // F: toggle filters chip strip in the game picker (only when picker is open).
      const pickerOverlay = popup.querySelector('.playlist-picker-overlay:not(.playlist-picker-overlay--hidden)');
      if (!pickerOverlay) return;
      e.preventDefault();
      pickerOverlay.querySelector('.playlist-picker-filters-btn')?.click();
    }
    if (e.code === 'KeyS') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;

      // Picker overlay takes priority when it's visible
      const pickerOverlay = popup.querySelector('.playlist-picker-overlay:not(.playlist-picker-overlay--hidden)');
      if (pickerOverlay) {
        if (pickerOverlay.classList.contains('playlist-picker-overlay--selection')) {
          popup.querySelector('.playlist-picker-confirm-clear')?.click();
        } else {
          pickerOverlay.classList.add('playlist-picker-overlay--selection');
        }
        return;
      }

      // Fall back to playlist entry multiselect
      const entryList = popup.querySelector('.playlist-entries');
      if (!entryList) return;
      if (entryList.classList.contains('playlist-entries--selection')) {
        entryList.querySelector('.playlist-multiselect-exit')?.click();
      } else {
        const block = entryList.closest('.playlist-block');
        const playlistId = block?.dataset.playlistId;
        if (playlistId) PlaylistsManager._selectionMode.add(playlistId);
        entryList.classList.add('playlist-entries--selection');
        requestAnimationFrame(() => {
          const msBar = entryList.querySelector('.playlist-multiselect-bar');
          if (block && msBar) block.style.setProperty('--playlist-multiselect-bar-height', `${msBar.offsetHeight}px`);
        });
      }
    }
    if (e.code === 'KeyA') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      e.preventDefault();
      popup.querySelector('.playlists-add-btn')?.click();
      popup.querySelector('.playlists-create-input')?.blur();
    }
    if (e.code === 'KeyT') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      const form = popup.querySelector('.playlists-create-form');
      if (!form) return;
      e.preventDefault();
      form.querySelector('.playlists-create-task-btn')?.click();
    }
    if (e.code === 'KeyG') {
      if (inTextField) return;
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      const form = popup.querySelector('.playlists-create-form');
      if (!form) return;
      e.preventDefault();
      form.querySelector('.playlists-create-groups-toggle')?.click();
    }
    // Ctrl/Cmd+Z — undo. Ctrl/Cmd+Shift+Z — redo. e.code is layout-independent.
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
      if (inTextField) return;
      e.preventDefault();
      if (e.shiftKey) PlaylistsManager._redo();
      else            PlaylistsManager._undo();
    }
  },

  _startDrag(e) {
    if (e.button !== 0) return;
    if (this._isPinned()) return;
    this.isDragging = true;
    const rect = this.popup.getBoundingClientRect();
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', this._drag);
    document.addEventListener('mouseup', this._stopDrag);
  },

  _drag: e => {
    if (!PlaylistsManager.isDragging || !PlaylistsManager.popup) return;
    const x = e.clientX - PlaylistsManager.offsetX;
    const y = e.clientY - PlaylistsManager.offsetY;
    PlaylistsManager._intendedX = x;
    PlaylistsManager._intendedY = y;
    PlaylistsManager.popup.style.left = x + 'px';
    PlaylistsManager.popup.style.top  = y + 'px';
    PlaylistsManager._constrain();
  },

  _stopDrag: () => {
    PlaylistsManager.isDragging = false;
    document.removeEventListener('mousemove', PlaylistsManager._drag);
    document.removeEventListener('mouseup', PlaylistsManager._stopDrag);
  },

  _constrain() {
    if (!this.popup) return;
    const r  = this.popup.getBoundingClientRect();
    const mL = window.innerWidth  - r.width;
    const mT = window.innerHeight - r.height;
    if (r.left < 0)  this.popup.style.left = '0px';
    if (r.top  < 0)  this.popup.style.top  = '0px';
    if (r.left > mL) this.popup.style.left = mL + 'px';
    if (r.top  > mT) this.popup.style.top  = mT + 'px';
  },

  // On resize: clamp display to viewport but preserve intended coords so
  // expanding the viewport back restores the panel to its original position.
  _onResize: () => {
    if (!PlaylistsManager.popup) return;
    // Restore intended position first, then clamp to current viewport
    if (PlaylistsManager._intendedX !== null) PlaylistsManager.popup.style.left = PlaylistsManager._intendedX + 'px';
    if (PlaylistsManager._intendedY !== null) PlaylistsManager.popup.style.top  = PlaylistsManager._intendedY + 'px';
    PlaylistsManager._constrain();
  },

  // Update the ::before progress bar on the active entry row in the open panel
  // without rebuilding anything. Called from PageHandler after advancePlaylist.
  updateActiveEntryProgress() {
    if (!this.popup) return;
    const session = getActivePlaylistSession();
    if (!session) return;
    const row = this.popup.querySelector('.playlist-entry-row--active');
    if (!row) return;
    try {
      const playlists = this.load();
      const playlist  = playlists.find(p => p.id === session.playlistId);
      if (!playlist) return;
      const entry = _getPlaylistEntry(playlist, session);
      if (!entry || entry.repeatCount <= 1) {
        row.style.removeProperty('--playlist-progress');
        row.classList.remove('playlist-entry-row--progress');
        return;
      }
      const played = entry.repeatCount - session.remainingRepeats;
      if (played <= 0) {
        row.style.removeProperty('--playlist-progress');
        row.classList.remove('playlist-entry-row--progress');
        return;
      }
      const pct = Math.min(100, Math.round((played / entry.repeatCount) * 100));
      row.classList.add('playlist-entry-row--progress');
      row.style.setProperty('--playlist-progress', `${pct}%`);
    } catch { }
  },

  updateActiveBadge() { _updateActiveBadge(); },

  // Scroll the active entry row to the center of the list viewport.
  // Used by both show() and refresh() to avoid duplicating the logic.
  _scrollToActiveEntry() {
    const session = getActivePlaylistSession();
    if (!session || !this.popup) return;
    const list        = this.popup.querySelector('.playlists-list');
    const activeEntry = this.popup.querySelector('.playlist-entry-row--active');
    const activeBlock = this.popup.querySelector(`.playlist-block[data-playlist-id="${session.playlistId}"]`);
    if (activeEntry && list) {
      const listRect  = list.getBoundingClientRect();
      const entryRect = activeEntry.getBoundingClientRect();
      const offset = entryRect.top - listRect.top - (listRect.height / 2) + (entryRect.height / 2);
      list.scrollBy({ top: offset, behavior: 'smooth' });
    } else if (activeBlock && list) {
      activeBlock.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  },

  // ── DOM builder ────────────────────────────────────────────────────────────
  _buildPanel() {
    const playlists = this.load();
    const session   = getActivePlaylistSession();
    const panel     = _el('div', 'playlists-manager-popup');

    // Header (draggable)
    const header = _el('div', 'popup-header');
    if (!this._isPinned()) header.style.cursor = 'move';
    header.addEventListener('mousedown', e => this._startDrag(e));

    const titleSpan = _el('span', 'popup-header-title', 'Плейлисты');

    const hotkeysInfoBtn = _el('button', 'playlists-hotkeys-info-btn');
    hotkeysInfoBtn.innerHTML = icons.info;
    hotkeysInfoBtn.addEventListener('mousedown', e => e.stopPropagation());
    hotkeysInfoBtn.addEventListener('click',     e => e.stopPropagation());
    createCustomTooltip(hotkeysInfoBtn, [
      '[Q] Развернуть / Свернуть плейлист под курсором',
      '[R] Переименовать плейлист или игру под курсором',
      '[D] Дублировать плейлист или игру под курсором',
      '[A] Открыть / Закрыть форму создания плейлиста',
      '[T] Создать плейлист из задачи дня (форма открыта)',
      '[G] Показать / Скрыть группы для создания плейлиста (форма открыта)',
      '[Tab] Открыть / Закрыть список игр для добавления',
      '[F] Показать / Скрыть фильтры при добавлении игр',
      '[S] Режим множественного выделения игр (плейлист или список добавления)',
      '[Ctrl + Z] Отменить последнее действие',
      '[Ctrl + Shift + Z] Повторить отменённое действие',
      '[Escape] Закрыть панель плейлистов',
    ].join(''));
    titleSpan.appendChild(hotkeysInfoBtn);

    const randomBtn = _el('button', 'playlists-random-btn');
    randomBtn.innerHTML = icons.random;
    createCustomTooltip(randomBtn, 'Запустить случайный плейлист');
    randomBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.startRandomPlaylist();
    });

    const addBtn = _el('button', 'playlists-add-btn');
    addBtn.innerHTML = `${icons.plus}<span>Новый</span>`;
    createCustomTooltip(addBtn, '[Клик / A] Открыть / Закрыть форму создания плейлиста');
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      const existing = panel.querySelector('.playlists-create-form');
      // Only close the form if we are already on the playlists list (no picker was
      // just closed by the capturing listener above). If a picker was open, the
      // capturing listener already closed it — keep the form visible.
      const closedPicker = actions._closedPicker;
      actions._closedPicker = false;
      if (existing) {
        if (!closedPicker) existing.remove();
        return;
      }
      const form = this._buildCreateForm(() => {
        panel.querySelector('.playlists-create-form')?.remove();
        this.refresh();
      });
      // Insert after header
      header.insertAdjacentElement('afterend', form);
      form.querySelector('.playlists-create-input')?.focus();
    });

    const undoBtn = _el('button', 'playlists-undo-btn playlists-undo-btn--hidden');
    undoBtn.innerHTML = icons.arrowGoBack;
    createCustomTooltip(undoBtn, '');
    undoBtn.addEventListener('mousedown', e => e.stopPropagation());
    undoBtn.addEventListener('click', e => { e.stopPropagation(); this._undo(); });

    const clearBtn = _el('button', 'playlists-clear-btn');
    const _syncClearBtn = () => {
      clearBtn.innerHTML = this.load().length > 0 ? icons.trashSomething : icons.trashNothing;
    };
    _syncClearBtn();
    createCustomTooltip(clearBtn,
      '[Клик] Удалить все плейлисты задачи дня' +
      '[Ctrl + Клик] Удалить все плейлисты'
    );
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      const all = this.load();
      if (e.ctrlKey) {
        if (!confirm('Удалить все плейлисты?')) return;
        this._pushUndo(`Удаление всех плейлистов (${all.length} шт.)`);
        this.save([]);
      } else {
        const remaining = all.filter(p => !p.dailyTaskRequire);
        if (all.length === remaining.length) return;
        if (!confirm('Удалить все плейлисты задачи дня?')) return;
        this._pushUndo(`Удаление ${all.length - remaining.length} плейлистов задачи дня`);
        this.save(remaining);
      }
      cancelActivePlaylist();
      this.refresh();
    });

    const importBtn = _el('button', 'playlists-import-btn');
    importBtn.innerHTML = icons.import;
    createCustomTooltip(importBtn,
      '[Клик] Импортировать из буфера' +
      '[Ctrl + Клик] Импортировать из файла'
    );
    importBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (e.ctrlKey) {
        this._importFromFile();
      } else {
        navigator.clipboard.readText().then(
          text => this.importPlaylist(text),
          () => alert('⚠️ Не удалось прочитать буфер обмена.')
        );
      }
    });

    const actions = _el('div', 'playlists-header-actions');
    actions.append(undoBtn, clearBtn, importBtn, randomBtn, addBtn);
    // If any picker is open when a header action is clicked, close it first so the
    // user lands back on the playlists list before the button's own handler runs.
    actions.addEventListener('click', () => {
      if (!PlaylistsManager.popup?.classList.contains('playlist-picker-open')) return;
      actions._closedPicker = true;
      PlaylistsManager._pickerToggleBtn()?.click();
    }, true);
    header.append(titleSpan, actions);
    panel.appendChild(header);

    if (!playlists.length) {
      panel.appendChild(_el('div', 'playlists-empty', 'Нет плейлистов. Создайте первый!'));
      return panel;
    }

    const list = _el('div', `playlists-list${session ? ' playlists-list--playing' : ''}`);
    playlists.forEach(playlist => list.appendChild(this._buildPlaylistBlock(playlist, session)));

    // Playlist-level drag-to-reorder — same mechanism as entry drag, no duplication
    this._attachSortableDrag(list, {
      itemSelector:   '.playlist-block',
      handleSelector: '.playlist-block-drag-handle',
      draggingClass:  'playlist-block--dragging',
      onReorder: (from, to) => this.reorderPlaylists(from, to),
      onStart: block => {
        const content = block.querySelector('.playlist-content');
        if (content) {
          block.dataset.dragContentHidden = '1';
          content.style.display = 'none';
        }
      },
      onEnd: block => {
        if (block.dataset.dragContentHidden) {
          const content = block.querySelector('.playlist-content');
          if (content) content.style.display = '';
          delete block.dataset.dragContentHidden;
        }
      },
    });

    panel.appendChild(list);
    return panel;
  },

  _buildPlaylistBlock(playlist, session) {
    const isActive   = !!(session && session.playlistId === playlist.id);
    // Active playlist is always expanded; otherwise use expandedPlaylistId state
    const isExpanded = isActive || this.expandedPlaylistId === playlist.id;

    const block = _el('div', 'playlist-block');
    block.dataset.playlistId = playlist.id;

    // Header row — accordion toggle
    const row = _el('div', `playlist-header-row${isActive ? ' playlist-header-row--active' : ''}${isActive && session?.paused ? ' playlist-header-row--paused' : ''}`);

    if (isActive) {
      // Active: left-actions (pause + stop + drag handle) | title | meta (badge + chips) | no right-actions
      // (no shuffle or cycle controls since those apply to the whole playlist and are not relevant when it's already active).
      const isPaused = !!(session && session.paused);
      const pauseBtn = _el('button', 'playlist-pause-btn');
      pauseBtn.innerHTML = isPaused ? icons.start : icons.pause;
      createCustomTooltip(pauseBtn, isPaused
        ? `Возобновить плейлист «${playlist.title}»`
        : `Приостановить плейлист «${playlist.title}»`);
      pauseBtn.addEventListener('click', e => {
        e.stopPropagation();
        const current = getActivePlaylistSession();
        if (!current) return;
        if (current.paused) {
          // Resuming: clear paused flag, then navigate to the already-queued game.
          // (advancePlaylist already decremented/advanced the session when the game
          //  finished, so current.entryIndex is already the correct next destination.)
          setActivePlaylistSession({ ...current, paused: false });
          _updatePlaylistHud();
          const playlists = this.load();
          const pl = playlists.find(p => p.id === current.playlistId);
          const entry = pl ? _getPlaylistEntry(pl, getActivePlaylistSession()) : null;
          const game = entry ? this.main.gamesManager.findGameById(entry.gameId) : null;
          if (game) {
            window.location.href = this.main.gamesManager.generateGameLink(game);
          } else {
            this.refresh(playlist.id);
          }
        } else {
          // Pausing: set the flag AND cancel any active replay countdown so
          // the timer does not fire and navigate while the playlist is paused.
          setActivePlaylistSession({ ...current, paused: true });
          try { this.main.pageHandler?.cancelReplay(true); } catch (_) {}
          _updatePlaylistHud();
          this.refresh(playlist.id);
        }
      });

      const stopBtn = _el('button', 'playlist-cancel-btn');
      stopBtn.innerHTML = icons.stop;
      createCustomTooltip(stopBtn, `Остановить плейлист «${playlist.title}»`);
      stopBtn.addEventListener('click', e => {
        e.stopPropagation();
        cancelActivePlaylist();
        _updatePlaylistHud();
        const list = this.popup.querySelector('.playlists-list');
        list?.classList.remove('playlists-list--playing');
        this.refresh(playlist.id);
        this._constrain();
      });

      const titleSpan = _el('span', 'playlist-title', playlist.title);

      const meta = _el('div', 'playlist-header-meta');
      const entry = _getPlaylistEntry(playlist, session);
      if (entry) {
        const badge = _el('div', 'playlist-active-badge');
        _renderActiveBadge(badge, playlist, session, entry);
        meta.appendChild(badge);
      }
      // Game count chip — always visible on every header (active or not)
      _appendGameCountChip(meta, playlist, this.main);
      _appendTaskChips(meta, playlist);

      const blockHandle = _el('span', 'playlist-block-drag-handle');
      blockHandle.innerHTML = icons.dragable;

      const leftActions = _el('div', 'playlist-header-left-actions');
      leftActions.append(pauseBtn, stopBtn, blockHandle);

      row.append(leftActions, titleSpan, meta);
    } else {
      // Inactive: left-actions (play + drag handle) | title | meta (chips) | right-actions (stepper + shuffle + rename + dup + del).
      const playBtn = _el('button', 'playlist-play-btn');
      playBtn.innerHTML = icons.start;
      createCustomTooltip(playBtn, `Запустить плейлист «${playlist.title}»`);
      playBtn.addEventListener('click', e => { e.stopPropagation(); this.startPlaylist(playlist.id); });

      const titleSpan = _el('span', 'playlist-title', playlist.title);

      const meta = _el('div', 'playlist-header-meta');
      // Game count chip — always visible on every header (active or not)
      _appendGameCountChip(meta, playlist, this.main);
      _appendTaskChips(meta, playlist);

      // Playlist-level cycle stepper — only shown when repeatCount > 1 or on hover
      const cycleCount     = playlist.repeatCount ?? 1;
      const cycleStepper   = _el('div', 'playlist-header-stepper');
      const cycleDecBtn    = _el('button', 'playlist-stepper-btn');
      cycleDecBtn.innerHTML = icons.chevronLeft;
      const cycleCountSpan = _el('span', 'playlist-stepper-count', String(cycleCount));
      const cycleIncBtn    = _el('button', 'playlist-stepper-btn');
      cycleIncBtn.innerHTML = icons.chevronRight;
      cycleStepper.append(cycleDecBtn, cycleCountSpan, cycleIncBtn);
      createCustomTooltip(cycleStepper, `Количество повторов всего плейлиста ${STEPPER_DRAG_TIP}`);
      if (cycleCount <= 1) cycleStepper.classList.add('playlist-header-stepper--default');

      const setCycleCount = next => {
        this.setPlaylistCycles(playlist.id, next);
        playlist.repeatCount = next;
        cycleCountSpan.textContent = String(next);
        cycleStepper.classList.toggle('playlist-header-stepper--default', next <= 1);
      };
      const onCycleDec = () => setCycleCount(Math.max(1, (playlist.repeatCount ?? 1) - 1));
      const onCycleInc = () => setCycleCount((playlist.repeatCount ?? 1) + 1);
      _attachButtonHold(cycleDecBtn, onCycleDec);
      _attachButtonHold(cycleIncBtn, onCycleInc);
      _attachStepperDrag(cycleCountSpan, onCycleDec, onCycleInc);
      _attachCountDblClick(cycleCountSpan, {
        getValue: () => playlist.repeatCount ?? 1,
        setValue: v => setCycleCount(Math.max(1, v)),
      });

      const shufflePlayBtn = _el('button', 'playlist-play-shuffle-btn');
      shufflePlayBtn.innerHTML = icons.random;
      const updateShuffleBtn = enabled => {
        shufflePlayBtn.classList.toggle('active', enabled);
        updateTooltipContent(shufflePlayBtn, enabled
          ? `Отключить случайный порядок для «${playlist.title}»`
          : `Включить случайный порядок для «${playlist.title}»`
        );
      };
      updateShuffleBtn(!!playlist.shuffle);

      shufflePlayBtn.addEventListener('click', e => {
        e.stopPropagation();
        const next = !playlist.shuffle;
        this.setShuffle(playlist.id, next);
        playlist.shuffle = next;
        updateShuffleBtn(next);
      });

      const renameBtn = _el('button', 'playlist-rename-btn');
      renameBtn.innerHTML = icons.rename;
      createCustomTooltip(renameBtn, '[Клик / R] Переименовать');
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (row.querySelector('.playlists-create-name-row')) return; // already open
        const titleSpan = row.querySelector('.playlist-title');
        if (!titleSpan) return;
        titleSpan.style.display = 'none';
        const wrap = this._buildInlineRenameInput(
          playlist.title,
          'Название плейлиста',
          val => {
            this.renamePlaylist(playlist.id, val);
            this.refresh(playlist.id);
          },
          () => {
            wrap.remove();
            titleSpan.style.display = '';
          }
        );
        titleSpan.insertAdjacentElement('afterend', wrap);
      });

      const dupPlaylistBtn = _el('button', 'playlist-duplicate-btn');
      dupPlaylistBtn.innerHTML = icons.copy;
      createCustomTooltip(dupPlaylistBtn, '[Клик / D] Дублировать плейлист');
      dupPlaylistBtn.addEventListener('click', e => {
        e.stopPropagation();
        const copy = this.duplicatePlaylist(playlist.id);
        if (copy) { this.expandedPlaylistId = null; this.refresh(); }
      });

      const exportBtn = _el('button', 'playlist-export-btn');
      exportBtn.innerHTML = icons.export;
      createCustomTooltip(exportBtn,
        '[Клик] Экспортировать в буфер' +
        '[Ctrl + Клик] Экспортировать как файл'
      );
      exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.exportPlaylist(playlist.id, e.ctrlKey);
      });

      const delBtn = _el('button', 'playlist-delete-btn');
      delBtn.innerHTML = icons.trashNothing;
      createCustomTooltip(delBtn, 'Удалить плейлист');
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm(`Удалить плейлист «${playlist.title}»?`)) return;
        if (playlist.dailyTaskRequire) this._cleanTaskGroup(playlist);
        this.deletePlaylist(playlist.id);
        this.refresh();
      });

      const blockHandle = _el('span', 'playlist-block-drag-handle');
      blockHandle.innerHTML = icons.dragable;

      const leftActions = _el('div', 'playlist-header-left-actions');
      leftActions.append(playBtn, blockHandle);

      const rightActions = _el('div', 'playlist-header-right-actions');
      rightActions.append(cycleStepper, shufflePlayBtn, renameBtn, dupPlaylistBtn, exportBtn, delBtn);

      row.append(leftActions, titleSpan, meta, rightActions);
    }

    // Toggle expand on row click (excluding buttons)
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      e.stopPropagation();
      this.expandedPlaylistId = isExpanded && !isActive ? null : playlist.id;
      this.refresh();
    });

    block.appendChild(row);

    // Set CSS vars for the sticky stack on this block.
    // --playlist-header-height          → bar and entry-row--params-open stick here
    // --playlist-entry-row-height       → set via rAF when entry params open; params panel top = header + row
    // --playlist-multiselect-bar-height → set via rAF when bulk params open; bulk panel top = header + bar
    requestAnimationFrame(() => {
      block.style.setProperty('--playlist-header-height', `${row.offsetHeight}px`);
    });

    if (!isExpanded) return block;

    // Collapsible content
    const content = _el('div', 'playlist-content');

    // Entry list (no search here — entries list is short)
    const entryList = _el('div', 'playlist-entries');
    _attachVocabularyPreview(entryList, '.playlist-entry-label');
    const sel = this._selectedEntries[playlist.id] ??= new Set();

    // Prune stale IDs that no longer exist in the playlist
    const validIds = new Set(playlist.entries.map(e => e.id));
    for (const id of [...sel]) { if (!validIds.has(id)) sel.delete(id); }
    if (sel.size === 0) this._selectionMode.delete(playlist.id);

    // ── Multiselect bar — always in DOM; CSS hides it until selection mode ─
    entryList.appendChild(this._buildMultiSelectBar(playlist, sel, entryList));

    if (!playlist.entries.length) {
      entryList.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
    } else {
      const activeRealIndex = isActive ? _getActiveEntryIndex(playlist, session) : -1;
      playlist.entries.forEach((entry, idx) => {
        const isCurrentEntry = isActive && idx === activeRealIndex;
        let isPassedEntry = false;
        if (isActive && !isCurrentEntry) {
          const order = Array.isArray(session.shuffleOrder) && session.shuffleOrder.length === playlist.entries.length
            ? session.shuffleOrder : null;
          if (order) {
            const posInOrder = order.indexOf(idx);
            isPassedEntry = posInOrder >= 0 && posInOrder < session.entryIndex;
          } else {
            isPassedEntry = idx < activeRealIndex;
          }
        }
        entryList.appendChild(this._buildEntryRow(playlist, entry, session, isCurrentEntry, idx, isPassedEntry));
      });

      this._attachEntryDrag(entryList, playlist.id, sel);

      // Restore selection mode class if it was active before a data-driven refresh
      if (this._selectionMode.has(playlist.id)) {
        entryList.classList.add('playlist-entries--selection');
      }
    }

    // ── Long-press on any entry row to enter selection mode ──────────────
    this._attachLongPressSelection(entryList, {
      rowSelector:     '.playlist-entry-row',
      skipSelector:    'button, input, .playlist-entry-drag-handle, .playlist-stepper-count, .playlist-entry-play-count',
      activeClass:     'playlist-entries--selection',
      isAlreadyActive: () => entryList.classList.contains('playlist-entries--selection'),
      onActivate: row => {
        this._selectionMode.add(playlist.id);
        const entryId = row.dataset.entryId;
        if (entryId) {
          sel.add(entryId);
          row.classList.add('playlist-entry-row--selected');
          const cb = row.querySelector('.playlist-entry-checkbox');
          if (cb) cb.checked = true;
          const span = entryList.querySelector('.playlist-multiselect-count');
          if (span) span.textContent = `${sel.size}`;
          // Tell the multiselect bar which entry was long-pressed so smart-select
          // filters have a reference point for matching patterns.
          const msBar = entryList.querySelector('.playlist-multiselect-bar');
          if (msBar?._setSeedEntry) msBar._setSeedEntry(entryId);
        }
        // Multiselect bar is now visible — update its height var so the dup
        // bar (if open) re-sticks correctly below it.
        requestAnimationFrame(() => {
          const block = entryList.closest('.playlist-block');
          const msBar = entryList.querySelector('.playlist-multiselect-bar');
          if (block && msBar) block.style.setProperty('--playlist-multiselect-bar-height', `${msBar.offsetHeight}px`);
        });
      },
    });

    content.appendChild(entryList);
    content.appendChild(this._buildGamePicker(playlist));
    block.appendChild(content);
    return block;
  },

  _buildEntryRow(playlist, entry, session, isCurrentEntry, entryIndex, isPassedEntry = false) {
    const game = this.main?.gamesManager?.findGameById(entry.gameId) ?? null;
    const row  = _el('div', [
      'playlist-entry-row',
      isCurrentEntry  ? 'playlist-entry-row--active' : '',
      isPassedEntry   ? 'playlist-entry-row--passed'  : '',
    ].filter(Boolean).join(' '));
    row.dataset.entryId    = entry.id;
    row.dataset.entryIndex = entryIndex;
    row.dataset.gameId     = game?.id ?? '';
    if (game?.params?.gametype === 'voc' && game.params.vocId) row.dataset.vocId = game.params.vocId;

    // Progress fill
    if (isCurrentEntry && entry.repeatCount > 1) {
      const played = entry.repeatCount - session.remainingRepeats;
      const pct    = Math.round((played / entry.repeatCount) * 100);
      row.style.setProperty('--playlist-progress', `${pct}%`);
      row.classList.add('playlist-entry-row--progress');
    }

    // Drag handle
    const handle = _el('span', 'playlist-entry-drag-handle');
    handle.innerHTML = icons.dragable;

    // Game label
    const label = _el('span', 'playlist-entry-label');
    if (game) {
      const gtype = gameTypes[game.params.gametype] || game.params.gametype;
      const defaultName = game.params.vocName ? `«${game.params.vocName}»` : gtype;
      const displayName = entry.label ? entry.label : defaultName;
      label.textContent = displayName;
      if (entry.label) label.classList.add('playlist-entry-label--custom');
      label.classList.add(`gametype-${game.params.gametype}`);
      const sessionInfo = (isCurrentEntry && session)
        ? { played: entry.repeatCount - session.remainingRepeats, total: entry.repeatCount }
        : null;
      _refreshEntryLabelTooltip(label, game, entry.params ?? {}, sessionInfo, entry.label ?? null);
    } else {
      label.textContent = `#${entry.gameId} (удалена)`;
      label.classList.add('playlist-entry-missing');
    }

    // Stepper
    const stepper    = _el('div', 'playlist-entry-stepper');
    const decBtn     = _el('button', 'playlist-stepper-btn');
    decBtn.innerHTML = icons.chevronLeft;
    const countSpan  = _el('span', 'playlist-stepper-count', String(entry.repeatCount));
    const incBtn     = _el('button', 'playlist-stepper-btn');
    incBtn.innerHTML = icons.chevronRight;
    const ENTRY_STEPPER_TIP = `Количество повторов этой игры ${STEPPER_DRAG_TIP}`;
    createCustomTooltip(stepper, ENTRY_STEPPER_TIP);

    // Play-count badge — same value as stepper, shown while playing (drag-to-scrub)
    const playCountBadge = _el('span', 'playlist-entry-play-count', `×${entry.repeatCount}`);
    createCustomTooltip(playCountBadge, ENTRY_STEPPER_TIP);
    if (entry.repeatLocked)  playCountBadge.classList.add('playlist-entry-play-count--locked');

    // Snapshot how many plays have already happened for this entry at build time.
    // We keep this fixed so that stepper changes (which shift remainingRepeats by
    // the same delta) don't corrupt the played count — only actual game advancement
    // changes remainingRepeats independently of repeatCount.
    const sessionAtBuild = isCurrentEntry && session ? getActivePlaylistSession() : null;
    let playedCount = (isCurrentEntry && sessionAtBuild)
      ? Math.max(0, entry.repeatCount - sessionAtBuild.remainingRepeats)
      : 0;

    const setEntryRepeat = next => {
      this.setRepeat(playlist.id, entry.id, next);
      entry.repeatCount = next;
      countSpan.textContent      = String(next);
      playCountBadge.textContent = `×${next}`;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, playedCount, isCurrentEntry);
      const entryList = row.closest('.playlist-entries');
      const msBar = entryList?.querySelector('.playlist-multiselect-bar');
      if (msBar?._refreshFilterRow) msBar._refreshFilterRow();
      if (playlist.dailyTaskRemaining && entry.repeatLocked) {
        const saved = PlaylistsManager.load().find(p => p.id === playlist.id);
        if (saved) playlist.entries = saved.entries;
      }
      _syncEntrySteppers(entryList, playlist);
      _syncTaskChips(row.closest('.playlist-block'), playlist);
    };
    const entryRepeatMax = () => (playlist.dailyTaskRemaining && entry.repeatLocked) ? PlaylistsManager._lockedEntryCap(playlist, entry.id) : Infinity;

    const onEntryDec = () => setEntryRepeat(Math.max(1, entry.repeatCount - 1));
    const onEntryInc = () => setEntryRepeat(Math.min(entryRepeatMax(), entry.repeatCount + 1));
    _attachButtonHold(decBtn, onEntryDec);
    _attachButtonHold(incBtn, onEntryInc);
    _attachStepperDrag(countSpan,      onEntryDec, onEntryInc);
    _attachStepperDrag(playCountBadge, onEntryDec, onEntryInc);
    const dblClickOpts = { getValue: () => entry.repeatCount, setValue: v => setEntryRepeat(Math.min(entryRepeatMax(), Math.max(1, v))) };
    _attachCountDblClick(countSpan,      dblClickOpts);
    _attachCountDblClick(playCountBadge, dblClickOpts);
    stepper.append(decBtn, countSpan, incBtn);

    // ── RMB context menu: lock / unlock repeat count ─────────────────────────
    if (playlist.dailyTaskRequire) {
      const syncLockState = () => {
        stepper.classList.toggle('playlist-entry-stepper--locked', !!entry.repeatLocked);
        
        const tip = entry.repeatLocked
          ? `${ENTRY_STEPPER_TIP}[ПКМ] Разблокировать — повторы снова участвуют в перераспределении`
          : `${ENTRY_STEPPER_TIP}[ПКМ] Заблокировать — зафиксировать это значение при перераспределении`;
        
        updateTooltipContent(stepper, tip);
        updateTooltipContent(playCountBadge, tip);
      };
      syncLockState();

      const toggleLock = (e) => {
        e.preventDefault();
        e.stopPropagation();
        entry.repeatLocked = !entry.repeatLocked;
        PlaylistsManager.setEntryRepeatLock(playlist.id, entry.id, entry.repeatLocked);
        
        if (PlaylistsManager.popup) PlaylistsManager.refresh(playlist.id);
        else syncLockState();
      };

      [stepper, playCountBadge].forEach(el => {
        el.addEventListener('contextmenu', toggleLock);
      });
    }

    // Remove
    const removeBtn = _el('button', 'playlist-entry-remove');
    removeBtn.innerHTML = icons.x;
    createCustomTooltip(removeBtn, 'Убрать из плейлиста');
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Capture DOM references BEFORE detaching the row
      const list  = row.closest('.playlist-entries');
      const block = list?.closest('.playlist-block');
      this.removeEntry(playlist.id, entry.id, playlist);
      row.remove();
      if (list && !list.querySelector('.playlist-entry-row')) {
        list.innerHTML = '';
        list.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
      }
      _syncEntrySteppers(list, playlist);
      _syncGameCountChip(block, playlist, PlaylistsManager.main);
      // Sync the portaled picker overlay via the hook exposed on the picker element.
      block?.querySelector('.playlist-game-picker')?._syncPickerRow(entry.gameId);
    });

    // Duplicate — single click: duplicate this entry (or the whole selected group
    // if selection mode is active and this entry is part of the selected group).
    // Ctrl+Click: open the dup bar to set a repeat count (same group awareness).
    const dupBtn = _el('button', 'playlist-entry-duplicate-btn');
    dupBtn.innerHTML = icons.copy;
    createCustomTooltip(dupBtn, '[Клик / D] Дублировать в конец плейлиста [Ctrl + Клик] Задать количество копий');
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      const entryList = row.closest('.playlist-entries');

      // Resolve the group to duplicate: if selection mode is active AND this
      // entry is selected, collect the full contiguous selected run (same
      // algorithm as group drag). Otherwise fall back to just this entry.
      const getGroupIds = () => {
        if (!entryList?.classList.contains('playlist-entries--selection')) return null;
        if (!row.classList.contains('playlist-entry-row--selected')) return null;
        const allRows = Array.from(entryList.querySelectorAll('.playlist-entry-row'));
        const idx = allRows.indexOf(row);
        let lo = idx, hi = idx;
        while (lo > 0 && allRows[lo - 1].classList.contains('playlist-entry-row--selected')) lo--;
        while (hi < allRows.length - 1 && allRows[hi + 1].classList.contains('playlist-entry-row--selected')) hi++;
        return allRows.slice(lo, hi + 1).map(r => r.dataset.entryId).filter(Boolean);
      };

      if (e.ctrlKey) {
        if (entryList) this._toggleDupBar(playlist, entry, entryList, getGroupIds());
        return;
      }

      const groupIds = getGroupIds();
      if (groupIds && groupIds.length > 1) {
        // Group duplicate — one copy of the whole contiguous selected run
        const newEntries = this.bulkDuplicateEntriesN(playlist.id, groupIds, 1);
        if (!newEntries.length) return;
        entryList.querySelector('.playlist-entries-empty')?.remove();
        newEntries.forEach((ne, i) => {
          playlist.entries.push(ne);
          const newRow = this._buildEntryRow(playlist, ne, null, false, playlist.entries.length - newEntries.length + i);
          entryList.appendChild(newRow);
        });
        this._attachEntryDrag(entryList, playlist.id, this._selectedEntries[playlist.id] ??= new Set());
        _syncGameCountChip(entryList.closest('.playlist-block'), playlist, PlaylistsManager.main);
        return;
      }

      // Single-entry duplicate (original behaviour)
      const copy = this.duplicateEntry(playlist.id, entry.id);
      if (!copy) return;
      if (!entryList) return;
      playlist.entries.push(copy);
      entryList.querySelector('.playlist-entries-empty')?.remove();
      const newRow = this._buildEntryRow(playlist, copy, null, false, playlist.entries.length - 1);
      entryList.appendChild(newRow);
      this._attachEntryDrag(entryList, playlist.id, this._selectedEntries[playlist.id] ??= new Set());
      _syncGameCountChip(entryList.closest('.playlist-block'), playlist, PlaylistsManager.main);
    });

    // Per-entry play button — starts the playlist from this entry
    const entryPlayBtn = _el('button', 'playlist-entry-play-btn');
    entryPlayBtn.innerHTML = icons.start;
    createCustomTooltip(entryPlayBtn, 'Начать плейлист с этой игры');
    entryPlayBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Start playlist from this specific entry index
      const playlists = this.load();
      const p = playlists.find(pl => pl.id === playlist.id);
      if (!p || entryIndex >= p.entries.length) return;
      const targetEntry = p.entries[entryIndex];
      const game = this.main.gamesManager.findGameById(targetEntry.gameId);
      if (!game) { alert('⚠️ Игра не найдена.'); return; }
      setActivePlaylistSession({ playlistId: playlist.id, entryIndex, remainingRepeats: targetEntry.repeatCount, remainingCycles: p.repeatCount ?? 1 });
      window.location.href = _generatePlaylistEntryLink(this.main, game, targetEntry);
    });

    // Params override button — toggles the inline param picker
    const paramsBtn = _el('button', 'playlist-entry-params-btn');
    paramsBtn.innerHTML = icons.parameters;
    _syncParamsBtnState(paramsBtn, entry.params);

    paramsBtn.addEventListener('click', e => {
      e.stopPropagation();

      // Ctrl+Click: clear all overrides immediately
      if (e.ctrlKey) {
        if (!_hasEntryParamOverrides(entry.params)) return;
        entry.params = {};
        PlaylistsManager.setEntryParams(playlist.id, entry.id, {});
        _syncParamsBtnState(paramsBtn, entry.params);
        // Close the params panel if it's open for this row
        const openSection = row.nextElementSibling?.classList.contains('playlist-entry-params')
          ? row.nextElementSibling : null;
        if (openSection) {
          openSection.remove();
          row.classList.remove('playlist-entry-row--params-open');
        }
        // Refresh the label tooltip to reflect cleared overrides
        const game = PlaylistsManager.main?.gamesManager?.findGameById(entry.gameId);
        if (game) {
          const label = row.querySelector('.playlist-entry-label');
          if (label) _refreshEntryLabelTooltip(label, game, entry.params);
        }
        return;
      }

      const existing = row.nextElementSibling?.classList.contains('playlist-entry-params')
        ? row.nextElementSibling : null;
      if (existing) {
        existing.remove();
        row.classList.remove('playlist-entry-row--params-open');
        return;
      }
      // Collapse any other open params panel in this entries list
      const entryList = row.closest('.playlist-entries');
      if (entryList) {
        entryList.querySelectorAll('.playlist-entry-params').forEach(openSection => {
          const prevRow = openSection.previousElementSibling;
          if (prevRow) prevRow.classList.remove('playlist-entry-row--params-open');
          openSection.remove();
        });
        // Close the smart-select filter row if open (mutual exclusion)
        const msBar = entryList.querySelector('.playlist-multiselect-bar');
        if (msBar?._closeFilterRow) msBar._closeFilterRow();
      }
      if (!entry.params) entry.params = {};
      const section = _buildParamsSection(playlist, entry, paramsBtn);
      row.parentNode.insertBefore(section, row.nextSibling);
      row.classList.add('playlist-entry-row--params-open');
      // Measure the row height so the params panel can stick flush below it.
      requestAnimationFrame(() => {
        const block = row.closest('.playlist-block');
        if (block) block.style.setProperty('--playlist-entry-row-height', `${row.offsetHeight}px`);
      });
    });

    // Entry rename button — sets a custom display label (stored in entry.label).
    // Does not affect the game itself or the picker. Ctrl+Click clears the label.
    const entryRenameBtn = _el('button', 'playlist-entry-rename-btn');
    entryRenameBtn.innerHTML = icons.rename;
    const _syncEntryRenameBtnState = () => {
      const hasLabel = !!entry.label;
      entryRenameBtn.classList.toggle('has-label', hasLabel);
      updateTooltipContent(entryRenameBtn, hasLabel
        ? '[Клик / R] Изменить название [Ctrl + Клик] Сбросить к исходному'
        : '[Клик / R] Задать своё название для этой игры в плейлисте');
    };
    _syncEntryRenameBtnState();
    entryRenameBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (e.ctrlKey) {
        if (!entry.label) return;
        entry.label = undefined;
        PlaylistsManager.setEntryLabel(playlist.id, entry.id, null);
        const gtype = game ? (gameTypes[game.params.gametype] || game.params.gametype) : null;
        const defaultName = game ? (game.params.vocName ? `«${game.params.vocName}»` : gtype) : label.textContent;
        label.textContent = defaultName;
        label.classList.remove('playlist-entry-label--custom');
        _refreshEntryLabelTooltip(label, game, entry.params ?? {}, null, null);
        _syncEntryRenameBtnState();
        return;
      }
      if (row.querySelector('.playlists-create-name-row')) return; // already open
      label.style.display = 'none';
      const wrap = PlaylistsManager._buildInlineRenameInput(
        entry.label ?? '',
        'Название игры',
        val => {
          entry.label = val;
          PlaylistsManager.setEntryLabel(playlist.id, entry.id, val);
          label.textContent = val;
          label.classList.add('playlist-entry-label--custom');
          _refreshEntryLabelTooltip(label, game, entry.params ?? {}, null, val);
          _syncEntryRenameBtnState();
          wrap.remove();
          label.style.display = '';
        },
        () => {
          wrap.remove();
          label.style.display = '';
        }
      );
      label.insertAdjacentElement('afterend', wrap);
    });

    const leftActions = _el('div', 'playlist-entry-left-actions');
    leftActions.append(entryPlayBtn, handle, dupBtn);

    const rightActions = _el('div', 'playlist-entry-right-actions');
    rightActions.append(stepper, paramsBtn, entryRenameBtn, removeBtn);

    row.append(leftActions, label, rightActions, playCountBadge);

    // ── Checkbox — always in DOM; CSS hides it until playlist-entries--selection ──
    {
      const sel        = PlaylistsManager._selectedEntries[playlist.id] ??= new Set();
      const isSelected = sel.has(entry.id);
      const cb = document.createElement('input');
      cb.type            = 'checkbox';
      cb.className       = 'playlist-entry-checkbox';
      cb.dataset.entryId = entry.id;
      cb.checked         = isSelected;
      if (isSelected) row.classList.add('playlist-entry-row--selected');

      cb.addEventListener('change', e => {
        e.stopPropagation();
        if (cb.checked) sel.add(entry.id);
        else sel.delete(entry.id);
        row.classList.toggle('playlist-entry-row--selected', cb.checked);
        // Live-update bar count and track latest touched entry for name chip
        const entryList = row.closest('.playlist-entries');
        const countSpan = entryList?.querySelector('.playlist-multiselect-count');
        if (countSpan) countSpan.textContent = `${sel.size}`;
        const msBar = entryList?.querySelector('.playlist-multiselect-bar');
        if (msBar?._setSeedEntry) msBar._setSeedEntry(entry.id);
      });

      row.prepend(cb);
    }

    return row;
  },

  // ── Generic vertical drag-to-reorder ────────────────────────────────────
  // Shared by both entry rows and playlist blocks — zero duplication.
  //
  // opts.itemSelector     CSS selector for draggable items inside container
  // opts.handleSelector   CSS selector for the drag handle element
  // opts.draggingClass    class added to the item while it is being dragged
  // opts.onReorder        (fromIndex, toIndex) => void — called on single-item drop
  // opts.onGroupReorder   (newEntryIds[]) => void — called on multi-item group drop
  //
  // Placeholder visual is always .playlist-entry-placeholder so both drag
  // contexts share the same dashed-border appearance without any extra CSS.
  // Multi-select group drag: when the grabbed item is selected and inside a
  // selection-mode container, the entire contiguous run of selected items drags
  // together as one unit regardless of which handle inside the group is used.
  // Autoscroll fires in both single and group modes when the cursor approaches
  // the top or bottom edge of the nearest scrollable ancestor.
  _attachSortableDrag(container, { itemSelector, handleSelector, draggingClass, onReorder, onGroupReorder, onStart, onEnd }) {

    let dragEl = null, placeholder = null, startY = 0, startIdx = 0;
    let dragGroup = [];         // [dragEl] for single, full contiguous run for group
    const scrollRAF = [null];   // mutable cancel handle for _startAutoscroll
    let dragScrollEl   = null;  // scrollable ancestor captured at drag start
    let dragScrollBase = 0;     // scrollTop at drag start — used to correct translateY

    const getItems = () => Array.from(container.querySelectorAll(itemSelector));

    container.addEventListener('mousedown', e => {
      const handle = e.target.closest(handleSelector);
      if (!handle) return;
      // Ensure the handle belongs to an item directly owned by this container,
      // not to an item inside a nested sortable (e.g. entry handles vs block handles).
      const item = handle.closest(itemSelector);
      if (!item || item.parentNode !== container) return;
      e.preventDefault();

      // Clear any leftover placeholders from a previous interrupted drag
      container.querySelectorAll('.playlist-entry-placeholder').forEach(p => p.remove());

      dragEl = item;
      startY = e.clientY;
      // Capture the scrollable ancestor and its current scrollTop so that
      // autoscroll-induced position changes can be compensated in onMove.
      dragScrollEl   = _findScrollParent(container);
      dragScrollBase = dragScrollEl ? dragScrollEl.scrollTop : 0;

      // ── Determine drag group ───────────────────────────────────────────────
      // Group drag activates only for entry rows that are selected inside an
      // active selection-mode container, and only when onGroupReorder is provided.
      const isGroupCandidate = onGroupReorder &&
        item.classList.contains('playlist-entry-row--selected') &&
        !!item.closest('.playlist-entries--selection');

      if (isGroupCandidate) {
        const allItems = getItems();
        const idx = allItems.indexOf(dragEl);
        let lo = idx, hi = idx;
        while (lo > 0 && allItems[lo - 1].classList.contains('playlist-entry-row--selected')) lo--;
        while (hi < allItems.length - 1 && allItems[hi + 1].classList.contains('playlist-entry-row--selected')) hi++;
        dragGroup = allItems.slice(lo, hi + 1);
      } else {
        dragGroup = [dragEl];
      }

      startIdx = getItems().indexOf(dragGroup[0]);

      // Set grabbing cursor on the whole document while dragging
      document.body.classList.add('playlist-drag-active');

      if (dragGroup.length > 1) {
        // ── Group drag ───────────────────────────────────────────────────────
        // Measure every item before detaching, then use a single-row placeholder
        // so group drag and single drag have the same placeholder height.
        const rects = dragGroup.map(el => el.getBoundingClientRect());
        const singleRowHeight = rects[0].height;

        placeholder = _el('div', 'playlist-entry-placeholder');
        placeholder.style.height = singleRowHeight + 'px';
        // Stamp the group count so CSS ::after can display "×N"
        placeholder.dataset.groupCount = dragGroup.length;
        // CSS content: attr() only works with string attributes — set a pre-formatted label.
        // Only show the badge for groups of 2+; ×1 is never shown (single drag).
        placeholder.dataset.groupCountLabel = `×${dragGroup.length}`;
        container.insertBefore(placeholder, dragGroup[0]);

        // Items stay inside the container — position:fixed (set via CSS class)
        // takes them out of flow while keeping them inside .playlists-manager-popup
        // so all CSS rules remain in effect. position:fixed naturally escapes
        // overflow:hidden. Only the measured pixel coords are set as inline styles;
        // all static visual properties (position, z-index, opacity, margin, box-shadow)
        // live in the .playlist-entry-row--group-dragging CSS rule.
        dragGroup.forEach((el, i) => {
          el._dragOrigTop = rects[i].top;
          el.style.top   = rects[i].top + 'px';
          el.style.left  = rects[i].left + 'px';
          el.style.width = rects[i].width + 'px';
          // Stagger depth: first item floats highest, rest cascade behind
          el.style.setProperty('--drag-stack-offset', `${i * 3}px`);
          el.classList.add('playlist-entry-row--group-dragging');
        });
      } else {
        // ── Single drag — fixed-position (same as group drag) ─────────────────
        // Using position:fixed makes the element scroll-immune: no translateY
        // compensation is needed and the runaway-autoscroll bug is impossible.
        if (onStart) onStart(dragEl);
        // Re-measure after onStart — it may have collapsed content (e.g. playlist content).
        const rect = dragEl.getBoundingClientRect();
        dragEl._dragOrigTop = rect.top;
        dragEl.style.top   = rect.top  + 'px';
        dragEl.style.left  = rect.left + 'px';
        dragEl.style.width = rect.width + 'px';
        dragEl.style.setProperty('--drag-stack-offset', '0px');
        dragEl.classList.add(draggingClass);

        const placeholderHeight = rect.height;
        placeholder = _el('div', 'playlist-entry-placeholder');
        placeholder.style.height = placeholderHeight + 'px';
        dragEl.parentNode.insertBefore(placeholder, dragEl);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const onMove = e => {
      if (!dragEl) return;
      const dy = e.clientY - startY;

      // Both single and group drag now use position:fixed — immune to scroll.
      if (dragGroup.length > 1) {
        dragGroup.forEach(el => { el.style.top = (el._dragOrigTop + dy) + 'px'; });
      } else {
        dragEl.style.top = (dragEl._dragOrigTop + dy) + 'px';
      }

      // Move placeholder to reflect drop target among non-dragged items.
      // For group drag the items are still in the container but position:fixed,
      // so we must explicitly exclude them from the hit-test list.
      const items = dragGroup.length > 1
        ? getItems().filter(r => !dragGroup.includes(r))
        : getItems().filter(r => r !== dragEl);
      let insertBefore = null;
      const movingUp = e.clientY < startY;
      for (const r of items) {
        const rRect = r.getBoundingClientRect();
        // Group drag: fixed-positioned elements still visually occupy their
        // original space, so the naive midpoint snaps one slot too late when
        // moving upward. Bias the threshold toward the bottom of the row when
        // going up so the placeholder commits to the new slot at the right moment.
        // Single drag uses the exact midpoint — it's translateY-based and already
        // correct in both directions.
        const threshold = (dragGroup.length > 1 && movingUp)
          ? rRect.top + rRect.height * 0.65
          : rRect.top + rRect.height * 0.5;
        if (e.clientY < threshold) { insertBefore = r; break; }
      }
      if (insertBefore) container.insertBefore(placeholder, insertBefore);
      else container.appendChild(placeholder);

      _startAutoscroll(scrollRAF, dragScrollEl, e.clientY);
    };

    const onUp = () => {
      if (!dragEl) return;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(scrollRAF[0]);

      document.body.classList.remove('playlist-drag-active');

      if (dragGroup.length > 1) {
        // Clear inline styles (only the measured pixel coords were set inline;
        // static visual properties are handled by the CSS class removed below).
        dragGroup.forEach(el => {
          ['top', 'left', 'width']
            .forEach(p => { el.style[p] = ''; });
          el.style.removeProperty('--drag-stack-offset');
          el.classList.remove('playlist-entry-row--group-dragging');
          delete el._dragOrigTop;
          container.insertBefore(el, placeholder);
        });
        placeholder.remove();

        // Report the full new order so the data layer can do a single atomic save.
        onGroupReorder(getItems().map(el => el.dataset.entryId).filter(Boolean));
      } else {
        dragEl.classList.remove(draggingClass);
        dragEl.style.transform = '';
        dragEl.style.width     = '';
        dragEl.style.top       = '';
        dragEl.style.left      = '';
        dragEl.style.removeProperty('--drag-stack-offset');
        delete dragEl._dragOrigTop;
        placeholder.replaceWith(dragEl);

        const finalIdx = getItems().indexOf(dragEl);
        if (finalIdx !== startIdx) onReorder(startIdx, finalIdx);

        if (onEnd) onEnd(dragEl);
      }

      // The browser fires a click event after mouseup on the same element.
      // For playlist blocks that click would toggle expand/collapse, so we
      // swallow exactly one click in the capture phase before it reaches any handler.
      document.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });

      dragEl = null; placeholder = null; dragGroup = [];
      dragScrollEl = null; dragScrollBase = 0;
    };
  },

  // ── Multi-select action bar ────────────────────────────────────────────────
  // entryList is passed so that select-all / deselect / exit can update
  // checkboxes and row classes in-place without a full refresh().
  _buildMultiSelectBar(playlist, sel, entryList) {
    const bar           = _el('div', 'playlist-multiselect-bar');
    // Cached once — bar and entryList are both children of this block and it never changes.
    const playlistBlock = entryList.closest('.playlist-block');

    // ── Smart-select: apply a filter, select matching entries, deselect non-matching ──
    // seedEntryId     is set by onActivate (long-press); reference point for name chip.
    // latestSelectedId tracks the last entry the user manually checked/unchecked so
    //                  the name chip always reflects the most recently touched entry.
    let seedEntryId      = null;
    let latestSelectedId = null;

    // activeFilters: each key holds a Set of accepted values (OR within a key, AND across keys).
    const activeFilters = {
      name:     new Set(),
      gamekind: new Set(), // values: 'voc' | 'standard'
      type:     new Set(),
      timeout:  new Set(),
      idletime: new Set(),
      override: new Set(), // values: 'yes' | 'no'
      repeat:   new Set(), // values: number (repeatCount)
    };

    const applyActiveFilters = () => {
      const freshPlaylists = this.load();
      const fp = freshPlaylists.find(p => p.id === playlist.id);
      if (!fp) return;
      const hasAny = Object.values(activeFilters).some(s => s.size > 0);
      // When all chips are deactivated, clear the selection entirely
      if (!hasAny) {
        sel.clear();
        entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => {
          cb.checked = false;
          cb.closest('.playlist-entry-row')?.classList.remove('playlist-entry-row--selected');
        });
        syncCount();
        return;
      }
      sel.clear();
      fp.entries.forEach(entry => {
        const game      = this.main?.gamesManager?.findGameById(entry.gameId);
        const eName     = game?.id ?? null;
        const eGamekind = game?.params?.gametype === 'voc' ? 'voc' : 'standard';
        const eType     = entry.params?.type     ?? game?.params?.type;
        const eTM       = entry.params?.timeout  ?? game?.params?.timeout;
        const eAFK      = entry.params?.idletime ?? game?.params?.idletime;
        const eHasOv    = !!(entry.params && ('type' in entry.params || 'timeout' in entry.params || 'idletime' in entry.params));
        // AND across groups, OR within each group
        if (activeFilters.name.size     > 0 && !activeFilters.name.has(eName))                       return;
        if (activeFilters.gamekind.size > 0 && !activeFilters.gamekind.has(eGamekind))               return;
        if (activeFilters.type.size     > 0 && !activeFilters.type.has(eType))                       return;
        if (activeFilters.timeout.size  > 0 && !activeFilters.timeout.has(eTM))                      return;
        if (activeFilters.idletime.size > 0 && !activeFilters.idletime.has(eAFK))                    return;
        if (activeFilters.override.size > 0 && !activeFilters.override.has(eHasOv ? 'yes' : 'no'))   return;
        if (activeFilters.repeat.size   > 0 && !activeFilters.repeat.has(entry.repeatCount ?? 1))    return;
        sel.add(entry.id);
      });
      // Sync checkboxes and row highlights
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => {
        const match = sel.has(cb.dataset.entryId);
        cb.checked = match;
        cb.closest('.playlist-entry-row')?.classList.toggle('playlist-entry-row--selected', match);
      });
      syncCount();
    };

    const updateBarHeight = () => {
      requestAnimationFrame(() => {
        if (playlistBlock) playlistBlock.style.setProperty('--playlist-multiselect-bar-height', `${bar.offsetHeight}px`);
      });
    };

    // ── Build the smart-select filter row ────────────────────────────────────
    // Called fresh each time the filter row is opened or seedEntryId changes,
    // so all chips always reflect the current playlist data in realtime.
    const buildFilterRow = () => {
      const row = _el('div', 'playlist-smartselect-row');

      const freshPlaylists = this.load();
      const fp = freshPlaylists.find(p => p.id === playlist.id);
      if (!fp || !fp.entries.length) {
        row.appendChild(_el('span', 'playlist-smartselect-empty', 'Нет доступных фильтров'));
        return row;
      }

      // Effective param helpers — entry override takes priority over game default
      const effectiveType     = e => e.params?.type     ?? this.main?.gamesManager?.findGameById(e.gameId)?.params?.type;
      const effectiveTimeout  = e => e.params?.timeout  ?? this.main?.gamesManager?.findGameById(e.gameId)?.params?.timeout;
      const effectiveIdletime = e => e.params?.idletime ?? this.main?.gamesManager?.findGameById(e.gameId)?.params?.idletime;

      const seedEntry = fp.entries.find(e => e.id === (latestSelectedId ?? seedEntryId));
      const seedGame  = seedEntry ? this.main?.gamesManager?.findGameById(seedEntry.gameId) : null;

      // Shared toggle helper — flips chip active state, mirrors into activeFilters, re-filters.
      const toggleChip = (chip, filterKey, value, forceState) => {
        const active = forceState !== undefined ? forceState : !chip.classList.contains('active');
        chip.classList.toggle('active', active);
        active ? activeFilters[filterKey].add(value) : activeFilters[filterKey].delete(value);
        applyActiveFilters();
      };

      // ── Name chip — shows display name of latest selected / seed entry ──────
      // Works for all game types: uses vocName when present, falls back to gametype label.
      const seedGameId   = seedGame?.id ?? null;
      const seedVocName  = seedGame?.params?.vocName ?? null;
      const seedGtype    = seedGame ? (gameTypes[seedGame.params?.gametype] || seedGame.params?.gametype) : null;
      const seedDispName = seedVocName ? `«${seedVocName}»` : (seedGtype ?? null);
      const nameChip = _el('button', 'playlist-smartselect-chip');
      nameChip.textContent         = seedDispName ?? '—';
      nameChip.disabled            = !seedGameId;
      nameChip.dataset.filterKey   = 'name';
      nameChip.dataset.filterValue = seedGameId ?? '';
      if (seedGameId && activeFilters.name.has(seedGameId)) nameChip.classList.add('active');
      createCustomTooltip(nameChip, _smartChipTooltip('Фильтр по названию'));
      row.appendChild(nameChip);
      // Expose for realtime label update when seed changes
      row._nameChip = nameChip;

      // ── Game-kind chips — Словари / Стандартные ──────────────────────────────
      // Only rendered when the playlist contains both kinds (otherwise the chip
      // would either select everything or nothing — both useless).
      const hasVoc      = fp.entries.some(e => this.main?.gamesManager?.findGameById(e.gameId)?.params?.gametype === 'voc');
      const hasStandard = fp.entries.some(e => this.main?.gamesManager?.findGameById(e.gameId)?.params?.gametype !== 'voc');
      if (hasVoc && hasStandard) {
        const vocKindChip = _el('button', 'playlist-smartselect-chip');
        vocKindChip.textContent         = 'Словари';
        vocKindChip.dataset.filterKey   = 'gamekind';
        vocKindChip.dataset.filterValue = 'voc';
        if (activeFilters.gamekind.has('voc')) vocKindChip.classList.add('active');
        createCustomTooltip(vocKindChip, _smartChipTooltip('Фильтр: только словарные игры'));
        row.appendChild(vocKindChip);

        const stdKindChip = _el('button', 'playlist-smartselect-chip');
        stdKindChip.textContent         = 'Стандартные';
        stdKindChip.dataset.filterKey   = 'gamekind';
        stdKindChip.dataset.filterValue = 'standard';
        if (activeFilters.gamekind.has('standard')) stdKindChip.classList.add('active');
        createCustomTooltip(stdKindChip, _smartChipTooltip('Фильтр: только стандартные игры'));
        row.appendChild(stdKindChip);
      }

      // ── Visibility chips — ALL unique type values across the playlist ─────
      const uniqueTypes = [...new Set(fp.entries.map(e => effectiveType(e)).filter(Boolean))].sort();
      uniqueTypes.forEach(t => {
        const chip = _el('button', 'playlist-smartselect-chip');
        chip.textContent             = visibilities[t] || t;
        chip.dataset.filterKey       = 'type';
        chip.dataset.filterValue     = t;
        if (activeFilters.type.has(t)) chip.classList.add('active');
        createCustomTooltip(chip, _smartChipTooltip(`Фильтр по режиму «${visibilities[t] || t}»`));
        row.appendChild(chip);
      });

      // ── TM chips — ALL unique timeout values across the playlist ──────────
      const uniqueTMs = [...new Set(fp.entries.map(e => effectiveTimeout(e)).filter(v => v != null))].sort((a, b) => a - b);
      uniqueTMs.forEach(tm => {
        const chip = _el('button', 'playlist-smartselect-chip');
        chip.textContent             = `TM ${tm}`;
        chip.dataset.filterKey       = 'timeout';
        chip.dataset.filterValue     = String(tm);
        if (activeFilters.timeout.has(tm)) chip.classList.add('active');
        createCustomTooltip(chip, _smartChipTooltip(`Фильтр по TM ${tm}`));
        row.appendChild(chip);
      });

      // ── AFK chips — ALL unique idletime values across the playlist ────────
      const uniqueAFKs = [...new Set(fp.entries.map(e => effectiveIdletime(e)).filter(v => v != null))].sort((a, b) => a - b);
      uniqueAFKs.forEach(afk => {
        const chip = _el('button', 'playlist-smartselect-chip');
        chip.textContent             = `AFK ${afk}`;
        chip.dataset.filterKey       = 'idletime';
        chip.dataset.filterValue     = String(afk);
        if (activeFilters.idletime.has(afk)) chip.classList.add('active');
        createCustomTooltip(chip, _smartChipTooltip(`Фильтр по AFK ${afk}`));
        row.appendChild(chip);
      });

      // ── С пер. / Без пер. chips ───────────────────────────────────────────
      const hasOverride = en => !!(en.params && ('type' in en.params || 'timeout' in en.params || 'idletime' in en.params));

      const withChip = _el('button', 'playlist-smartselect-chip');
      withChip.textContent             = 'С пер.';
      withChip.dataset.filterKey       = 'override';
      withChip.dataset.filterValue     = 'yes';
      if (activeFilters.override.has('yes')) withChip.classList.add('active');
      createCustomTooltip(withChip, _smartChipTooltip('Фильтр: с переопределёнными параметрами'));
      row.appendChild(withChip);

      const noChip = _el('button', 'playlist-smartselect-chip');
      noChip.textContent               = 'Без пер.';
      noChip.dataset.filterKey         = 'override';
      noChip.dataset.filterValue       = 'no';
      if (activeFilters.override.has('no')) noChip.classList.add('active');
      createCustomTooltip(noChip, _smartChipTooltip('Фильтр: без переопределённых параметров'));
      row.appendChild(noChip);

      // ── Repeat chips — one per unique repeatCount value in the playlist ─────
      const uniqueReps = [...new Set(fp.entries.map(e => e.repeatCount ?? 1))].sort((a, b) => a - b);
      uniqueReps.forEach(rep => {
        const chip = _el('button', 'playlist-smartselect-chip');
        chip.textContent             = `×${rep}`;
        chip.dataset.filterKey       = 'repeat';
        chip.dataset.filterValue     = String(rep);
        if (activeFilters.repeat.has(rep)) chip.classList.add('active');
        createCustomTooltip(chip, _smartChipTooltip(`Фильтр по количеству повторов ×${rep}`));
        row.appendChild(chip);
      });

      // ── Strip action buttons + chip drag-to-toggle ────────────────────────
      // Single click = exclusive. Ctrl+Click / drag = additive multi-select.
      const ssVal = c => {
        const k = c.dataset.filterKey, r = c.dataset.filterValue;
        return (k === 'timeout' || k === 'idletime' || k === 'repeat') ? Number(r) : r;
      };
      const syncSsActions = _buildChipStripActions(
        row, '.playlist-smartselect-chip',
        chips => chips.forEach(c => toggleChip(c, c.dataset.filterKey, ssVal(c), false)),
        chips => chips.forEach(c => toggleChip(c, c.dataset.filterKey, ssVal(c), true)),
        'Снять все фильтры',
        'Выбрать все фильтры',
      );

      _attachChipDrag(row, '.playlist-smartselect-chip', (chip, active, isMulti) => {
        const key   = chip.dataset.filterKey;
        const raw   = chip.dataset.filterValue;
        const value = (key === 'timeout' || key === 'idletime' || key === 'repeat') ? Number(raw) : raw;
        if (!isMulti && active) {
          // Exclusive: deselect every other active chip before activating this one
          row.querySelectorAll('.playlist-smartselect-chip.active').forEach(c => {
            if (c === chip) return;
            const k = c.dataset.filterKey;
            const r = c.dataset.filterValue;
            const v = (k === 'timeout' || k === 'idletime' || k === 'repeat') ? Number(r) : r;
            toggleChip(c, k, v, false);
          });
        }
        toggleChip(chip, key, value, active);
        syncSsActions();
      });

      return row;
    };

    let filterRow     = null;
    let filterRowOpen = false;

    // Internal helper — close filter row from outside (e.g. when entry params open)
    const closeFilterRow = () => {
      if (!filterRowOpen) return;
      filterRow?.remove();
      filterRow     = null;
      filterRowOpen = false;
      Object.values(activeFilters).forEach(s => s.clear());
      filterBtn.classList.remove('active');
      bar.classList.remove('playlist-multiselect-bar--filter-open');
      updateBarHeight();
    };

    const refreshFilterRow = () => {
      if (!filterRowOpen || !filterRow) return;
      const newRow = buildFilterRow();
      filterRow.replaceWith(newRow);
      filterRow = newRow;
      updateBarHeight();
    };

    // Shared helper: exit selection mode in-place without refresh()
    const exitSelectionMode = () => {
      closeFilterRow();
      sel.clear();
      this._selectionMode.delete(playlist.id);
      entryList.classList.remove('playlist-entries--selection');
      window.getSelection()?.removeAllRanges();
      // Multiselect bar is now hidden — reset its height var so the dup bar
      // (if open) re-sticks directly below the playlist header.
      if (playlistBlock) playlistBlock.style.setProperty('--playlist-multiselect-bar-height', '0px');
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => { cb.checked = false; });
      entryList.querySelectorAll('.playlist-entry-row--selected').forEach(r => r.classList.remove('playlist-entry-row--selected'));
      syncCount();
      // Also close the bulk params panel if it was open
      const bulkParams = entryList.querySelector('.playlist-bulk-params');
      if (bulkParams) {
        bulkParams.remove();
        bar.classList.remove('playlist-multiselect-bar--params-open');
        paramsBtn.classList.remove('active');
      }
    };

    // setSeedEntry: called by long-press onActivate; also rebuilds the open filter
    // row so name chip and all data-driven chips update in realtime.
    const setSeedEntry = id => {
      seedEntryId      = id;
      latestSelectedId = id;
      if (filterRowOpen && filterRow) {
        // If the name filter was active under the old game, migrate it to the
        // new one so the rebuilt chip restores its active state correctly.
        if (activeFilters.name.size > 0) {
          const fp = this.load().find(p => p.id === playlist.id);
          const entry = fp?.entries.find(e => e.id === id);
          const newGameId = this.main?.gamesManager?.findGameById(entry?.gameId)?.id ?? null;
          activeFilters.name.clear();
          if (newGameId) activeFilters.name.add(newGameId);
        }
        refreshFilterRow();
      }
    };

    // ── Left side: count + select-all + deselect + smart-filter + exit ───────
    const countSpan = _el('span', 'playlist-multiselect-count', `${sel.size}`);

    const { wrap: btnsWrap, deselectBtn: deselBtn, selectBtn: selAllBtn } =
      _buildSelectAllBtns('Снять выделение', 'Выбрать все');

    const syncCount = () => { countSpan.textContent = `${sel.size}`; };

    selAllBtn.addEventListener('click', e => {
      e.stopPropagation();
      playlist.entries.forEach(en => sel.add(en.id));
      // Tick every checkbox and highlight every row in-place
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => {
        cb.checked = true;
        cb.closest('.playlist-entry-row')?.classList.add('playlist-entry-row--selected');
      });
      syncCount();
    });

    deselBtn.addEventListener('click', e => {
      e.stopPropagation();
      sel.clear();
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => { cb.checked = false; });
      entryList.querySelectorAll('.playlist-entry-row--selected').forEach(r => r.classList.remove('playlist-entry-row--selected'));
      syncCount();
    });

    const invertBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--neutral');
    invertBtn.textContent = 'Инвертировать';
    createCustomTooltip(invertBtn, 'Инвертировать выделение');
    invertBtn.addEventListener('click', e => {
      e.stopPropagation();
      playlist.entries.forEach(en => {
        if (sel.has(en.id)) sel.delete(en.id);
        else sel.add(en.id);
      });
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => {
        const selected = sel.has(cb.dataset.entryId);
        cb.checked = selected;
        cb.closest('.playlist-entry-row')?.classList.toggle('playlist-entry-row--selected', selected);
      });
      syncCount();
    });

    // Filter button — SVG icon, toggles smart-select row
    const filterBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--neutral');
    filterBtn.innerHTML = icons.menu;
    createCustomTooltip(filterBtn, 'Выбрать по шаблону');
    filterBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (filterRowOpen) {
        closeFilterRow();
      } else {
        // Close bulk params if open (mutual exclusion)
        const existingBulk = entryList.querySelector('.playlist-bulk-params');
        if (existingBulk) {
          existingBulk.remove();
          bar.classList.remove('playlist-multiselect-bar--params-open');
          paramsBtn.classList.remove('active');
        }
        // Close any open per-entry params panels (mutual exclusion)
        entryList.querySelectorAll('.playlist-entry-params:not(.playlist-bulk-params)').forEach(ep => {
          ep.previousElementSibling?.classList.remove('playlist-entry-row--params-open');
          ep.remove();
        });
        filterRow = buildFilterRow();
        bar.after(filterRow);
        filterRowOpen = true;
        filterBtn.classList.add('active');
        bar.classList.add('playlist-multiselect-bar--filter-open');
        updateBarHeight();
      }
    });

    const exitBtn = _el('button', 'playlist-multiselect-exit');
    exitBtn.innerHTML = icons.logout;
    createCustomTooltip(exitBtn, 'Выйти из режима выбора');
    exitBtn.addEventListener('click', e => {
      e.stopPropagation();
      exitSelectionMode();
    });

    // ── Right side: repeat stepper + duplicate + params + remove ─────────────
    const repCount      = { value: 1 };
    const repStepper    = _el('div', 'playlist-multiselect-stepper');
    const repDecBtn     = _el('button', 'playlist-stepper-btn');
    repDecBtn.innerHTML = icons.chevronLeft;
    const repCountSpan  = _el('span', 'playlist-stepper-count', '1');
    const repIncBtn     = _el('button', 'playlist-stepper-btn');
    repIncBtn.innerHTML = icons.chevronRight;
    repStepper.append(repDecBtn, repCountSpan, repIncBtn);
    createCustomTooltip(repStepper, `[Повторы] Задать всем выбранным играм ${STEPPER_DRAG_TIP}`);

    const applyBulkRepeat = () => {
      const newCount = this.bulkSetRepeat(playlist.id, [...sel], repCount.value);
      if (!newCount) return;
      // Single pass: sync local entries array + DOM stepper spans together,
      // using the already-closed-over entryList instead of re-querying the DOM.
      playlist.entries.forEach(e => {
        if (!sel.has(e.id)) return;
        e.repeatCount = newCount;
        const span = entryList
          .querySelector(`.playlist-entry-row[data-entry-id="${e.id}"] .playlist-stepper-count`);
        if (span) span.textContent = String(newCount);
      });
      if (bar._refreshFilterRow) bar._refreshFilterRow();
    };

    const onRepDec = () => {
      if (sel.size === 0) return;
      repCount.value = Math.max(1, repCount.value - 1);
      repCountSpan.textContent = String(repCount.value);
      applyBulkRepeat();
    };
    const onRepInc = () => {
      if (sel.size === 0) return;
      repCount.value++;
      repCountSpan.textContent = String(repCount.value);
      applyBulkRepeat();
    };
    _attachButtonHold(repDecBtn, onRepDec);
    _attachButtonHold(repIncBtn, onRepInc);
    _attachStepperDrag(repCountSpan, onRepDec, onRepInc);

    const dupBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--copy');
    dupBtn.innerHTML = icons.copy;
    createCustomTooltip(dupBtn, '[Клик] Дублировать выбранные [Ctrl + Клик] Задать количество копий');
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!sel.size) return;
      const selIds = [...sel];

      if (e.ctrlKey) {
        // Open the dup bar for the selected group (use the first selected entry as anchor)
        const anchorRow = entryList.querySelector('.playlist-entry-row--selected');
        const anchorId  = anchorRow?.dataset.entryId;
        const anchorEntry = anchorId ? playlist.entries.find(en => en.id === anchorId) : null;
        if (anchorEntry) this._toggleDupBar(playlist, anchorEntry, entryList, selIds);
        return;
      }

      // Single duplicate of the whole selection, in-place (no full refresh)
      const newEntries = this.bulkDuplicateEntriesN(playlist.id, selIds, 1);
      if (!newEntries.length) return;
      entryList.querySelector('.playlist-entries-empty')?.remove();
      newEntries.forEach((ne, i) => {
        playlist.entries.push(ne);
        const newRow = this._buildEntryRow(playlist, ne, null, false, playlist.entries.length - newEntries.length + i);
        entryList.appendChild(newRow);
      });
      this._attachEntryDrag(entryList, playlist.id, this._selectedEntries[playlist.id] ??= new Set());
      if (bar._refreshFilterRow) bar._refreshFilterRow();
      _syncGameCountChip(playlistBlock, playlist, PlaylistsManager.main);
    });

    const paramsBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--params');
    paramsBtn.innerHTML = icons.parameters;
    createCustomTooltip(paramsBtn, 'Задать параметры для выбранных');
    paramsBtn.addEventListener('click', e => {
      e.stopPropagation();
      const el = paramsBtn.closest('.playlist-entries');
      if (!el) return;
      const existing = el.querySelector('.playlist-bulk-params');
      if (existing) {
        existing.remove();
        bar.classList.remove('playlist-multiselect-bar--params-open');
        paramsBtn.classList.remove('active');
        return;
      }
      // Close filter row if open (mutual exclusion)
      closeFilterRow();
      paramsBtn.classList.add('active');
      bar.insertAdjacentElement('afterend', this._buildBulkParamsSection(playlist, [...sel]));
      bar.classList.add('playlist-multiselect-bar--params-open');
      requestAnimationFrame(() => {
        if (playlistBlock) playlistBlock.style.setProperty('--playlist-multiselect-bar-height', `${bar.offsetHeight}px`);
      });
    });

    const removeBtn = _el('button', 'playlist-multiselect-remove');
    removeBtn.innerHTML = icons.x;
    createCustomTooltip(removeBtn, 'Убрать выбранные из плейлиста');
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const n = sel.size;
      if (!n) return;
      const word = n === 1 ? 'игру' : n < 5 ? 'игры' : 'игр';
      if (!confirm(`Убрать ${n} ${word} из плейлиста?`)) return;
      this.bulkRemoveEntries(playlist.id, [...sel]);
      this.refresh(playlist.id);
    });

    // ── Convert repeats → interleaved entries ────────────────────────────────
    // chunkCount: how many chunks each entry is split into.
    // E.g. [A×10, B×10] with chunks=2 → A×5, B×5, A×5, B×5.
    const chunkCount    = { value: 2 };
    const chunkStepper  = _el('div', 'playlist-multiselect-stepper');
    const chunkDecBtn   = _el('button', 'playlist-stepper-btn');
    chunkDecBtn.innerHTML = icons.chevronLeft;
    const chunkSpan     = _el('span', 'playlist-stepper-count', String(chunkCount.value));
    const chunkIncBtn   = _el('button', 'playlist-stepper-btn');
    chunkIncBtn.innerHTML = icons.chevronRight;
    chunkStepper.append(chunkDecBtn, chunkSpan, chunkIncBtn);
    createCustomTooltip(chunkStepper, `[Разбивка] На сколько частей разбить повторы при конвертации ${STEPPER_DRAG_TIP}`);

    // Builds the chunk stepper tooltip: static description + live per-entry preview
    // of how the current repeatCounts would be distributed across chunks.
    const _refreshChunkTooltip = () => {
      const chunks   = chunkCount.value;
      const selected = playlist.entries.filter(e => sel.has(e.id));
      const preview  = selected.map(e => {
        const total = e.repeatCount || 1;
        const base  = Math.floor(total / chunks);
        const rem   = total % chunks;
        const dist  = [...Array(chunks)].map((_, i) => base + (i < rem ? 1 : 0))
                                        .filter(n => n > 0)
                                        .join(', ') || '—';
        return `[${_entryDisplayName(e, this.main)}] ${total} ÷ ${chunks} → ${dist}`;
      }).join('');
      updateTooltipContent(chunkStepper, `[Разбивка] На сколько частей разбить повторы при конвертации ${STEPPER_DRAG_TIP}${preview}`);
    };
    const onChunkDec = () => { chunkCount.value = Math.max(1, chunkCount.value - 1); chunkSpan.textContent = String(chunkCount.value); _refreshChunkTooltip(); };
    const onChunkInc = () => { chunkCount.value++; chunkSpan.textContent = String(chunkCount.value); _refreshChunkTooltip(); };
    _attachButtonHold(chunkDecBtn, onChunkDec);
    _attachButtonHold(chunkIncBtn, onChunkInc);
    _attachStepperDrag(chunkSpan, onChunkDec, onChunkInc);
    _attachCountDblClick(chunkSpan, { getValue: () => chunkCount.value, setValue: v => { chunkCount.value = Math.max(1, v); chunkSpan.textContent = String(chunkCount.value); } });
    chunkStepper.addEventListener('mouseenter', _refreshChunkTooltip);

    const convertBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--convert');
    convertBtn.innerHTML = icons.arrowUpDown;
    createCustomTooltip(convertBtn, 'Разбить повторы на отдельные строки с чередованием игр');
    convertBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!sel.size) return;
      this.bulkConvertRepeatsToEntries(playlist.id, [...sel], chunkCount.value);
      this._selectionMode.delete(playlist.id);
      this.refresh(playlist.id);
    });

    const left = _el('div', 'playlist-multiselect-left');
    left.append(countSpan, btnsWrap, invertBtn, filterBtn, exitBtn);
    const right = _el('div', 'playlist-multiselect-right');
    right.append(repStepper, dupBtn, paramsBtn, chunkStepper, convertBtn, removeBtn);
    bar.append(left, right);

    // Expose methods so callers (long-press, entry params) can interact
    bar._setSeedEntry      = setSeedEntry;
    bar._refreshFilterRow  = refreshFilterRow;
    bar._closeFilterRow    = closeFilterRow;
    return bar;
  },

  // ── Per-entry duplicate bar ────────────────────────────────────────────────
  // Toggle: if a dup bar for this entry is already open, close it; otherwise
  // close any other open dup bar in the list and open one for this entry.
  // groupIds: optional array of entry IDs forming the contiguous selected group;
  // when provided the bar duplicates the whole group instead of a single entry.
  _toggleDupBar(playlist, entry, entryList, groupIds = null) {
    const existing = entryList.querySelector('.playlist-dup-bar');
    if (existing) {
      const wasFor = existing.dataset.entryId === entry.id;
      existing.remove();
      if (wasFor) return; // clicked Ctrl+same row → just close
    }
    const bar = this._buildDupBar(playlist, entry, entryList, groupIds);
    // Insert right after the multiselect bar (always first child) if present,
    // otherwise prepend — so the DOM order matches the sticky stack order.
    const multiBar = entryList.querySelector('.playlist-multiselect-bar');
    if (multiBar) multiBar.insertAdjacentElement('afterend', bar);
    else entryList.prepend(bar);
    // Ensure --playlist-multiselect-bar-height is accurate so the CSS calc
    // top: header + multiselect resolves correctly even when multiselect bar
    // is hidden (height 0). Also set --playlist-dup-bar-height for anything
    // downstream that needs to account for this bar.
    requestAnimationFrame(() => {
      const block = entryList.closest('.playlist-block');
      if (!block) return;
      const msBar = entryList.querySelector('.playlist-multiselect-bar');
      block.style.setProperty('--playlist-multiselect-bar-height', `${msBar ? msBar.offsetHeight : 0}px`);
      block.style.setProperty('--playlist-dup-bar-height', `${bar.offsetHeight}px`);
    });
  },

  // groupIds: when non-null (and length > 1) the bar operates on the whole group.
  _buildDupBar(playlist, entry, entryList, groupIds = null) {
    const DUP_MAX  = 50;
    const isGroup  = Array.isArray(groupIds) && groupIds.length > 1;
    const dupCount = { value: 1 };
    const bar      = _el('div', 'playlist-dup-bar');
    bar.dataset.entryId = entry.id;

    // ── Label — shown only for group mode so the user knows what's being duplicated
    if (isGroup) {
      const label = _el('span', 'playlist-dup-label', `Группа (${groupIds.length})`);
      bar.appendChild(label);
    }

    // ── Stepper — drag or double-click count span to enter value directly ─
    const stepperWrap      = _el('div', 'playlist-multiselect-stepper');
    const decBtn           = _el('button', 'playlist-stepper-btn');
    decBtn.innerHTML       = icons.chevronLeft;
    const stepperCountSpan = _el('span', 'playlist-stepper-count', '1');
    const incBtn           = _el('button', 'playlist-stepper-btn');
    incBtn.innerHTML       = icons.chevronRight;
    stepperWrap.append(decBtn, stepperCountSpan, incBtn);
    createCustomTooltip(stepperWrap, `Количество копий (макс. ${DUP_MAX}) ${STEPPER_DRAG_TIP}`);

    const onDupDec = () => {
      dupCount.value = Math.max(1, dupCount.value - 1);
      stepperCountSpan.textContent = String(dupCount.value);
    };
    const onDupInc = () => {
      dupCount.value = Math.min(DUP_MAX, dupCount.value + 1);
      stepperCountSpan.textContent = String(dupCount.value);
    };
    _attachButtonHold(decBtn, onDupDec);
    _attachButtonHold(incBtn, onDupInc);
    _attachStepperDrag(stepperCountSpan, onDupDec, onDupInc);
    _attachCountDblClick(stepperCountSpan, {
      getValue: () => dupCount.value,
      setValue: v => { dupCount.value = v; stepperCountSpan.textContent = String(v); },
      min: 1, max: DUP_MAX,
    });

    // ── Confirm ───────────────────────────────────────────────────────────
    const confirmBtn = _el('button', 'playlist-dup-confirm');
    confirmBtn.textContent = 'Дублировать';
    confirmBtn.addEventListener('click', e => {
      e.stopPropagation();
      const n = dupCount.value;
      entryList.querySelector('.playlist-entries-empty')?.remove();

      if (isGroup) {
        // Duplicate the whole group N times
        const newEntries = this.bulkDuplicateEntriesN(playlist.id, groupIds, n);
        if (newEntries.length) {
          newEntries.forEach((ne, i) => {
            playlist.entries.push(ne);
            const newRow = this._buildEntryRow(playlist, ne, null, false, playlist.entries.length - newEntries.length + i);
            entryList.appendChild(newRow);
          });
          this._attachEntryDrag(entryList, playlist.id, this._selectedEntries[playlist.id] ??= new Set());
        }
      } else {
        // Single-entry duplicate N times via bulk helper (one save instead of N)
        const newEntries = this.bulkDuplicateEntriesN(playlist.id, [entry.id], n);
        newEntries.forEach((copy, i) => {
          playlist.entries.push(copy);
          const newRow = this._buildEntryRow(playlist, copy, null, false, playlist.entries.length - newEntries.length + i);
          entryList.appendChild(newRow);
        });
        this._attachEntryDrag(entryList, playlist.id, this._selectedEntries[playlist.id] ??= new Set());
      }

      _syncGameCountChip(entryList.closest('.playlist-block'), playlist, PlaylistsManager.main);
      bar.remove();
    });

    // ── Cancel ────────────────────────────────────────────────────────────
    const cancelBtn = _el('button', 'playlist-dup-cancel');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); bar.remove(); });

    // Esc anywhere in the bar dismisses it
    bar.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); bar.remove(); }
    });

    bar.append(stepperWrap, confirmBtn, cancelBtn);
    return bar;
  },

  // ── Bulk params panel ──────────────────────────────────────────────────────
  _buildBulkParamsSection(playlist, entryIds) {
    const section = _el('div', 'playlist-entry-params playlist-bulk-params');
    const ep = {}; // neutral — nothing pre-selected

    // Helper: remove section and clear the bar's params-open state
    const closePanel = () => {
      const bar = section.previousElementSibling?.classList.contains('playlist-multiselect-bar')
        ? section.previousElementSibling : null;
      section.remove();
      bar?.classList.remove('playlist-multiselect-bar--params-open');
    };

    // onPersist is a no-op during editing; save happens on Apply
    const syncConstraints = _buildParamsGroups(section, ep, () => {});
    syncConstraints();

    const actionRow = _el('div', 'playlist-bulk-params-actions');

    const applyBtn = _el('button', 'playlist-bulk-params-apply');
    applyBtn.textContent = 'Применить';
    applyBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!Object.keys(ep).length) { closePanel(); return; }
      this.bulkSetParams(playlist.id, entryIds, ep);
      this.refresh(playlist.id);
    });

    const clearBtn = _el('button', 'playlist-bulk-params-clear');
    clearBtn.textContent = 'Сбросить';
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.bulkSetParams(playlist.id, entryIds, { type: null, timeout: null, idletime: null });
      this.refresh(playlist.id);
    });

    const cancelBtn = _el('button', 'playlist-bulk-params-cancel');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePanel(); });

    actionRow.append(applyBtn, clearBtn, cancelBtn);
    section.appendChild(actionRow);
    return section;
  },

  // Shared inline rename input — reuses .playlists-create-name-row / .playlists-create-input
  // styles so no extra CSS is needed.
  // onConfirm(value) called with trimmed value on Enter or blur-with-value.
  // onCancel() called on Escape or blur-without-change.
  // Returns the wrapper element (playlists-create-name-row) to be inserted by caller.
  _buildInlineRenameInput(currentValue, placeholder, onConfirm, onCancel) {
    const wrap  = _el('div', 'playlists-create-name-row');
    const input = _el('input', 'playlists-create-input');
    input.type        = 'text';
    input.placeholder = placeholder;
    input.value       = currentValue;
    wrap.appendChild(input);

    attachInputClearButton(input, wrap);

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      if (val) onConfirm(val); else onCancel();
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      input.value = currentValue;
      onCancel();
    };

    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    wrap.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('blur', () => cancel());

    // Focus + select-all on next frame so the element is in the DOM first
    requestAnimationFrame(() => { input.focus(); input.select(); });

    return wrap;
  },

  _buildCreateForm(onDone) {
    const form = _el('div', 'playlists-create-form');

    // ── Name row ──────────────────────────────────────────────────────────────
    const nameRow = _el('div', 'playlists-create-name-row');
    const input   = _el('input', 'playlists-create-input');
    input.type        = 'text';
    input.placeholder = 'Название плейлиста...';

    const doCreate = () => {
      const name = input.value.trim();
      const created = this.createPlaylist(name); // handles empty name with auto-numbering
      this.expandedPlaylistId = created.id;
      onDone();
    };

    input.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });

    nameRow.append(input);
    attachInputClearButton(input, nameRow);
    form.appendChild(nameRow);

    // ── Action buttons row (sits below the name input) ────────────────────────
    const actionsRow = _el('div', 'playlists-create-actions-row');

    const createBtn = _el('button', 'playlists-create-confirm-btn');
    createBtn.innerHTML = `${icons.plus}<span>Создать</span>`;
    createBtn.addEventListener('click', e => { e.stopPropagation(); doCreate(); });

    input.addEventListener('input', () => {
      const hasText = input.value.trim().length > 0;
      if (hasText && !actionsRow.contains(createBtn)) actionsRow.append(createBtn);
      else if (!hasText) createBtn.remove();
    });

    const taskBtn = _el('button', 'playlists-create-task-btn');
    taskBtn.innerHTML = `${icons.plus}<span>Из задачи</span>`;
    createCustomTooltip(taskBtn, buildBtnTooltip('createTaskBtn'));
    taskBtn.addEventListener('click', e => {
      e.stopPropagation();
      this._createPlaylistFromDailyTask(onDone, !e.ctrlKey);
    });

    // ── Group shortcuts ────────────────────────────────────────────────────────
    if (this.main) {
      const groups = this.main.groupsManager.groups.filter(g => g.games.length > 0);
      if (groups.length) {
        const groupsToggle = _el('button', 'playlists-create-groups-toggle');
        groupsToggle.innerHTML = `${icons.plus}<span>Из группы</span>`;
        createCustomTooltip(groupsToggle, '[Клик / G] Показать / Скрыть группы для создания плейлиста');
        actionsRow.append(groupsToggle, taskBtn);

        const groupsRow = _el('div', 'playlists-create-groups-row latest-games-hidden');

        const checkExactMatch = (group) => {
          const gameIds   = group.games.map(g => g.id);
          const playlists = this.load();
          const sameName  = playlists.find(p => p.title === group.title);
          if (!sameName) return false;
          const existingIds = new Set(sameName.entries.map(en => en.gameId));
          return existingIds.size === gameIds.length && gameIds.every(id => existingIds.has(id));
        };

        groups.forEach(group => {
          const btn = _el('button', 'playlists-create-group-btn');
          btn.textContent = group.title;

          const isAlready = checkExactMatch(group);
          if (isAlready) btn.classList.add('playlists-create-group-btn--done');
          createCustomTooltip(btn, isAlready
            ? `Плейлист «${group.title}» уже создан из этой группы`
            : `Создать плейлист «${group.title}» из ${group.games.length} игр группы`);

          btn.addEventListener('click', e => {
            e.stopPropagation();

            if (checkExactMatch(group)) {
              alert(`Плейлист «${group.title}» уже существует и содержит те же самые игры. Новый плейлист не создан.`);
              return;
            }

            const gameIds   = group.games.map(g => g.id);
            const playlists = this.load();
            const sameName  = playlists.find(p => p.title === group.title);

            if (sameName) {
              if (!confirm(`Плейлист «${group.title}» уже существует, но содержит другие игры. Создать новый?`)) return;
            }

            const created = this.createPlaylist(group.title);
            gameIds.forEach(id => this.addEntry(created.id, id, 1));
            this.expandedPlaylistId = created.id;

            btn.classList.add('playlists-create-group-btn--done');
            updateTooltipContent(btn, `Плейлист «${group.title}» уже создан из этой группы`);

            onDone();
          });

          groupsRow.appendChild(btn);
        });

        groupsToggle.addEventListener('click', e => {
          e.stopPropagation();
          const hidden = groupsRow.classList.toggle('latest-games-hidden');
          groupsToggle.innerHTML = hidden
            ? `${icons.plus}<span>Из группы</span>`
            : `${icons.chevronLeft}<span>Свернуть</span>`;
        });

        form.appendChild(groupsRow);
      } else {
        actionsRow.append(taskBtn);
      }
    } else {
      actionsRow.append(taskBtn);
    }

    form.appendChild(actionsRow);
    return form;
  },

  // ── Create playlist from daily task ────────────────────────────────────────
  // showPicker=true  → show the game-selection overlay (Ctrl+click flow)
  // showPicker=false → create directly from all resolved games (plain click flow)
  async _createPlaylistFromDailyTask(onDone, showPicker = false) {
    const todayStr = _getTaskDate();
    const taskData = await _fetchTask(todayStr);

    if (!taskData?.task) {
      alert('⚠️ Не удалось получить данные задачи дня.');
      return;
    }

    const { require = 0, conditions = [], date: dateStr = '' } = taskData.task;
    const titleDate    = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr.split('-').reverse().join('.') : dateStr;
    const playlistTitle = `Задача дня ${titleDate}`;

    const gm     = this.main.gamesManager;
    const groups = this.main.groupsManager;
    const um     = this.main.uiManager;

    // Read-only lookup per condition — no group mutation yet.
    // Existing games are reused as-is; new ones get a stub { id: null } just for display.
    const candidates = conditions.flatMap(({ gametype, voc }) => {
      let predicate, params;
      if (gametype === 'normal') {
        predicate = g => g.params.gametype !== 'voc';
        params    = { ...TASK_GAME_DEFAULTS };
      } else if (gametype.startsWith('voc-')) {
        const vocId = parseInt(gametype.slice(4), 10);
        predicate = g => g.params.gametype === 'voc' && g.params.vocId == vocId;
        params    = { ...TASK_GAME_DEFAULTS, gametype: 'voc', vocId, vocName: voc?.name ?? '' };
      } else {
        if (!gameTypes[gametype]) return [];
        predicate = g => g.params.gametype === gametype;
        params    = { ...TASK_GAME_DEFAULTS, gametype };
      }
      const existing = groups.groups.flatMap(g => g.games).find(predicate);
      return [{ game: existing ?? { id: null, params, pin: 0 }, predicate, params }];
    });

    if (!candidates.length) {
      alert('⚠️ Не удалось сопоставить ни одно условие задачи.');
      return;
    }

    const progress  = taskData.user?.progress ?? 0;
    const remaining = Math.max(0, require - progress);

    // When fewer games remain than there are conditions, only show as many
    // candidates as needed (avoids entries with 0 repeats).
    const effective = remaining > 0 && remaining < candidates.length
      ? candidates.slice(0, remaining)
      : candidates;
    const base = remaining > 0 ? Math.floor(remaining / effective.length) : 1;
    const rem  = remaining > 0 ? remaining % effective.length : 0;

    const pickerCandidates = effective.map((c, i) => ({
      ...c,
      gameId:      c.game.id ?? String(i),
      repeatCount: base + (i < rem ? 1 : 0),
    }));

    // Show the overlay so the user can deselect games before the playlist is created.
    const doCreate = (selected) => {
      if (!selected.length) return;

      if (this.load().some(p => p.title === playlistTitle)) {
        if (!confirm(`Плейлист «${playlistTitle}» уже существует. Создать новый?`)) return;
      }

      // Get-or-create the Задачи group and resolve/create games only for confirmed selection.
      let taskGroup = groups.groups.find(g => g.title === 'Задачи');
      if (!taskGroup) {
        taskGroup = groups.createGroup('Задачи');
        groups.groups.push(taskGroup);
      }

      const findOrCreate = (predicate, params) => {
        const found = groups.groups.flatMap(g => g.games).find(predicate);
        if (found) return found;
        const game = { id: generateUniqueId(groups.groups), params, pin: 0 };
        taskGroup.games.push(game);
        return game;
      };

      const selectedGames = selected.map(c => findOrCreate(c.predicate, c.params));

      gm.assignGameIds();
      gm.saveGamesData();
      um.refreshContainer();

      const created = this.createPlaylist(playlistTitle);
      this._updatePlaylist(created.id, p => {
        p.dailyTaskRequire   = require;
        p.dailyTaskRemaining = remaining;
        p.dailyTaskDate      = todayStr;
      });

      // Redistribute repeat counts across the selected subset so they still sum
      // to `remaining` — same logic as _redistributeTaskRepeats.
      const n       = selectedGames.length;
      const selBase = remaining > 0 ? Math.floor(remaining / n) : 1;
      const selRem  = remaining > 0 ? remaining % n : 0;
      selectedGames.forEach((game, i) => this.addEntry(created.id, game.id, selBase + (i < selRem ? 1 : 0)));

      this.expandedPlaylistId = created.id;
      onDone();
    };

    if (showPicker) {
      _showTaskGameSelectOverlay(pickerCandidates, doCreate);
    } else {
      doCreate(pickerCandidates);
    }
  },

  // Remove playlist's games from the Задачи group only if no remaining playlist still references them.
  _cleanTaskGroup(playlist) {
    if (!this.main) return;
    const groups    = this.main.groupsManager;
    const taskGroup = groups.groups.find(g => g.title === 'Задачи');
    if (!taskGroup) return;

    const remainingReferencedGameIds = new Set(
      this.load()
        .filter(p => p.id !== playlist.id)
        .flatMap(p => p.entries.map(e => e.gameId))
    );

    taskGroup.games = taskGroup.games.filter(g => remainingReferencedGameIds.has(g.id));

    if (!taskGroup.games.length) {
      groups.groups = groups.groups.filter(g => g !== taskGroup);
      if (groups.currentGroupId === taskGroup.id)
        groups.currentGroupId = groups.groups[0]?.id ?? null;
    }
    this.main.gamesManager.saveGamesData();
    this.main.uiManager.refreshContainer();
  },

  _buildGamePicker(playlist) {
    const picker = _el('div', 'playlist-game-picker');

    // ── Button row: single "Add games" toggle ─────────────────────────────
    const btnRow    = _el('div', 'playlist-picker-btn-row');
    const toggleBtn = _el('button', 'playlist-picker-toggle');
    toggleBtn.innerHTML = `${icons.plus}<span>Добавить игры</span>`;
    createCustomTooltip(toggleBtn, '[Клик / Tab] Показать / скрыть список игр для добавления в плейлист');

    btnRow.append(toggleBtn);
    picker.appendChild(btnRow);

    // ── Picker overlay — portaled to popup root so it floats above playlists-list
    const overlay = _el('div', 'playlist-picker-overlay playlist-picker-overlay--hidden playlist-picker-overlay--overlay');
    _attachVocabularyPreview(overlay, '.playlist-picker-game-name');

    // ── Dedicated close footer inside the overlay (never moves, always at bottom) ──
    const overlayFooter   = _el('div', 'playlist-picker-overlay-footer');
    const collapseBtn     = _el('button', 'playlist-picker-toggle');
    collapseBtn.innerHTML = `${icons.chevronLeft}<span>Свернуть</span>`;
    createCustomTooltip(collapseBtn, '[Клик / Tab] Закрыть список игр и вернуться к плейлисту');

    const filtersBtn      = _el('button', 'playlist-picker-toggle playlist-picker-filters-btn');
    filtersBtn.innerHTML  = `${icons.filter}<span>Фильтры</span>`;
    createCustomTooltip(filtersBtn, '[Клик / F] Показать / Скрыть фильтр по группам [ЛКМ + Перетаскивание] Множественный выбор групп');

    overlayFooter.append(collapseBtn, filtersBtn);

    // ── Prev / next entry navigation ───────────────────────────────────────
    // Scrolls the entries list behind the overlay so the user's scroll
    // position is already correct when they close the picker.
    let navIndex = -1;

    // Returns only picker game rows that have already been added to the playlist.
    const getAddedPickerRows = () => [...overlay.querySelectorAll('.playlist-picker-game-row.already-added')];

    const navGroup   = _el('div',    'playlist-picker-nav-group');
    const navPrevBtn = _el('button', 'playlist-picker-nav-btn');
    const navNextBtn = _el('button', 'playlist-picker-nav-btn');
    const navCounter = _el('span',   'playlist-picker-nav-counter');
    navPrevBtn.innerHTML = icons.arrowUp;
    navNextBtn.innerHTML = icons.arrowDown;
    createCustomTooltip(navPrevBtn, '[Клик] Перейти к предыдущей добавленной игре');
    createCustomTooltip(navNextBtn, '[Клик] Перейти к следующей добавленной игре');
    const gfCounter = _el('span', 'playlist-picker-item-count');
    createCustomTooltip(gfCounter, 'Количество игр, соответствующих текущим фильтрам');
    navGroup.append(navPrevBtn, navCounter, navNextBtn);
    overlayFooter.append(gfCounter, navGroup);

    const syncNavState = () => {
      const n = getAddedPickerRows().length;
      navCounter.textContent = n > 0 ? `${navIndex >= 0 ? navIndex + 1 : 0}/${n}` : '';
      navPrevBtn.disabled    = n === 0;
      navNextBtn.disabled    = n === 0;
    };

    const navTo = (index) => {
      const rows = getAddedPickerRows();
      if (!rows.length) return;
      navIndex = ((index % rows.length) + rows.length) % rows.length;
      const target = rows[navIndex];
      _scrollToEntry(target);
      // Flash-highlight the navigated-to row briefly
      target.classList.remove('picker-row--nav-highlight');
      void target.offsetWidth; // force reflow to restart animation
      target.classList.add('picker-row--nav-highlight');
      clearTimeout(target._navHighlightTimer);
      target._navHighlightTimer = setTimeout(() => target.classList.remove('picker-row--nav-highlight'), 1000);
      syncNavState();
    };

    _attachButtonHold(navPrevBtn, () => {
      const rows = getAddedPickerRows();
      if (!rows.length) return;
      navTo(navIndex <= 0 ? rows.length - 1 : navIndex - 1);
    });
    _attachButtonHold(navNextBtn, () => {
      navTo(navIndex < 0 ? 0 : navIndex + 1);
    });

    // Called by injectAddedEntries and doRemove to keep the counter in sync.
    // Also accepts an optional gameId to jump navIndex to that specific added row.
    picker._syncNavState = (jumpToGameId) => {
      const rows = getAddedPickerRows();
      if (jumpToGameId) {
        const idx = rows.findIndex(r => r.dataset.gameId === jumpToGameId);
        if (idx !== -1) navIndex = idx;
      }
      if (navIndex >= rows.length) navIndex = rows.length - 1;
      syncNavState();
    };

    // ── Open / close helpers ───────────────────────────────────────────────
    const _positionOverlay = () => {
      const popup = PlaylistsManager.popup;
      if (!popup || overlay.classList.contains('playlist-picker-overlay--hidden')) return;
      const header = popup.querySelector('.popup-header');
      const pr = popup.getBoundingClientRect();
      const top = header
        ? Math.round(header.getBoundingClientRect().bottom - pr.top)
        : 0;
      overlay.style.top = top + 'px';
    };

    const openPicker = () => {
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      popup.classList.add('playlist-picker-open');
      overlay.classList.remove('playlist-picker-overlay--hidden');
      toggleBtn.innerHTML = `${icons.chevronLeft}<span>Свернуть</span>`;
      _positionOverlay();
      _fitOverlayPopup(popup, overlay);
      syncNavState();
      requestAnimationFrame(() => {
        syncHeights();
        PlaylistsManager._constrain();
      });
    };

    const closePicker = () => {
      // Exit picker selection mode and clear all row selections on close
      overlay.classList.remove('playlist-picker-overlay--selection');
      window.getSelection()?.removeAllRanges();
      pickerSel.clear();
      overlay.querySelectorAll('.playlist-picker-checkbox').forEach(cb => { cb.checked = false; });
      overlay.querySelectorAll('.playlist-picker-game-row').forEach(r => r.classList.remove('picker-row--selected'));
      updateConfirmBar();
      overlay.classList.add('playlist-picker-overlay--hidden');
      toggleBtn.innerHTML = `${icons.plus}<span>Добавить игры</span>`;
      // Remove the min-height we forced on the popup when opening, so the popup
      // shrinks back to its natural content height after the picker is hidden.
      if (PlaylistsManager.popup) {
        PlaylistsManager.popup.classList.remove('playlist-picker-open');
        PlaylistsManager.popup.style.minHeight = '';
      }
      requestAnimationFrame(() => PlaylistsManager._constrain());
    };

    // toggleBtn in picker (sticky bottom of playlists-list) — always visible
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      overlay.classList.contains('playlist-picker-overlay--hidden') ? openPicker() : closePicker();
    });

    // collapseBtn in overlay footer — mirrors the same action
    collapseBtn.addEventListener('click', e => {
      e.stopPropagation();
      closePicker();
    });

    // filtersBtn wired after groupFilterRow is defined (see below)

    if (!this.main) { picker.append(overlay); return picker; }

    // ── Search ─────────────────────────────────────────────────────────────
    const searchWrap  = _el('div', 'playlist-picker-search-wrap');
    const searchInput = _el('input', 'playlist-search-input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Поиск по названию...';
    searchWrap.appendChild(searchInput);

    // ── Group filter chip strip — always visible when picker is open ──────
    const groupFilterRow = _el('div', 'playlist-picker-group-filter playlist-picker-group-filter--hidden');
    const activeGroups   = new Set();

    // filtersBtn toggles the chip strip; active state mirrors strip visibility
    filtersBtn.addEventListener('click', e => {
      e.stopPropagation();
      groupFilterRow.classList.toggle('playlist-picker-group-filter--hidden');
      syncHeights();
    });

    // ── Multi-add state ────────────────────────────────────────────────────
    const pickerSel = new Set(); // Set<gameId> — local to this picker instance

    // ── Confirm bar ────────────────────────────────────────────────────────
    const confirmBar      = _el('div', 'playlist-picker-confirm-bar playlist-picker-confirm-bar--hidden');
    const confirmCount    = _el('span', 'playlist-picker-confirm-count', '');
    const confirmAddBtn   = _el('button', 'playlist-picker-confirm-btn');
    confirmAddBtn.innerHTML = `${icons.check}<span>Добавить</span>`;
    const confirmClearBtn = _el('button', 'playlist-picker-confirm-clear');
    confirmClearBtn.innerHTML = `${icons.x}<span>Снять</span>`;
    confirmBar.append(confirmCount, confirmAddBtn, confirmClearBtn);

    // ── Sync CSS vars for sticky top offsets ──────────────────────────────
    const syncHeights = () => {
      requestAnimationFrame(() => {
        const sh = searchWrap.offsetHeight;
        const filterVisible = !groupFilterRow.classList.contains('playlist-picker-group-filter--hidden');
        const gh = filterVisible ? groupFilterRow.offsetHeight : 0;
        overlay.style.setProperty('--picker-search-height',       `${sh}px`);
        overlay.style.setProperty('--picker-group-filter-height', `${gh}px`);
        const ch = confirmBar.classList.contains('playlist-picker-confirm-bar--hidden')
          ? 0 : confirmBar.offsetHeight;
        overlay.style.setProperty('--picker-confirm-height', `${ch}px`);
      });
    };

    // ── Combined filter: text + group chips + voc-type chips ──────────────
    const activeTypes = new Set(); // typeKey → active
    const applyFilter = () => {
      const term    = searchInput.value.toLowerCase().trim();
      const byGroup = activeGroups.size > 0;
      const byType  = activeTypes.size > 0;
      const visibleHeaders = new Set();
      allRows.forEach(({ gameRow, groupHeader, name, groupTitle }) => {
        const typeKey  = gameRow.dataset.vocTypeKey || null;
        const typeMatch = !byType || (typeKey ? activeTypes.has(typeKey) : false);
        const show = (!term || name.includes(term)) && (!byGroup || activeGroups.has(groupTitle)) && typeMatch;
        gameRow.style.display = show ? '' : 'none';
        if (show) visibleHeaders.add(groupHeader);
      });
      overlay.querySelectorAll('.playlist-picker-group-header').forEach(h => {
        h.style.display = visibleHeaders.has(h) ? '' : 'none';
      });
      const visible = allRows.filter(r => r.gameRow.style.display !== 'none').length;
      if (gfCounter) gfCounter.textContent = visible < allRows.length ? `${visible}/${allRows.length}` : allRows.length;
      _fitOverlayPopup(PlaylistsManager.popup, overlay);
      requestAnimationFrame(() => PlaylistsManager._constrain());
    };

    // ── Confirm bar update ─────────────────────────────────────────────────
    const updateConfirmBar = () => {
      confirmCount.textContent = `${pickerSel.size}`;
      const visible = pickerSel.size > 0;
      confirmBar.classList.toggle('playlist-picker-confirm-bar--hidden', !visible);
      syncHeights();
    };

    // ── Inject newly added entries into the live entry list ────────────────
    // picker (btn-row) stays in its original DOM place even after overlay is
    // portaled, so picker.closest() still resolves the playlist-block correctly.
    const injectAddedEntries = (block, countBefore, jumpToGameId) => {
      const entryList = block?.querySelector('.playlist-entries');
      if (!entryList) return;
      entryList.querySelector('.playlist-entries-empty')?.remove();
      const fresh = this.load().find(p => p.id === playlist.id);
      if (!fresh) return;
      fresh.entries.slice(countBefore).forEach((newEntry, i) => {
        playlist.entries.push(newEntry);
        const newRow = this._buildEntryRow(playlist, newEntry, null, false, countBefore + i);
        entryList.appendChild(newRow);
      });
      const sel = this._selectedEntries[playlist.id] ??= new Set();
      this._attachEntryDrag(entryList, playlist.id, sel);
      // Pass the last-added game's id so the nav counter jumps to it in the picker.
      const lastAdded = fresh.entries[fresh.entries.length - 1];
      picker._syncNavState?.(jumpToGameId ?? lastAdded?.gameId);
    };

    confirmAddBtn.addEventListener('click', e => {
      e.stopPropagation();
      const countBefore = playlist.entries.length;
      pickerSel.forEach(gameId => {
        this.addEntry(playlist.id, gameId, 1);
        const gameRow = overlay.querySelector(`.playlist-picker-game-row[data-game-id="${gameId}"]`);
        if (gameRow) {
          gameRow.classList.add('already-added');
          const cb = gameRow.querySelector('.playlist-picker-checkbox');
          if (cb) { cb.checked = false; cb.disabled = true; }
          const btn = gameRow.querySelector('.playlist-picker-add-btn');
          if (btn) { btn.innerHTML = icons.check; btn.disabled = true; }
          if (gameRow._syncAddedCount) gameRow._syncAddedCount();
        }
      });
      pickerSel.clear();
      // Exit picker selection mode after bulk-add
      overlay.classList.remove('playlist-picker-overlay--selection');
      window.getSelection()?.removeAllRanges();
      updateConfirmBar();
      const _caBlock = picker.closest('.playlist-block');
      injectAddedEntries(_caBlock, countBefore);
      _syncGameCountChip(_caBlock, playlist, this.main);
    });

    confirmClearBtn.addEventListener('click', e => {
      e.stopPropagation();
      pickerSel.clear();
      // Exit picker selection mode on clear
      overlay.classList.remove('playlist-picker-overlay--selection');
      window.getSelection()?.removeAllRanges();
      overlay.querySelectorAll('.playlist-picker-checkbox').forEach(cb => { cb.checked = false; });
      overlay.querySelectorAll('.playlist-picker-game-row').forEach(r => r.classList.remove('picker-row--selected'));
      updateConfirmBar();
    });

    // ── Build game rows (keyed by group) ───────────────────────────────────
    const allRows = [];
    this.main.groupsManager.groups.forEach(group => {
      if (!group.games.length) return;

      const groupHeader = _el('div', 'playlist-picker-group-header', group.title);
      overlay.appendChild(groupHeader);

      group.games.forEach(game => {
        // Returns current in-playlist count for this game (live, reads from playlist.entries)
        const getCount = () => playlist.entries.filter(e => e.gameId === game.id).length;

        const alreadyAdded = getCount() > 0;
        const gtype   = gameTypes[game.params.gametype] || game.params.gametype;
        const name    = game.params.vocName ? `«${game.params.vocName}»` : gtype;
        const gameRow = _el('div', `playlist-picker-game-row${alreadyAdded ? ' already-added' : ''}`);
        gameRow.dataset.gameId = game.id;
        if (game.params.gametype === 'voc' && game.params.vocId) gameRow.dataset.vocId = game.params.vocId;

        // Handles both init and updates — updateTooltipContent falls back to
        // createCustomTooltip when the element has no tooltip yet.
        const syncAddBtnTooltip = () => {
          const n = getCount();
          updateTooltipContent(addBtn, n > 0
            ? `[Уже в плейлисте] ${n} шт. [Клик] Добавить ещё одну копию [Ctrl + Клик] Убрать одну копию`
            : 'Добавить в плейлист');
        };

        // ── Checkbox — always in DOM; CSS hides it until playlist-picker-overlay--selection ──
        if (!alreadyAdded) {
          const pickerCb = document.createElement('input');
          pickerCb.type      = 'checkbox';
          pickerCb.className = 'playlist-picker-checkbox';
          pickerCb.dataset.gameId = game.id;
          pickerCb.addEventListener('change', e => {
            e.stopPropagation();
            pickerCb.checked ? pickerSel.add(game.id) : pickerSel.delete(game.id);
            gameRow.classList.toggle('picker-row--selected', pickerCb.checked);
            updateConfirmBar();
          });
          gameRow.append(pickerCb);
        }

        const nameSpan = _el('span', `playlist-picker-game-name gametype-${game.params.gametype}`, name);
        const visLabel = visibilities[game.params.type] || game.params.type;

        // descSpan shows "Режим · TM N" plus a live "×N added" count when applicable.
        const descSpan = _el('span', 'playlist-picker-game-desc');
        const descText = _el('span', 'playlist-picker-game-desc-text', `${visLabel} · TM ${game.params.timeout}`);
        const addedCount = _el('span', 'playlist-picker-game-added-count');
        const syncAddedCount = () => {
          const n = getCount();
          if (n > 0) {
            addedCount.textContent = `×${n}`;
            addedCount.style.display = '';
          } else {
            addedCount.style.display = 'none';
          }
        };
        syncAddedCount();
        gameRow._syncAddedCount = syncAddedCount;
        gameRow._syncAddBtnTooltip = syncAddBtnTooltip;
        descSpan.append(descText, addedCount);

        const addBtn = _el('button', 'playlist-picker-add-btn');
        // Icon-only: plus when not added, check when already added
        addBtn.innerHTML = alreadyAdded ? icons.check : icons.plus;
        syncAddBtnTooltip();

        // Ctrl visual cue: red/remove tint on mousedown, cleared on mouseup/mouseleave
        addBtn.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          if (e.ctrlKey && getCount() > 0) {
            addBtn.classList.add('removing');
          } else {
            addBtn.classList.add('adding');
          }
        });
        addBtn.addEventListener('mouseup', () => {
          addBtn.classList.remove('removing', 'adding');
        });
        addBtn.addEventListener('mouseleave', () => {
          addBtn.classList.remove('removing', 'adding');
        });
        // Also update tint when Ctrl key state changes while button is held
        addBtn.addEventListener('keydown', e => {
          if (e.key === 'Control' && addBtn.matches(':active')) {
            addBtn.classList.remove('adding');
            if (getCount() > 0) addBtn.classList.add('removing');
          }
        });
        addBtn.addEventListener('keyup', e => {
          if (e.key === 'Control' && addBtn.matches(':active')) {
            addBtn.classList.remove('removing');
            addBtn.classList.add('adding');
          }
        });

        // The add button is always enabled — even for already-added games — so
        // the user can deliberately add duplicate entries to the playlist.
        // The row stays visually dimmed (already-added class) but the button
        // itself remains clickable and shows a live count tooltip.
        const doAdd = () => {
          const countBefore = playlist.entries.length;
          this.addEntry(playlist.id, game.id, 1);
          addBtn.innerHTML = icons.check;
          gameRow.classList.add('already-added');
          // Disable checkbox on first add (keeps multi-select flow clean)
          const cb = gameRow.querySelector('.playlist-picker-checkbox');
          if (cb) { cb.checked = false; cb.disabled = true; }
          pickerSel.delete(game.id);
          gameRow.classList.remove('picker-row--selected');
          updateConfirmBar();
          const _daBlock = picker.closest('.playlist-block');
          injectAddedEntries(_daBlock, countBefore, game.id);
          _syncGameCountChip(_daBlock, playlist, this.main);
          syncAddBtnTooltip();
          syncAddedCount();
        };

        const doRemove = () => {
          const lastEntry = [...playlist.entries].reverse().find(en => en.gameId === game.id);
          if (!lastEntry) return;
          this.removeEntry(playlist.id, lastEntry.id, playlist);
          const block = picker.closest('.playlist-block');
          block?.querySelector(`.playlist-entry-row[data-entry-id="${lastEntry.id}"]`)?.remove();
          const entryList = block?.querySelector('.playlist-entries');
          if (entryList && !entryList.querySelector('.playlist-entry-row')) {
            entryList.innerHTML = '';
            entryList.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
          }
          _syncEntrySteppers(entryList, playlist);
          const remaining = getCount();
          if (remaining === 0) { gameRow.classList.remove('already-added'); }
          syncAddBtnTooltip();
          syncAddedCount();
          _syncGameCountChip(block, playlist, this.main);
          picker._syncNavState?.();
          // Flash ×-icon briefly, then settle on the correct icon
          addBtn.innerHTML = icons.x;
          addBtn.classList.add('remove-flash');
          clearTimeout(addBtn._removeFlashTimer);
          addBtn._removeFlashTimer = setTimeout(() => {
            addBtn.classList.remove('remove-flash');
            addBtn.innerHTML = remaining > 0 ? icons.check : icons.plus;
          }, 400);
        };

        _attachButtonHold(addBtn, doAdd, doRemove);

        gameRow.append(nameSpan, descSpan, addBtn);
        overlay.appendChild(gameRow);
        allRows.push({ gameRow, groupHeader, name: name.toLowerCase(), groupTitle: group.title, game, gameId: game.id });
      });
    });

    // ── Drag-to-select on game rows — always attached; checkboxes always in DOM ──
    this._attachDragSelect(overlay, '.playlist-picker-checkbox', (cb, checked) => {
      const gameId  = cb.dataset.gameId;
      const gameRow = cb.closest('.playlist-picker-game-row');
      checked ? pickerSel.add(gameId) : pickerSel.delete(gameId);
      gameRow?.classList.toggle('picker-row--selected', checked);
      updateConfirmBar();
    }, {
      rowSelector:  '.playlist-picker-game-row',
      activeClass:  'playlist-picker-overlay--selection',
      skipSelector: 'button, input',
    });

    // ── Long-press on any game row to enter picker selection mode ──────────
    this._attachLongPressSelection(overlay, {
      rowSelector:     '.playlist-picker-game-row',
      skipSelector:    'button, input',
      activeClass:     'playlist-picker-overlay--selection',
      isAlreadyActive: () => overlay.classList.contains('playlist-picker-overlay--selection'),
      onActivate: row => {
        if (row.classList.contains('already-added')) return;
        const gameId = row.dataset.gameId;
        if (gameId) {
          pickerSel.add(gameId);
          row.classList.add('picker-row--selected');
          const cb = row.querySelector('.playlist-picker-checkbox');
          if (cb) cb.checked = true;
          updateConfirmBar();
        }
      },
    });

    if (!allRows.length) overlay.appendChild(_el('div', 'playlist-picker-empty', 'Нет доступных игр'));

    // Chip state helper
    const applyChipState = (chip, state) => {
      chip.classList.toggle('active', state);
      state ? activeGroups.add(chip.dataset.groupTitle) : activeGroups.delete(chip.dataset.groupTitle);
    };

    // ── Build group chips (one per unique group that has games) ───────────
    const groupsWithGames = [...new Set(allRows.map(r => r.groupTitle))];
    groupsWithGames.forEach(groupTitle => {
      const chip = _el('button', 'playlist-picker-group-chip');
      chip.textContent        = groupTitle;
      chip.dataset.groupTitle = groupTitle;
      createCustomTooltip(chip, _groupChipTooltip(groupTitle));
      groupFilterRow.appendChild(chip);
    });

    // ── Group filter action buttons ────────────────────────────────────────
    const syncGfActions = _buildChipStripActions(
      groupFilterRow, '.playlist-picker-group-chip',
      chips => { chips.forEach(c => applyChipState(c, false)); applyFilter(); },
      chips => { chips.forEach(c => applyChipState(c, true));  applyFilter(); },
      'Снять все группы',
      'Выбрать все группы',
    );

    applyFilter(); // set initial counter value

    _attachChipDrag(groupFilterRow, '.playlist-picker-group-chip:not(.voctype-chip)', (chip, active, isMulti) => {
      if (!isMulti && active) {
        groupFilterRow.querySelectorAll('.playlist-picker-group-chip.active').forEach(c => {
          if (c !== chip) applyChipState(c, false);
        });
      }
      applyChipState(chip, active);
      applyFilter();
      syncGfActions();
    });

    searchInput.addEventListener('click', e => e.stopPropagation());
    searchInput.addEventListener('input', () => applyFilter());
    attachInputClearButton(searchInput, searchWrap, applyFilter);

    // ── Voc-type chips — injected async once types resolve ─────────────────
    Promise.all(allRows.map(async ({ game, gameRow }) => {
      if (game.params.gametype !== 'voc' || !game.params.vocId) return null;
      let key = game.params.vocType;
      if (!key || !gameCategories[key]) {
        const raw = (await _fetchVocBasicData(game.params.vocId))?.vocabularyType;
        key = gameCategories[raw] ? raw : typeMapping[raw];
      }
      const resolved = key && gameCategories[key] ? key : null;
      if (resolved) gameRow.dataset.vocTypeKey = resolved;
      return resolved;
    })).then(keys => {
      const typeMap = new Map();
      keys.forEach(k => { if (k && !typeMap.has(k)) typeMap.set(k, gameCategories[k]); });
      if (typeMap.size < 2) return;

      groupFilterRow.appendChild(_el('div', 'playlist-picker-filter-divider'));
      typeMap.forEach((label, key) => {
        const chip = _el('button', `playlist-picker-group-chip voctype-chip voctype-${key}`);
        chip.textContent        = label;
        chip.dataset.vocTypeKey = key;
        createCustomTooltip(chip, _smartChipTooltip(`Показать только «${label}»`));
        groupFilterRow.appendChild(chip);
      });

      _attachChipDrag(groupFilterRow, '.voctype-chip', (chip, active, isMulti) => {
        if (!isMulti && active)
          groupFilterRow.querySelectorAll('.voctype-chip.active').forEach(c => {
            c.classList.remove('active'); activeTypes.delete(c.dataset.vocTypeKey);
          });
        chip.classList.toggle('active', active);
        active ? activeTypes.add(chip.dataset.vocTypeKey) : activeTypes.delete(chip.dataset.vocTypeKey);
        applyFilter();
      });

      syncHeights();
    });

    // ── Assemble overlay (prepend sticky controls, game rows already appended)
    // Final DOM order: searchWrap → groupFilterRow → confirmBar → [rows] → overlayFooter
    overlay.prepend(confirmBar);
    if (groupsWithGames.length > 0) overlay.prepend(groupFilterRow);
    overlay.prepend(searchWrap);
    overlay.append(overlayFooter);

    // Expose a sync function on the picker element so that code outside the
    // picker closure (e.g. entry-row remove button) can update a game row in
    // the portaled overlay without needing a DOM reference to overlay itself.
    picker._syncPickerRow = (gameId) => {
      const gameRow = overlay.querySelector(`.playlist-picker-game-row[data-game-id="${gameId}"]`);
      if (!gameRow) return;
      if (gameRow._syncAddedCount)   gameRow._syncAddedCount();
      if (gameRow._syncAddBtnTooltip) gameRow._syncAddBtnTooltip();
      const remaining = playlist.entries.filter(e => e.gameId === gameId).length;
      gameRow.classList.toggle('already-added', remaining > 0);
      const btn = gameRow.querySelector('.playlist-picker-add-btn');
      if (btn) btn.innerHTML = remaining > 0 ? icons.check : icons.plus;
    };

    // overlay stays detached until openPicker() portals it to the popup root.
    // picker only ever contains btnRow (sticky bottom of playlists-list).
    return picker;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Game-count chip helper — builds and appends the chip to a title span.
// Shared by both active and inactive header branches.
// ─────────────────────────────────────────────────────────────────────────────
function _buildGameCountChipContent(playlist, main) {
  const n = playlist.entries.length;
  const text = n === 1 ? '1 игра' : n < 5 ? `${n} игры` : `${n} игр`;
  let tip = '';
  if (n > 0 && main?.gamesManager) {
    const nameCounts = new Map();
    for (const entry of playlist.entries) {
      const game = main.gamesManager.findGameById(entry.gameId);
      const gtype = game ? (gameTypes[game.params.gametype] || game.params.gametype) : null;
      const dispName = game
        ? (game.params.vocName ? `«${game.params.vocName}»` : gtype)
        : `#${entry.gameId}`;
      nameCounts.set(dispName, (nameCounts.get(dispName) ?? 0) + 1);
    }
    tip = [...nameCounts.entries()]
      .map(([name, count]) => `[${name}] ${count}`)
      .join('');
  }
  return { text, tip };
}

function _appendGameCountChip(titleSpan, playlist, main) {
  const chip = _el('span', 'playlist-game-count-chip');
  const { text, tip } = _buildGameCountChipContent(playlist, main);
  chip.textContent = text;
  titleSpan.appendChild(chip);
  if (tip) createCustomTooltip(chip, tip);
}

// Sync stepper countSpans on all entry rows inside entryList after a redistribution
// changed repeatCounts — avoids a full refresh() for a surgical DOM update.
function _syncEntrySteppers(entryList, playlist) {
  if (!entryList) return;
  const entryMap = new Map(playlist.entries.map(e => [e.id, e]));
  entryList.querySelectorAll('.playlist-entry-row').forEach(r => {
    const e = entryMap.get(r.dataset.entryId);
    if (!e) return;
    r.querySelector('.playlist-stepper-count').textContent = String(e.repeatCount);
    const badge = r.querySelector('.playlist-entry-play-count');
    if (badge) badge.textContent = `×${e.repeatCount}`;
  });
}

// Update the chip in-place inside a playlist block — called after live add/remove
// without a full refresh() so the count and tooltip stay accurate.
function _syncGameCountChip(block, playlist, main) {
  const chip = block?.querySelector('.playlist-game-count-chip');
  if (!chip) return;
  const { text, tip } = _buildGameCountChipContent(playlist, main);
  chip.textContent = text;
  if (tip) updateTooltipContent(chip, tip);
  _syncTaskChips(block, playlist);
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily task chips — appended to titleSpan when playlist.dailyTaskRequire > 0.
// Shows: require chip (total races vs required), progress chip (user progress),
// and award chip (+N reward).
// ─────────────────────────────────────────────────────────────────────────────

// Moscow is always UTC+3, no DST. Task resets at 04:00 Moscow = 01:00 UTC.
// Using UTC methods exclusively so the result is correct for any local timezone.
function _getTaskDate() {
  const moscow = new Date(Date.now() + 3 * 3600000); // shift UTC → Moscow
  if (moscow.getUTCHours() < 4) moscow.setUTCDate(moscow.getUTCDate() - 1);
  return `${moscow.getUTCFullYear()}-${moscow.getUTCMonth() + 1}-${moscow.getUTCDate()}`;
}

// Returns the next 04:00 Moscow reset as a real local Date (01:00 UTC).
function _nextTaskResetDate() {
  const reset = new Date();
  reset.setUTCHours(1, 0, 0, 0); // 04:00 Moscow = 01:00 UTC
  if (Date.now() >= reset.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

let _todayFetch = null;           // { dateStr, promise } — today's fetch, reused for the session
const _taskDataCache = new Map(); // dateStr → Promise — past-day in-memory cache (immutable data)

// Raw HTTP call, returns full API response or null.
async function _fetchTask(dateStr) {
  try {
    const res = await fetch(`https://klavogonki.ru/ajax/get-daily-task-archive?date=${dateStr}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Fetches and extracts { progress, award }.
// Persists onto all matching playlists in localStorage when the data is frozen:
// past day (immutable) or today's task fully completed (progress won't increase further).
// Presence of dailyTaskData then skips all future fetches for those playlists.
async function _fetchAndPersistTaskData(dateStr) {
  const taskData = await _fetchTask(dateStr);
  if (!taskData) return null;
  const result = {
    progress: taskData.user?.progress ?? 0,
    award:    taskData.task?.award    ?? null,
  };
  const isPastDay   = dateStr !== _getTaskDate();
  const playlists   = PlaylistsManager.load();
  const targets     = playlists.filter(p => p.dailyTaskDate === dateStr);
  const isCompleted = p => p.dailyTaskRequire && result.progress >= p.dailyTaskRequire;
  const toSave      = isPastDay ? targets : targets.filter(isCompleted);
  if (toSave.length) {
    toSave.forEach(p => {
      p.dailyTaskData = { ...result, status: isPastDay ? 'expired' : 'completed' };
    });
    PlaylistsManager.save(playlists);
  }
  return result;
}

// Guarded entry point — serves from playlist.dailyTaskData if present (no fetch),
// otherwise fetches once and persists for past days, or fetches fresh for today.
function _fetchDailyTask(dateStr, playlist = null) {
  // dailyTaskData present — data already saved in localStorage, never fetch again.
  if (playlist?.dailyTaskData) return Promise.resolve(playlist.dailyTaskData);

  // Past day — fetch once per session, persist to localStorage on completion.
  if (dateStr !== _getTaskDate()) {
    if (!_taskDataCache.has(dateStr))
      _taskDataCache.set(dateStr, _fetchAndPersistTaskData(dateStr));
    return _taskDataCache.get(dateStr);
  }

  // Today — reuse in-flight promise or fetch fresh (never persisted, progress still live).
  if (_todayFetch?.dateStr === dateStr) return _todayFetch.promise;
  const reset    = _nextTaskResetDate();
  const diff     = reset - Date.now();
  const h        = Math.floor(diff / 3600000);
  const m        = Math.floor((diff % 3600000) / 60000);
  const s        = Math.floor((diff % 60000)   / 1000);
  const timeLeft = `${h}h ${m}m ${s}s`;
  console.log(`[DailyTask] "${dateStr}" — fetching fresh. Becomes permanent in ${timeLeft} at ${reset.toLocaleString()} local / 04:00 Moscow.`);
  _todayFetch = { dateStr, promise: _fetchAndPersistTaskData(dateStr) };
  return _todayFetch.promise;
}

function _buildTaskRequireChipContent(playlist) {
  if (!playlist.dailyTaskRequire) return null;
  const req   = playlist.dailyTaskRemaining ?? playlist.dailyTaskRequire;
  const total = playlist.entries.reduce((sum, e) => sum + (e.repeatCount ?? 1), 0);
  const state = total > req ? 'over' : total === req ? 'ok' : 'warning';
  const text  = `${total}/${req}`;
  const lockedCount = playlist.entries.filter(e => e.repeatLocked).length;
  const lockNote    = lockedCount > 0 ? ` [Заблокировано: ${lockedCount}]` : '';
  const tip = `[Задача дня] ${
    state === 'ok'   ? `Ровно ${req} — план выполнен`    :
    state === 'over' ? `На ${total - req} больше нужного` :
                       `На ${req - total} меньше нужного`
  }${lockNote} [Клик] Перераспределить повторы`;
  return { text, tip, state };
}

function _buildTaskProgressChipContent(playlist, taskData, isArchive = false) {
  const req = playlist.dailyTaskRequire;
  if (!req || taskData?.progress == null) return null;
  const progress = taskData.progress;
  const pct  = Math.min(100, Math.round((progress / req) * 100));
  const archiveTip = isArchive ? `[Архив] Это архивная задача. Вы можете сыграть, но прогресс уже не изменится.` : ``;
  return {
    text: `${progress}/${req}`,
    tip:  `[Прогресс задачи] ${progress} из ${req} гонок (${pct}%)${archiveTip}`,
    progress, req,
  };
}

function _buildTaskAwardChipContent(playlist, taskData) {
  const req = playlist.dailyTaskRequire;
  if (!req || !taskData?.award) return null;
  const { amount, type } = taskData.award;
  const typeLabel = type === 'score' ? 'очков' : type;
  return {
    text: `+${amount}`,
    tip:  `[Награда] +${amount} ${typeLabel}`,
  };
}


function _setRequireChipState(chip, state) {
  chip.classList.remove(
    'playlist-task-require-chip--warning',
    'playlist-task-require-chip--ok',
    'playlist-task-require-chip--over',
  );
  chip.classList.add(`playlist-task-require-chip--${state}`);
}

function _appendChip(container, className, content) {
  if (!content) return;
  const chip = _el('span', className);
  chip.textContent = content.text;
  container.appendChild(chip);
  createCustomTooltip(chip, content.tip);
}

function _syncChip(container, selector, content) {
  if (!content) return true; // nothing to do — don't append either
  const chip = container.querySelector(selector);
  if (!chip) return false;  // not found — caller should append
  chip.textContent = content.text;
  updateTooltipContent(chip, content.tip);
  return true;
}

async function _appendTaskChips(titleSpan, playlist) {
  const content = _buildTaskRequireChipContent(playlist);
  if (!content) return;

  let container = titleSpan.querySelector('.playlist-task-chips');
  const isNew = !container;
  if (isNew) {
    container = _el('span', 'playlist-task-chips');

    // Click anywhere in the chips zone triggers redistribution.
    // stopPropagation prevents the click from reaching the playlist header
    // and accidentally collapsing it when the user misses the small chip.
    container.addEventListener('click', e => {
      e.stopPropagation();
      try {
        const playlists = PlaylistsManager.load();
        const p = playlists.find(pl => pl.id === playlist.id);
        if (!p?.dailyTaskRequire || !p.entries?.length) return;

        PlaylistsManager._redistributeTaskRepeats(p);
        PlaylistsManager.save(playlists);
        if (PlaylistsManager.popup) PlaylistsManager.refresh(playlist.id);
      } catch (err) {
        console.error('[DailyTask] Redistribution error:', err);
      }
    });
  }

  let chip = container.querySelector('.playlist-task-require-chip');
  if (!chip) {
    chip = _el('span', 'playlist-task-require-chip');
    container.appendChild(chip);
    createCustomTooltip(chip, content.tip);
  }
  chip.textContent = content.text;
  _setRequireChipState(chip, content.state);
  updateTooltipContent(chip, content.tip);

  if (isNew) titleSpan.appendChild(container);

  const dateStr  = playlist.dailyTaskDate ?? _getTaskDate();
  const isArchive = dateStr !== _getTaskDate();
  container.classList.toggle('playlist-task-chips--archive', isArchive);

  const taskData = await _fetchDailyTask(dateStr, playlist);
  if (!taskData) return;

  const progress = _buildTaskProgressChipContent(playlist, taskData, isArchive);
  const award    = _buildTaskAwardChipContent(playlist, taskData);
  _syncChip(container, '.playlist-task-require-chip--progress', progress)
    || _appendChip(container, 'playlist-task-require-chip playlist-task-require-chip--progress', progress);
  _syncChip(container, '.playlist-task-award-chip', award)
    || _appendChip(container, 'playlist-task-award-chip', award);
}

function _syncTaskChips(block, playlist) {
  _appendTaskChips(block?.querySelector('.playlist-header-meta'), playlist);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update the HUD playlist indicator text in-place (called on stepper change).
// updatePositionDisplay is the public alias on PlaylistsManager — it syncs
// both the HUD indicator and the active badge after a position mode change.
// ─────────────────────────────────────────────────────────────────────────────
function _updatePlaylistHud() {
  try {
    PlaylistsManager.main?.pageHandler?.gamesDataContainer?.updatePlaylistIndicator();
    _updateActiveBadge();
  } catch { }
}

// Populate (or repopulate) a playlist-active-badge element with current session data.
function _renderActiveBadge(badge, playlist, session, entry) {
  const totalCycles     = playlist.repeatCount ?? 1;
  const remainingCycles = session.remainingCycles ?? 1;
  const shuffleActive   = session.shuffleActive ?? !!playlist.shuffle;
  const cycleChip = totalCycles > 1
    ? `<span class="playlist-active-badge-cycles">${icons.refresh}<span>${totalCycles - remainingCycles + 1}/${totalCycles}</span></span>`
    : '';
  const repeatText = entry.repeatCount > 1
    ? `<span class="playlist-active-badge-reps">${icons.x}<span>${session.remainingRepeats}</span></span>`
    : '';
  const shuffleChip = shuffleActive
    ? `<span class="playlist-active-badge-shuffle">${icons.random}</span>`
    : '';
  const _mode = _getPositionMode();
  badge.innerHTML = `
    <span class="playlist-active-badge-position">${formatPosition(session.entryIndex + 1, playlist.entries.length, _mode)}</span>
    ${repeatText}
    ${cycleChip}
    ${shuffleChip}
  `;
  let tip = `[Плейлист] ${playlist.title}[Позиция] ${session.entryIndex + 1} из ${playlist.entries.length}`;
  if (entry.repeatCount > 1) tip += `[Осталось повторов] ${session.remainingRepeats}`;
  if (totalCycles > 1)       tip += `[Цикл] ${totalCycles - remainingCycles + 1} из ${totalCycles}`;
  if (shuffleActive)         tip += `[Порядок] случайный`;
  tip += positionTooltip(_mode, 'Клик');
  updateTooltipContent(badge, tip);
  const posEl = badge.querySelector('.playlist-active-badge-position');
  posEl.addEventListener('click', e => {
    e.stopPropagation();
    _cyclePositionMode();
    _updatePlaylistHud();
  });
}

// Update the playlist-active-badge in the open panel in-place.
function _updateActiveBadge() {
  const session = getActivePlaylistSession();
  if (!session) return;
  const badge = document.querySelector('.playlists-manager-popup .playlist-active-badge');
  if (!badge) return;
  const playlists = PlaylistsManager.load();
  const playlist  = playlists.find(p => p.id === session.playlistId);
  if (!playlist) return;
  const entry = _getPlaylistEntry(playlist, session);
  if (!entry) return;
  _renderActiveBadge(badge, playlist, session, entry);
}

// Update the progress fill on the active entry row in real-time.
// playedCount is passed explicitly by the stepper to avoid re-deriving it from
// session.remainingRepeats, which shifts in sync with repeatCount on stepper
// changes and would always produce played=0 after an increment from 1.
function _updateEntryProgress(row, entry, playedCount, isCurrentEntry) {
  if (!isCurrentEntry || entry.repeatCount <= 1 || playedCount <= 0) {
    row.style.removeProperty('--playlist-progress');
    row.classList.remove('playlist-entry-row--progress');
    return;
  }
  const pct = Math.min(100, Math.round((playedCount / entry.repeatCount) * 100));
  row.classList.add('playlist-entry-row--progress');
  row.style.setProperty('--playlist-progress', `${pct}%`);
}
function _el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Prepend [✕ deselect-all] [✓ select-all] action buttons to a chip strip.
 *
 * @param {HTMLElement} container  — the strip element (row / groupFilterRow)
 * @param {string}      chipSel   — CSS selector for chips inside container
 * @param {Function}    onDeselect  — receives array of currently-active chips
 * @param {Function}    onSelectAll — receives array of inactive, non-disabled chips
 * @param {string}      [deselectTip] — tooltip for the ✕ button
 * @param {string}      [selectTip]   — tooltip for the ✓ button
 * @returns {Function} sync — call after any chip state change to update disabled states
 */
/**
 * Build [✕ deselect-all] [✓ select-all] icon buttons inside a chip-strip-actions
 * wrapper. Returns { wrap, deselectBtn, selectBtn } — callers wire click handlers
 * and disabled sync themselves.
 */
// Drag-to-toggle chips — LMB down sets intent, mouseover spreads it.
// onToggle(chip, active, isMulti): isMulti=true on drag or Ctrl+click → caller handles exclusivity.
function _attachChipDrag(strip, chipSelector, onToggle) {
  let dragState = null;
  strip.addEventListener('mousedown', e => {
    const chip = e.target.closest(chipSelector);
    if (!chip || chip.disabled || e.button !== 0) return;
    e.preventDefault();
    dragState = !chip.classList.contains('active');
    onToggle(chip, dragState, e.ctrlKey);
  });
  strip.addEventListener('mouseover', e => {
    if (dragState === null || e.buttons !== 1) { dragState = null; return; }
    const chip = e.target.closest(chipSelector);
    if (chip && !chip.disabled && chip.classList.contains('active') !== dragState)
      onToggle(chip, dragState, true); // drag is always additive
  });
  document.addEventListener('mouseup', () => { dragState = null; }, { capture: true });
}

function _buildSelectAllBtns(deselectTip = 'Снять все', selectTip = 'Выбрать все') {
  const wrap        = _el('div', 'playlist-chip-strip-actions');
  const deselectBtn = _el('button', 'playlist-chip-action-btn deselect');
  const selectBtn   = _el('button', 'playlist-chip-action-btn select');
  deselectBtn.innerHTML = icons.x;
  selectBtn.innerHTML   = icons.check;
  createCustomTooltip(deselectBtn, deselectTip);
  createCustomTooltip(selectBtn,   selectTip);
  wrap.append(deselectBtn, selectBtn);
  return { wrap, deselectBtn, selectBtn };
}

function _buildChipStripActions(container, chipSel, onDeselect, onSelectAll,
  deselectTip = 'Снять все', selectTip = 'Выбрать все') {
  const { wrap, deselectBtn, selectBtn } = _buildSelectAllBtns(deselectTip, selectTip);

  const allChips = () => [...container.querySelectorAll(chipSel)];
  const sync = () => {
    const chips  = allChips();
    const active = chips.filter(c => c.classList.contains('active')).length;
    const total  = chips.filter(c => !c.disabled).length;
    deselectBtn.disabled = active === 0;
    selectBtn.disabled   = active === total;
  };

  deselectBtn.addEventListener('click', e => {
    e.stopPropagation();
    onDeselect(allChips().filter(c => c.classList.contains('active')));
    sync();
  });
  selectBtn.addEventListener('click', e => {
    e.stopPropagation();
    onSelectAll(allChips().filter(c => !c.classList.contains('active') && !c.disabled));
    sync();
  });

  container.prepend(wrap);
  sync();
  return sync;
}

function _groupChipTooltip(groupTitle) {
  return `
    [Клик] Показать только группу «${groupTitle}»
    [Ctrl + Клик] Добавить / Убрать группу «${groupTitle}» из фильтра
    [ЛКМ + Перетаскивание] Показать только группы, над которыми проходит курсор
    [Ctrl + ЛКМ + Перетаскивание] Добавить / Убрать группы, над которыми проходит курсор, из фильтра
  `;
}

function _smartChipTooltip(filterAction) {
  return `
    [Клик] ${filterAction}
    [Ctrl + Клик] Добавить / Убрать из фильтра
    [ЛКМ + Перетаскивание] Применить фильтр ко всем, над которыми проходит курсор
    [Ctrl + ЛКМ + Перетаскивание] Добавить / Убрать из фильтра всё, над чем проходит курсор
  `;
}
// Shared helper — sets popup min-height so an absolute-positioned overlay fits.
// Measures the overlay's natural content height by briefly attaching it to
// document.body (where bottom:0 has nothing to clamp against), then moves it
// to the popup with the correct min-height already set.
function _fitOverlayPopup(popup, overlayEl) {
  if (!popup) return;
  popup.style.minHeight = '';
  // Avoid reparenting if already in place — moving an attached overlay resets DOM order and closes the picker.
  if (overlayEl.parentNode !== popup) popup.appendChild(overlayEl);

  const topOffset = parseInt(overlayEl.style.top, 10) || 0;
  const maxH = window.innerHeight * 0.80;
  // +2 absorbs the subpixel rounding gap between scrollHeight (integer) and the
  // actual fractional layout height, which otherwise leaves 1-2px of spurious scroll.
  popup.style.minHeight = Math.min(overlayEl.scrollHeight + topOffset + 2, maxH) + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily-task game-selection overlay
// Shown before creating a playlist from a daily task so the user can pick
// which candidate games to include. No games are pre-selected — user picks freely.
//
// Reuses heavily:
//   - .playlist-picker-overlay--overlay + --selection  container styling & checkbox visibility
//   - .playlist-picker-game-row / -checkbox / -game-name / -game-desc  row markup
//   - .playlist-picker-confirm-count                count badge in the header
//   - _buildSelectAllBtns()                         ✕/✓ header buttons
//   - PlaylistsManager._attachDragSelect()          LMB drag to (de)select rows
//   - .playlist-picker-overlay-footer               sticky bottom strip
//   - .playlist-picker-toggle / -confirm-btn        cancel / confirm buttons
// ─────────────────────────────────────────────────────────────────────────────
function _showTaskGameSelectOverlay(candidates, onConfirm) {
  if (!PlaylistsManager.popup) PlaylistsManager.showCentered();
  const popup = PlaylistsManager.popup;

  const sel     = new Set(); // selected gameIds
  const blocked = new Set(); // blocked gameIds (derived from prefs, kept in sync)

  // ── Overlay container ─────────────────────────────────────────────────────
  // --overlay  : absolute positioning over the popup, z-index 50, full-height scroll
  // --selection: makes .playlist-picker-checkbox elements visible (existing CSS rule)
  const overlay = _el('div', 'playlist-picker-overlay playlist-picker-overlay--overlay playlist-picker-overlay--selection');
  const popupHeader = popup.querySelector('.popup-header');
  overlay.style.top = popupHeader
    ? Math.round(popupHeader.getBoundingClientRect().bottom - popup.getBoundingClientRect().top) + 'px'
    : '0';

  // ── Sticky header: title | count | ✕ / ✓ buttons ─────────────────────────
  const header = _el('div', 'dtask-select-header');
  const titleSpan    = _el('span', 'dtask-select-title', 'Выберите игры для плейлиста');
  const countSpan    = _el('span', 'playlist-picker-confirm-count'); // reuse existing badge style
  // _buildSelectAllBtns returns the same wrap + buttons used by all chip-strip bars
  const { wrap: btnsWrap, deselectBtn, selectBtn } = _buildSelectAllBtns();
  header.append(titleSpan, countSpan, btnsWrap);
  overlay.appendChild(header);

  // ── Game rows — identical markup to the regular game picker ───────────────
  candidates.forEach(({ gameId, game }) => {
    const gtype    = gameTypes[game.params.gametype] || game.params.gametype;
    const name     = game.params.vocName ? `«${game.params.vocName}»` : gtype;
    const visLabel = visibilities[game.params.type] || game.params.type;

    const gameRow  = _el('div', 'playlist-picker-game-row');
    gameRow.dataset.gameId = gameId;
    if (game.params.vocId) gameRow.dataset.vocId = game.params.vocId;

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'playlist-picker-checkbox';
    cb.checked = false; cb.dataset.gameId = gameId;

    const nameSpan = _el('span', `playlist-picker-game-name gametype-${game.params.gametype}`, name);
    const descSpan = _el('span', 'playlist-picker-game-desc');
    const descText = _el('span', 'playlist-picker-game-desc-text', `${visLabel} · TM ${game.params.timeout}`);
    descSpan.appendChild(descText);

    if (game.params.gametype === 'voc' && game.params.vocId) {
      const applyLabel = (label, key) => {
        if (!label) return;
        const typeSpan = _el('span', `playlist-picker-game-voc-type voctype-${key}`, label);
        descSpan.insertBefore(typeSpan, descText);
      };
      const knownType = game.params.vocType && gameCategories[game.params.vocType];
      if (knownType) applyLabel(knownType, game.params.vocType);
      else _fetchVocBasicData(game.params.vocId).then(data => {
        const raw = data?.vocabularyType;
        const key = gameCategories[raw] ? raw : typeMapping[raw];
        applyLabel(key && gameCategories[key], key);
      });
    }

    gameRow.append(cb, nameSpan, descSpan);
    overlay.appendChild(gameRow);
  });

  // ── Sticky footer: cancel + confirm ──────────────────────────────────────
  _attachVocabularyPreview(overlay, '.playlist-picker-game-name');
  const footer    = _el('div', 'playlist-picker-overlay-footer');
  const cancelBtn = _el('button', 'playlist-picker-toggle');
  cancelBtn.innerHTML = `${icons.chevronLeft}<span>Отмена</span>`;
  createCustomTooltip(cancelBtn, '[Клик / Tab] Отменить создание плейлиста');
  const confirmBtn = _el('button', 'playlist-picker-confirm-btn');
  confirmBtn.innerHTML = `${icons.check}<span>Создать</span>`;
  createCustomTooltip(confirmBtn, 'Подтвердить выбор и создать плейлист');
  footer.append(cancelBtn, confirmBtn);
  overlay.appendChild(footer);

  // ── LMB drag-to-select — reuse existing method verbatim ──────────────────
  // activeClass 'playlist-picker-overlay--selection' is already on the overlay,
  // so _attachDragSelect will handle row-level click and drag out of the box.
  PlaylistsManager._attachDragSelect(overlay, '.playlist-picker-checkbox', (cb, checked) => {
    const gameId = cb.dataset.gameId;
    checked ? sel.add(gameId) : sel.delete(gameId);
    cb.closest('.playlist-picker-game-row')?.classList.toggle('picker-row--selected', checked);
    syncState();
  }, {
    rowSelector:  '.playlist-picker-game-row',
    activeClass:  'playlist-picker-overlay--selection',
    skipSelector: 'button',
  });

  // ── Sync helper: count badge + button disabled states ────────────────────
  const syncState = () => {
    const available = candidates.length - blocked.size;
    countSpan.textContent = `${sel.size} / ${available}`;
    deselectBtn.disabled  = sel.size === 0;
    selectBtn.disabled    = sel.size === available;
    confirmBtn.disabled   = sel.size === 0;
  };
  syncState();

  // ── Voc-type filter chips — built async once types resolve ───────────────
  // The row loop above already called _fetchVocBasicData for each voc game,
  // so Promise.all resolves from cache — no extra network requests.
  Promise.all(candidates.map(async ({ gameId, game }) => {
    if (game.params.gametype !== 'voc' || !game.params.vocId) return [gameId, null];
    let key = game.params.vocType;
    if (!key || !gameCategories[key]) {
      const data = await _fetchVocBasicData(game.params.vocId);
      const raw  = data?.vocabularyType;
      key = gameCategories[raw] ? raw : typeMapping[raw];
    }
    return [gameId, key && gameCategories[key] ? key : null];
  })).then(results => {
    const resolvedTypes = new Map(results.filter(([, k]) => k)); // gameId → typeKey
    const typeMap = new Map(); // typeKey → label (unique)
    resolvedTypes.forEach(key => { if (!typeMap.has(key)) typeMap.set(key, gameCategories[key]); });
    if (typeMap.size < 2) return;
    btnsWrap.remove();

    const prefs       = _getDtaskTypePrefs();
    const activeTypes = new Set();
    const typeFilterRow = _el('div', 'playlist-picker-group-filter');

    // Apply blocked state to a row (or unblock it).
    const applyBlockedRow = (gameId, block) => {
      block ? blocked.add(gameId) : blocked.delete(gameId);
      const row = overlay.querySelector(`.playlist-picker-game-row[data-game-id="${gameId}"]`);
      if (!row) return;
      row.classList.toggle('not-available', block);
      const cb = row.querySelector('.playlist-picker-checkbox');
      if (cb) { cb.disabled = block; if (block) cb.checked = false; }
      if (block) sel.delete(gameId);
    };

    // Seed blocked rows before chips are shown.
    resolvedTypes.forEach((key, gameId) => { if (prefs.blocked.has(key)) applyBlockedRow(gameId, true); });
    syncState();

    typeMap.forEach((label, key) => {
      const chip = _el('button', 'playlist-picker-group-chip');
      chip.textContent         = label;
      chip.dataset.filterValue = key;
      chip.classList.add(`voctype-${key}`);
      if (prefs.favorites.has(key)) chip.classList.add('active', 'dtask-chip--favorite');
      if (prefs.blocked.has(key))   chip.classList.add('dtask-chip--blocked');
      const syncChipTooltip = () => {
        const state = prefs.favorites.has(key) ? 'Избранное' : prefs.blocked.has(key) ? 'Заблокировано' : 'Доступно';
        updateTooltipContent(chip, _smartChipTooltip(`Выбрать все «${label}»`) +
          `[ПКМ] Тип: ${state}`);
      };
      syncChipTooltip();

      // Right-click cycles: normal → favorite → blocked → normal
      chip.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        const wasFav = prefs.favorites.has(key), wasBlocked = prefs.blocked.has(key);
        prefs.favorites.delete(key); prefs.blocked.delete(key);
        if (!wasFav && !wasBlocked) prefs.favorites.add(key);
        else if (wasFav)            prefs.blocked.add(key);
        _saveDtaskTypePrefs(prefs);
        chip.classList.toggle('dtask-chip--favorite', prefs.favorites.has(key));
        chip.classList.toggle('dtask-chip--blocked',  prefs.blocked.has(key));
        syncChipTooltip();
        // Sync active state: blocked chips can't be active
        if (prefs.blocked.has(key)) { chip.classList.remove('active'); activeTypes.delete(key); }
        resolvedTypes.forEach((rKey, gameId) => { if (rKey === key) applyBlockedRow(gameId, prefs.blocked.has(key)); });
        syncState();
        applyTypeFilter();
      });

      typeFilterRow.appendChild(chip);
    });

    const applyTypeFilter = () => {
      sel.clear();
      if (activeTypes.size)
        resolvedTypes.forEach((key, gameId) => {
          if (activeTypes.has(key) && !prefs.blocked.has(key)) sel.add(gameId);
        });
      overlay.querySelectorAll('.playlist-picker-checkbox').forEach(cb => {
        if (cb.disabled) return; // blocked rows stay unchecked
        const match = sel.has(cb.dataset.gameId);
        cb.checked = match;
        cb.closest('.playlist-picker-game-row')?.classList.toggle('picker-row--selected', match);
      });
      syncState();
    };

    // Auto-activate favorites on open
    if (prefs.favorites.size) {
      typeFilterRow.querySelectorAll('.playlist-picker-group-chip').forEach(c => {
        if (prefs.favorites.has(c.dataset.filterValue)) activeTypes.add(c.dataset.filterValue);
      });
      applyTypeFilter();
    }

    _buildChipStripActions(
      typeFilterRow, '.playlist-picker-group-chip:not(.dtask-chip--blocked)',
      chips => { chips.forEach(c => { c.classList.remove('active'); activeTypes.delete(c.dataset.filterValue); }); applyTypeFilter(); },
      chips => { chips.forEach(c => { c.classList.add('active');    activeTypes.add(c.dataset.filterValue);    }); applyTypeFilter(); },
      'Снять все типы', 'Выбрать все типы',
    );

    _attachChipDrag(typeFilterRow, '.playlist-picker-group-chip:not(.dtask-chip--blocked)', (chip, active, isMulti) => {
      if (!isMulti && active) {
        typeFilterRow.querySelectorAll('.playlist-picker-group-chip.active').forEach(c => {
          c.classList.remove('active'); activeTypes.delete(c.dataset.filterValue);
        });
      }
      chip.classList.toggle('active', active);
      active ? activeTypes.add(chip.dataset.filterValue) : activeTypes.delete(chip.dataset.filterValue);
      applyTypeFilter();
    });

    overlay.insertBefore(typeFilterRow, overlay.querySelector('.playlist-picker-game-row'));
    _fitOverlayPopup(popup, overlay);
    requestAnimationFrame(() => {
      overlay.style.setProperty('--dtask-header-height', `${header.offsetHeight}px`);
      PlaylistsManager._constrain();
    });
  });

  deselectBtn.addEventListener('click', e => {
    e.stopPropagation();
    sel.clear();
    overlay.querySelectorAll('.playlist-picker-checkbox').forEach(cb => {
      cb.checked = false;
      cb.closest('.playlist-picker-game-row')?.classList.remove('picker-row--selected');
    });
    syncState();
  });

  selectBtn.addEventListener('click', e => {
    e.stopPropagation();
    candidates.forEach(c => sel.add(c.gameId));
    overlay.querySelectorAll('.playlist-picker-checkbox').forEach(cb => {
      cb.checked = true;
      cb.closest('.playlist-picker-game-row')?.classList.add('picker-row--selected');
    });
    syncState();
  });

  // ── Close / confirm ───────────────────────────────────────────────────────
  const close = () => {
    overlay.remove();
    if (PlaylistsManager.popup) {
      PlaylistsManager.popup.classList.remove('playlist-picker-open');
      PlaylistsManager.popup.style.minHeight = '';
    }
    requestAnimationFrame(() => PlaylistsManager._constrain());
  };
  cancelBtn.addEventListener('click',  e => { e.stopPropagation(); close(); });
  confirmBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!sel.size) return;
    close();
    onConfirm(candidates.filter(c => sel.has(c.gameId)));
  });

  popup.classList.add('playlist-picker-open');
  _fitOverlayPopup(popup, overlay);
  requestAnimationFrame(() => {
    overlay.style.setProperty('--dtask-header-height', `${header.offsetHeight}px`);
    PlaylistsManager._constrain();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily-task dialog — inject playlist button into .modal2-header
// ─────────────────────────────────────────────────────────────────────────────

function _dtaskSyncBtn() {
  const btn = document.querySelector('.dlg-dailytask-window .dtask-inject-btn');
  if (btn) _dtaskConfigureBtn(btn);
}

function _dtaskFindTodayPlaylist() {
  const today = _getTaskDate();
  return PlaylistsManager.load().find(
    p => p.dailyTaskDate === today && p.dailyTaskRequire
  ) ?? null;
}

function _dtaskConfigureBtn(btn) {
  const existing = _dtaskFindTodayPlaylist();
  btn.innerHTML = existing ? icons.start : icons.plus;
  btn.classList.toggle('dtask-inject-btn--exists', !!existing);

  if (existing) {
    updateTooltipContent(btn,
      `[Клик] Открыть / Закрыть плейлист «${existing.title}»` +
      `[Ctrl + Клик] Запустить плейлист`
    );
    btn._dtaskHandler = e => {
      e.stopPropagation();
      if (e.ctrlKey) {
        PlaylistsManager.startPlaylist(existing.id);
      } else {
        PlaylistsManager.expandedPlaylistId = existing.id;
        PlaylistsManager.toggle(
          btn.getBoundingClientRect().left,
          btn.getBoundingClientRect().bottom
        );
      }
    };
  } else {
    updateTooltipContent(btn, buildBtnTooltip('createTaskBtn'));
    btn._dtaskHandler = e => {
      e.stopPropagation();
      PlaylistsManager._createPlaylistFromDailyTask(() => {
        _dtaskConfigureBtn(btn);
        if (PlaylistsManager.popup) PlaylistsManager.refresh();
        else PlaylistsManager.showCentered();
      }, !e.ctrlKey);
    };
  }

  btn.removeEventListener('click', btn._dtaskPrevHandler);
  btn.addEventListener('click', btn._dtaskHandler);
  btn._dtaskPrevHandler = btn._dtaskHandler;
}

function _dtaskInjectBtn(dialog) {
  if (dialog.querySelector('.dtask-inject-btn')) return;
  const header = dialog.querySelector('.modal2-header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.className = 'dtask-inject-btn';
  createCustomTooltip(btn, '');
  header.appendChild(btn);
  _dtaskConfigureBtn(btn);
}

new MutationObserver(mutations => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node instanceof Element && node.classList.contains('dlg-dailytask-window'))
        requestAnimationFrame(() => _dtaskInjectBtn(node.querySelector('.modal2-dialog')));
    }
  }
}).observe(document.body, { childList: true, subtree: true });