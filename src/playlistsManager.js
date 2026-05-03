import { createCustomTooltip } from './tooltip.js';
import { icons } from './icons.js';
import { gameTypes, visibilities, timeouts, idleTimes } from './definitions.js';
import { generateRandomString, getCurrentPage } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Storage / session keys
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'latestGamesPlaylists';
const SESSION_KEY  = 'latestGames_activePlaylist';
const SHUFFLE_KEY  = 'latestGames_randomShuffleBag';

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
};

function buildBtnTooltip(button, state = 'default') {
  const t = BTN_TOOLTIPS[button]?.[state];
  if (!t) return '';
  const lines = [];
  if (t.click)     lines.push(`[Клик] ${t.click}`);
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
  createCustomTooltip(paramsBtn, buildBtnTooltip('paramsBtn', hasOv ? 'override' : 'default'));
}

/** Rebuild the entry label tooltip to reflect current ep overrides vs game defaults. */
function _refreshEntryLabelTooltip(label, game, ep, sessionInfo = null) {
  const visLabel = visibilities[ep.type ?? game.params.type] || (ep.type ?? game.params.type);
  const tmVal    = ep.timeout  ?? game.params.timeout;
  const afkVal   = ep.idletime ?? game.params.idletime;
  let tip = '';
  if (_hasEntryParamOverrides(ep)) tip += `[Параметры] переопределены`;
  tip += `[Режим] ${visLabel}[TM] ${tmVal}`;
  if (afkVal) tip += `[AFK] ${afkVal}`;
  if (sessionInfo) tip += `[Пройдено] ${sessionInfo.played} из ${sessionInfo.total}`;
  createCustomTooltip(label, tip);
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
// PlaylistsManager singleton
// ─────────────────────────────────────────────────────────────────────────────
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

  // ── Persistence ────────────────────────────────────────────────────────────
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  },

  save(playlists) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists)); }
    catch { }
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

  renamePlaylist(id, newTitle) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === id);
    if (p && newTitle.trim()) { p.title = newTitle.trim(); this.save(playlists); }
  },

  deletePlaylist(id) {
    this.save(this.load().filter(p => p.id !== id));
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
      })),
      shuffle: source.shuffle,
      repeatCount: source.repeatCount,
    };
    playlists.push(copy);
    this.save(playlists);
    return copy;
  },

  addEntry(playlistId, gameId, repeatCount = 1) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    if (p.entries.some(e => e.gameId === gameId)) return;
    p.entries.push({ id: generateRandomString(), gameId, repeatCount: Math.max(1, repeatCount), params: {} });
    this.save(playlists);
  },

  removeEntry(playlistId, entryId) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    p.entries = p.entries.filter(e => e.id !== entryId);
    this.save(playlists);
  },

  duplicateEntry(playlistId, entryId) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return null;
    const source = p.entries.find(e => e.id === entryId);
    if (!source) return null;
    const copy = { id: generateRandomString(), gameId: source.gameId, repeatCount: source.repeatCount, params: source.params ? { ...source.params } : {} };
    p.entries.push(copy);
    this.save(playlists);
    return copy;
  },

  setRepeat(playlistId, entryId, count) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const e = p.entries.find(e => e.id === entryId);
    if (!e) return;
    const oldCount = e.repeatCount;
    const newCount = Math.max(1, count);
    e.repeatCount = newCount;
    this.save(playlists);
    // If this entry is the currently active one, update sessionStorage immediately.
    // remainingRepeats shifts by the same delta so the user gets exactly the
    // extra (or fewer) repeats they just dialled in.
    const session = getActivePlaylistSession();
    if (session && session.playlistId === playlistId) {
      const freshPlaylists = this.load();
      const freshP = freshPlaylists.find(fp => fp.id === playlistId);
      if (freshP) {
        const entryIdx = freshP.entries.findIndex(fe => fe.id === entryId);
        if (entryIdx === _getActiveEntryIndex(freshP, session)) {
          const delta = newCount - oldCount;
          const newRemaining = Math.min(newCount, Math.max(1, session.remainingRepeats + delta));
          setActivePlaylistSession({ ...session, remainingRepeats: newRemaining });
        }
      }
    }
  },

  setPlaylistCycles(playlistId, count) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const newCount = Math.max(1, count);
    p.repeatCount = newCount;
    this.save(playlists);
    // Sync session remainingCycles by the same delta so in-flight runs adjust correctly
    const session = getActivePlaylistSession();
    if (session && session.playlistId === playlistId && newCount > 1) {
      const remaining = Math.min(newCount, session.remainingCycles ?? newCount);
      setActivePlaylistSession({ ...session, remainingCycles: remaining });
    }
  },

  setEntryParams(playlistId, entryId, params) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const e = p.entries.find(e => e.id === entryId);
    if (!e) return;
    e.params = { ...params };
    this.save(playlists);
  },

  // ── Bulk operations ────────────────────────────────────────────────────────

  bulkRemoveEntries(playlistId, entryIds) {
    const ids = new Set(entryIds);
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    p.entries = p.entries.filter(e => !ids.has(e.id));
    this.save(playlists);
    this._selectedEntries[playlistId]?.clear();
    this._selectionMode.delete(playlistId);
  },

  bulkDuplicateEntries(playlistId, entryIds) {
    const ids = new Set(entryIds);
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const copies = p.entries
      .filter(e => ids.has(e.id))
      .map(e => ({ id: generateRandomString(), gameId: e.gameId, repeatCount: e.repeatCount, params: e.params ? { ...e.params } : {} }));
    p.entries.push(...copies);
    this.save(playlists);
    this._selectedEntries[playlistId]?.clear();
    this._selectionMode.delete(playlistId);
  },

  // Merges params onto each selected entry. null value removes that key.
  bulkSetParams(playlistId, entryIds, params) {
    const ids = new Set(entryIds);
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    p.entries.forEach(e => {
      if (!ids.has(e.id)) return;
      e.params = e.params ? { ...e.params } : {};
      Object.entries(params).forEach(([k, v]) => {
        if (v == null) delete e.params[k];
        else e.params[k] = v;
      });
    });
    this.save(playlists);
    this._selectedEntries[playlistId]?.clear();
    this._selectionMode.delete(playlistId);
  },

  bulkSetRepeat(playlistId, entryIds, count) {
    const ids = new Set(entryIds);
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const newCount = Math.max(1, count);
    p.entries.forEach(e => {
      if (ids.has(e.id)) e.repeatCount = newCount;
    });
    this.save(playlists);
  },

  // ── Shared helpers ─────────────────────────────────────────────────────────

  // Wraps _attachSortableDrag with the fixed entry-row options.
  _attachEntryDrag(entryList, playlistId) {
    this._attachSortableDrag(entryList, {
      itemSelector:   '.playlist-entry-row',
      handleSelector: '.playlist-entry-drag-handle',
      draggingClass:  'playlist-entry-row--dragging',
      onReorder:      (from, to) => this.reorderEntries(playlistId, from, to),
      onGroupReorder: (newIds)   => this.reorderEntriesOrder(playlistId, newIds),
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
    if (container.dataset.dragSelectAttached) return;
    container.dataset.dragSelectAttached = '1';
    let dragState = null;

    // Resolve a checkbox from either a direct cb hit or a row hit (when active).
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

    container.addEventListener('mousedown', e => {
      const cb = resolveCb(e.target);
      if (!cb || cb.disabled) return;
      // Prevent text selection while dragging across rows
      e.preventDefault();
      dragState = !cb.checked;
      // Apply to the first checkbox immediately — mouseover won't fire for it
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
    container.addEventListener('mouseover', e => {
      if (dragState === null || e.buttons !== 1) { dragState = null; return; }
      const cb = resolveCb(e.target);
      if (!cb || cb.disabled || cb.checked === dragState) return;
      cb.checked = dragState;
      onToggle(cb, dragState);
    });
    const stopDrag = () => { dragState = null; };
    document.addEventListener('mouseup', stopDrag, { capture: true });
  },

  // Attach long-press auto-repeat to a stepper button.
  // A single click still calls stepFn once (via the click event).
  // Holding LMB fires stepFn after HOLD_DELAY ms, then every HOLD_INTERVAL ms.
  // The click that fires on release after a hold is suppressed.
  _attachStepperHold(btn, stepFn) {
    const HOLD_DELAY    = 400; // ms before auto-repeat starts
    const HOLD_INTERVAL =  120; // ms between auto-repeat ticks
    let holdTimer = null;
    let interval  = null;
    let holdFired = false;

    const stop = () => {
      clearTimeout(holdTimer);
      clearInterval(interval);
      holdTimer = null;
      interval  = null;
    };

    btn.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      holdFired = false;
      holdTimer = setTimeout(() => {
        holdFired = true;
        stepFn();
        interval = setInterval(stepFn, HOLD_INTERVAL);
      }, HOLD_DELAY);
    });
    btn.addEventListener('mouseup',    stop);
    btn.addEventListener('mouseleave', stop);
    // Single click: holdFired is false → run stepFn normally.
    // After a hold:  holdFired is true  → skip (hold already stepped) and reset.
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (holdFired) { holdFired = false; return; }
      stepFn();
    });
  },

  // Attach long-press selection-mode activation to a scrollable container.
  // container       — the element to listen on (entryList or picker body)
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
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    const [moved] = p.entries.splice(fromIndex, 1);
    p.entries.splice(toIndex, 0, moved);
    this.save(playlists);
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
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    // Capture the active entry ID before modifying so we can update the session index.
    const session = getActivePlaylistSession();
    let activeEntryId = null;
    if (session && session.playlistId === playlistId && !session.shuffleOrder) {
      activeEntryId = p.entries[session.entryIndex]?.id ?? null;
    }
    const map = new Map(p.entries.map(e => [e.id, e]));
    p.entries = newEntryIds.map(id => map.get(id)).filter(Boolean);
    this.save(playlists);
    if (activeEntryId) {
      const newIdx = p.entries.findIndex(e => e.id === activeEntryId);
      if (newIdx !== -1 && newIdx !== session.entryIndex) {
        setActivePlaylistSession({ ...session, entryIndex: newIdx });
      }
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
    const firstEntryIndex = shuffle ? shuffleOrder[0] : 0;
    const firstEntry = playlist.entries[firstEntryIndex];
    const game = this.main.gamesManager.findGameById(firstEntry.gameId);
    if (!game) { alert('⚠️ Первая игра плейлиста не найдена.'); return; }

    setActivePlaylistSession({
      playlistId,
      entryIndex: 0,
      remainingRepeats: firstEntry.repeatCount,
      remainingCycles: playlist.repeatCount ?? 1,
      shuffleOrder,
      shuffleActive: shuffle,
    });
    window.location.href = _generatePlaylistEntryLink(this.main, game, firstEntry);
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

  refresh() {
    if (!this.popup) return;
    const newPopup = this._buildPanel();
    // Restore intended position (may differ from displayed if viewport shrank)
    const left = this._intendedX !== null ? this._intendedX : this.popup.getBoundingClientRect().left;
    const top  = this._intendedY !== null ? this._intendedY : this.popup.getBoundingClientRect().top;
    newPopup.style.left = left + 'px';
    newPopup.style.top  = top  + 'px';
    this.popup.parentNode.replaceChild(newPopup, this.popup);
    this.popup = newPopup;
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
  },

  // Only close on click that is truly outside the popup and not a prompt/confirm dialog
  // Returns true only when state 2 is active AND we are on the game page.
  // On all other pages the panel always behaves normally regardless of state.
  _isPinned() {
    return PlaylistsManager.main?.playlistPanelAutoOpen === 2 && getCurrentPage() === 'game';
  },

  _outside: e => {
    if (!PlaylistsManager.popup) return;
    if (PlaylistsManager.popup.contains(e.target)) return;
    if (PlaylistsManager._isPinned()) return;
    // Don't close if the click was on a button anywhere in the document
    if (e.target.closest('button, input, select, textarea')) return;
    PlaylistsManager.hide();
  },

  _keydown: e => {
    if (PlaylistsManager._isPinned()) return;
    if (e.key === 'Escape') PlaylistsManager.hide();
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

    const randomBtn = _el('button', 'playlists-random-btn');
    randomBtn.innerHTML = icons.random;
    createCustomTooltip(randomBtn, 'Запустить случайный плейлист');
    randomBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.startRandomPlaylist();
    });

    const addBtn = _el('button', 'playlists-add-btn');
    addBtn.innerHTML = `${icons.plus}<span>Новый</span>`;
    createCustomTooltip(addBtn, 'Создать новый плейлист');
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      const existing = panel.querySelector('.playlists-create-form');
      if (existing) { existing.remove(); return; }
      const form = this._buildCreateForm(() => {
        panel.querySelector('.playlists-create-form')?.remove();
        this.refresh();
      });
      // Insert after header
      header.insertAdjacentElement('afterend', form);
      form.querySelector('.playlists-create-input')?.focus();
    });

    const actions = _el('div', 'playlists-header-actions');
    actions.append(randomBtn, addBtn);
    header.append(titleSpan, actions);
    panel.appendChild(header);

    if (!playlists.length) {
      panel.appendChild(_el('div', 'playlists-empty', 'Нет плейлистов. Создайте первый!'));
      return panel;
    }

    const list = _el('div', 'playlists-list');
    playlists.forEach(playlist => list.appendChild(this._buildPlaylistBlock(playlist, session)));

    // Playlist-level drag-to-reorder — same mechanism as entry drag, no duplication
    this._attachSortableDrag(list, {
      itemSelector:   '.playlist-block',
      handleSelector: '.playlist-block-drag-handle',
      draggingClass:  'playlist-block--dragging',
      onReorder: (from, to) => this.reorderPlaylists(from, to),
      onStart: block => {
        const body = block.querySelector('.playlist-body');
        if (body) {
          block.dataset.dragBodyHidden = '1';
          body.style.display = 'none';
        }
      },
      onEnd: block => {
        if (block.dataset.dragBodyHidden) {
          const body = block.querySelector('.playlist-body');
          if (body) body.style.display = '';
          delete block.dataset.dragBodyHidden;
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
      // Active: pause + stop buttons on the LEFT, badge + title on right
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
            this.refresh();
          }
        } else {
          // Pausing: set the flag AND cancel any active replay countdown so
          // the timer does not fire and navigate while the playlist is paused.
          setActivePlaylistSession({ ...current, paused: true });
          try { this.main.pageHandler?.cancelReplay(true); } catch (_) {}
          _updatePlaylistHud();
          this.refresh();
        }
      });

      const stopBtn = _el('button', 'playlist-cancel-btn');
      stopBtn.innerHTML = icons.stop;
      createCustomTooltip(stopBtn, `Остановить плейлист «${playlist.title}»`);
      stopBtn.addEventListener('click', e => {
        e.stopPropagation();
        cancelActivePlaylist();
        _updatePlaylistHud();
        this.refresh();
      });

      const titleSpan = _el('span', 'playlist-title', playlist.title);
      const entry = _getPlaylistEntry(playlist, session);
      if (entry) {
        const totalCycles     = playlist.repeatCount ?? 1;
        const remainingCycles = session.remainingCycles ?? 1;
        const badge = _el('div', 'playlist-active-badge');
        const cycleChip = totalCycles > 1
          ? `<span class="playlist-active-badge-cycles">${icons.refresh}<span>${totalCycles - remainingCycles + 1}/${totalCycles}</span></span>`
          : '';
        const repeatText = entry.repeatCount > 1
          ? `<span class="playlist-active-badge-reps">${icons.x}<span>${session.remainingRepeats}</span></span>`
          : '';
        const shuffleActive = session.shuffleActive ?? !!playlist.shuffle;
        const shuffleChip = shuffleActive
          ? `<span class="playlist-active-badge-shuffle">${icons.random}</span>`
          : '';
        badge.innerHTML = `
          <span class="playlist-active-badge-position">${session.entryIndex + 1}/${playlist.entries.length}</span>
          ${repeatText}
          ${cycleChip}
          ${shuffleChip}
        `;
        let tip = `[Плейлист] ${playlist.title}[Позиция] ${session.entryIndex + 1} из ${playlist.entries.length}`;
        if (entry.repeatCount > 1) tip += `[Осталось повторов] ${session.remainingRepeats}`;
        if (totalCycles > 1) tip += `[Цикл] ${totalCycles - remainingCycles + 1} из ${totalCycles}`;
        if (shuffleActive) tip += `[Порядок] случайный`;
        createCustomTooltip(badge, tip);
        titleSpan.appendChild(badge);
      }

      const blockHandle = _el('span', 'playlist-block-drag-handle');
      blockHandle.innerHTML = icons.dragable;

      row.append(pauseBtn, stopBtn, blockHandle, titleSpan);
    } else {
      // Inactive: play button on left, rename + delete on right
      const playBtn = _el('button', 'playlist-play-btn');
      playBtn.innerHTML = icons.start;
      createCustomTooltip(playBtn, `Запустить плейлист «${playlist.title}»`);
      playBtn.addEventListener('click', e => { e.stopPropagation(); this.startPlaylist(playlist.id); });

      const titleSpan = _el('span', 'playlist-title', playlist.title);

      // Playlist-level cycle stepper — only shown when repeatCount > 1 or on hover
      const cycleCount     = playlist.repeatCount ?? 1;
      const cycleStepper   = _el('div', 'playlist-header-stepper');
      const cycleDecBtn    = _el('button', 'playlist-stepper-btn');
      cycleDecBtn.innerHTML = icons.chevronLeft;
      const cycleCountSpan = _el('span', 'playlist-stepper-count', String(cycleCount));
      const cycleIncBtn    = _el('button', 'playlist-stepper-btn');
      cycleIncBtn.innerHTML = icons.chevronRight;
      cycleStepper.append(cycleDecBtn, cycleCountSpan, cycleIncBtn);
      createCustomTooltip(cycleStepper, 'Количество повторов всего плейлиста');
      if (cycleCount <= 1) cycleStepper.classList.add('playlist-header-stepper--default');

      this._attachStepperHold(cycleDecBtn, () => {
        const next = Math.max(1, (playlist.repeatCount ?? 1) - 1);
        this.setPlaylistCycles(playlist.id, next);
        playlist.repeatCount = next;
        cycleCountSpan.textContent = String(next);
        cycleStepper.classList.toggle('playlist-header-stepper--default', next <= 1);
      });

      this._attachStepperHold(cycleIncBtn, () => {
        const next = (playlist.repeatCount ?? 1) + 1;
        this.setPlaylistCycles(playlist.id, next);
        playlist.repeatCount = next;
        cycleCountSpan.textContent = String(next);
        cycleStepper.classList.remove('playlist-header-stepper--default');
      });

      const shufflePlayBtn = _el('button', 'playlist-play-shuffle-btn');
      shufflePlayBtn.innerHTML = icons.random;
      const updateShuffleBtn = enabled => {
        shufflePlayBtn.classList.toggle('active', enabled);
        createCustomTooltip(shufflePlayBtn, enabled
          ? `Отключить случайный порядок для «${playlist.title}»`
          : `Включить случайный порядок для «${playlist.title}»`
        );
      };
      updateShuffleBtn(!!playlist.shuffle);

      shufflePlayBtn.addEventListener('click', e => {
        e.stopPropagation();
        const playlists = this.load();
        const current = playlists.find(p => p.id === playlist.id);
        if (!current) return;
        current.shuffle = !current.shuffle;
        this.save(playlists);
        updateShuffleBtn(current.shuffle);
      });

      const renameBtn = _el('button', 'playlist-rename-btn');
      renameBtn.innerHTML = icons.rename;
      createCustomTooltip(renameBtn, 'Переименовать');
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        const t = prompt('Новое название:', playlist.title);
        if (t && t.trim()) { this.renamePlaylist(playlist.id, t); this.refresh(); }
      });

      const dupPlaylistBtn = _el('button', 'playlist-duplicate-btn');
      dupPlaylistBtn.innerHTML = icons.copy;
      createCustomTooltip(dupPlaylistBtn, 'Дублировать плейлист');
      dupPlaylistBtn.addEventListener('click', e => {
        e.stopPropagation();
        const copy = this.duplicatePlaylist(playlist.id);
        if (copy) { this.expandedPlaylistId = null; this.refresh(); }
      });

      const delBtn = _el('button', 'playlist-delete-btn');
      delBtn.innerHTML = icons.trashNothing;
      createCustomTooltip(delBtn, 'Удалить плейлист');
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Удалить плейлист «${playlist.title}»?`)) {
          this.deletePlaylist(playlist.id);
          this.refresh();
        }
      });

      const blockHandle = _el('span', 'playlist-block-drag-handle');
      blockHandle.innerHTML = icons.dragable;

      row.append(playBtn, blockHandle, titleSpan, cycleStepper, shufflePlayBtn, renameBtn, dupPlaylistBtn, delBtn);
    }

    // Toggle expand on row click (excluding buttons)
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
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

    // Collapsible body
    const body = _el('div', 'playlist-body');

    // Entry list (no search here — entries list is short)
    const entryList = _el('div', 'playlist-entries');

    if (!playlist.entries.length) {
      entryList.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
    } else {
      const sel = this._selectedEntries[playlist.id] ??= new Set();

      // Prune stale IDs that no longer exist in the playlist
      const validIds = new Set(playlist.entries.map(e => e.id));
      for (const id of [...sel]) { if (!validIds.has(id)) sel.delete(id); }
      if (sel.size === 0) this._selectionMode.delete(playlist.id);

      // ── Multiselect bar — always in DOM; CSS hides it until selection mode ─
      entryList.appendChild(this._buildMultiSelectBar(playlist, sel, entryList));

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

      this._attachEntryDrag(entryList, playlist.id);

      // Restore selection mode class if it was active before a data-driven refresh
      if (this._selectionMode.has(playlist.id)) {
        entryList.classList.add('playlist-entries--selection');
      }

      // ── Drag-to-select checkboxes — always attached; checkboxes always in DOM ──
      this._attachDragSelect(entryList, '.playlist-entry-checkbox', (cb, checked) => {
        const entryId = cb.dataset.entryId;
        checked ? sel.add(entryId) : sel.delete(entryId);
        cb.closest('.playlist-entry-row')?.classList.toggle('playlist-entry-row--selected', checked);
        const span = entryList.querySelector('.playlist-multiselect-count');
        if (span) span.textContent = `${sel.size}`;
      }, {
        rowSelector:  '.playlist-entry-row',
        activeClass:  'playlist-entries--selection',
        skipSelector: 'button, input, .playlist-entry-drag-handle',
      });

      // ── Long-press on any entry row to enter selection mode ──────────────
      this._attachLongPressSelection(entryList, {
        rowSelector:     '.playlist-entry-row',
        skipSelector:    'button, input, .playlist-entry-drag-handle',
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
    }

    body.appendChild(entryList);
    body.appendChild(this._buildGamePicker(playlist));
    block.appendChild(body);
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
      const name  = game.params.vocName ? `«${game.params.vocName}»` : gtype;
      label.textContent = name;
      label.classList.add(`gametype-${game.params.gametype}`);
      const sessionInfo = (isCurrentEntry && session)
        ? { played: entry.repeatCount - session.remainingRepeats, total: entry.repeatCount }
        : null;
      _refreshEntryLabelTooltip(label, game, entry.params ?? {}, sessionInfo);
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
    createCustomTooltip(stepper, 'Количество повторов этой игры');

    // Snapshot how many plays have already happened for this entry at build time.
    // We keep this fixed so that stepper changes (which shift remainingRepeats by
    // the same delta) don't corrupt the played count — only actual game advancement
    // changes remainingRepeats independently of repeatCount.
    const sessionAtBuild = isCurrentEntry && session ? getActivePlaylistSession() : null;
    let playedCount = (isCurrentEntry && sessionAtBuild)
      ? Math.max(0, entry.repeatCount - sessionAtBuild.remainingRepeats)
      : 0;

    this._attachStepperHold(decBtn, () => {
      const next = Math.max(1, entry.repeatCount - 1);
      this.setRepeat(playlist.id, entry.id, next);
      countSpan.textContent = String(next);
      entry.repeatCount = next;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, playedCount, isCurrentEntry);
    });
    this._attachStepperHold(incBtn, () => {
      const next = entry.repeatCount + 1;
      this.setRepeat(playlist.id, entry.id, next);
      countSpan.textContent = String(next);
      entry.repeatCount = next;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, playedCount, isCurrentEntry);
    });
    stepper.append(decBtn, countSpan, incBtn);

    // Remove
    const removeBtn = _el('button', 'playlist-entry-remove');
    removeBtn.innerHTML = icons.delete;
    createCustomTooltip(removeBtn, 'Убрать из плейлиста');
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.removeEntry(playlist.id, entry.id);
      row.remove();
      const list = row.closest('.playlist-entries');
      if (list && !list.querySelector('.playlist-entry-row')) {
        list.innerHTML = '';
        list.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
      }
    });

    // Duplicate — single click appends 1 copy; Ctrl+Click opens the dup bar
    // where the user can set a count (stepper + direct input) and confirm.
    const dupBtn = _el('button', 'playlist-entry-duplicate-btn');
    dupBtn.innerHTML = icons.copy;
    createCustomTooltip(dupBtn, '[Клик] Дублировать в конец плейлиста [Ctrl + Клик] Задать количество копий');
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (e.ctrlKey) {
        const entryList = row.closest('.playlist-entries');
        if (entryList) this._toggleDupBar(playlist, entry, entryList);
        return;
      }
      const copy = this.duplicateEntry(playlist.id, entry.id);
      if (!copy) return;
      const fresh = this.load().find(p => p.id === playlist.id);
      if (!fresh) return;
      const entryList = row.closest('.playlist-entries');
      if (!entryList) return;
      entryList.querySelector('.playlist-entries-empty')?.remove();
      const newRow = this._buildEntryRow(fresh, copy, null, false, fresh.entries.length - 1);
      entryList.appendChild(newRow);
      this._attachEntryDrag(entryList, playlist.id);
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

    row.append(entryPlayBtn, handle, dupBtn, label, stepper, paramsBtn, removeBtn);

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
        // Live-update bar count
        const entryList = row.closest('.playlist-entries');
        const countSpan = entryList?.querySelector('.playlist-multiselect-count');
        if (countSpan) countSpan.textContent = `${sel.size}`;
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
    // Guard against stacking multiple listeners (e.g. live-injected entries)
    if (container.dataset.dragAttached) return;
    container.dataset.dragAttached = '1';

    let dragEl = null, placeholder = null, startY = 0, startIdx = 0;
    let dragGroup = [];   // [dragEl] for single, full contiguous run for group
    let scrollRAF = null; // autoscroll rAF handle

    const getItems = () => Array.from(container.querySelectorAll(itemSelector));

    // Walk up to find the nearest scrollable ancestor for autoscroll.
    const findScrollEl = () => {
      let el = container.parentElement;
      while (el) {
        const ov = getComputedStyle(el).overflowY;
        if (ov === 'auto' || ov === 'scroll') return el;
        el = el.parentElement;
      }
      return null;
    };

    // Kick off (or cancel) edge-triggered autoscroll each mousemove tick.
    const doAutoscroll = clientY => {
      cancelAnimationFrame(scrollRAF);
      const scrollEl = findScrollEl();
      if (!scrollEl) return;
      const r = scrollEl.getBoundingClientRect();
      const ZONE = 48, SPEED = 8;
      const dir = clientY < r.top + ZONE ? -1 : clientY > r.bottom - ZONE ? 1 : 0;
      if (!dir) return;
      const tick = () => { scrollEl.scrollTop += dir * SPEED; scrollRAF = requestAnimationFrame(tick); };
      scrollRAF = requestAnimationFrame(tick);
    };

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

      if (dragGroup.length > 1) {
        // ── Group drag ───────────────────────────────────────────────────────
        // Measure every item before detaching, then use a single-row placeholder
        // so group drag and single drag have the same placeholder height.
        const rects = dragGroup.map(el => el.getBoundingClientRect());
        const singleRowHeight = rects[0].height;

        placeholder = _el('div', 'playlist-entry-placeholder');
        placeholder.style.height = singleRowHeight + 'px';
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
          el.classList.add('playlist-entry-row--group-dragging');
        });
      } else {
        // ── Single drag — existing behaviour ─────────────────────────────────
        const rect = dragEl.getBoundingClientRect();
        dragEl.style.width = rect.width + 'px';
        dragEl.classList.add(draggingClass);
        if (onStart) onStart(dragEl);
        // Re-measure height after onStart — it may have collapsed content (e.g. the
        // playlist body), so the placeholder should reflect the post-collapse size.
        const placeholderHeight = dragEl.getBoundingClientRect().height;
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

      if (dragGroup.length > 1) {
        dragGroup.forEach(el => { el.style.top = (el._dragOrigTop + dy) + 'px'; });
      } else {
        dragEl.style.transform = `translateY(${dy}px)`;
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

      doAutoscroll(e.clientY);
    };

    const onUp = () => {
      if (!dragEl) return;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(scrollRAF);

      if (dragGroup.length > 1) {
        // Clear inline styles (only the measured pixel coords were set inline;
        // static visual properties are handled by the CSS class removed below).
        dragGroup.forEach(el => {
          ['top', 'left', 'width']
            .forEach(p => { el.style[p] = ''; });
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
    };
  },

  // ── Multi-select action bar ────────────────────────────────────────────────
  // entryList is passed so that select-all / deselect / exit can update
  // checkboxes and row classes in-place without a full refresh().
  _buildMultiSelectBar(playlist, sel, entryList) {
    const bar = _el('div', 'playlist-multiselect-bar');

    // Shared helper: exit selection mode in-place without refresh()
    const exitSelectionMode = () => {
      sel.clear();
      this._selectionMode.delete(playlist.id);
      entryList.classList.remove('playlist-entries--selection');
      window.getSelection()?.removeAllRanges();
      // Multiselect bar is now hidden — reset its height var so the dup bar
      // (if open) re-sticks directly below the playlist header.
      const block = entryList.closest('.playlist-block');
      if (block) block.style.setProperty('--playlist-multiselect-bar-height', '0px');
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => { cb.checked = false; });
      entryList.querySelectorAll('.playlist-entry-row--selected').forEach(r => r.classList.remove('playlist-entry-row--selected'));
      countSpan.textContent = '0';
      // Also close the bulk params panel if it was open
      const bulkParams = entryList.querySelector('.playlist-bulk-params');
      if (bulkParams) {
        bulkParams.remove();
        bar.classList.remove('playlist-multiselect-bar--params-open');
      }
    };

    // Left side: count + select-all + deselect + exit
    const countSpan  = _el('span', 'playlist-multiselect-count', `${sel.size}`);

    const selAllBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--neutral');
    selAllBtn.textContent = 'Все';
    createCustomTooltip(selAllBtn, 'Выбрать все');
    selAllBtn.addEventListener('click', e => {
      e.stopPropagation();
      playlist.entries.forEach(en => sel.add(en.id));
      // Tick every checkbox and highlight every row in-place
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => {
        cb.checked = true;
        cb.closest('.playlist-entry-row')?.classList.add('playlist-entry-row--selected');
      });
      countSpan.textContent = `${sel.size}`;
    });

    const deselBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--neutral');
    deselBtn.textContent = 'Снять';
    createCustomTooltip(deselBtn, 'Снять выделение');
    deselBtn.addEventListener('click', e => {
      e.stopPropagation();
      sel.clear();
      entryList.querySelectorAll('.playlist-entry-checkbox').forEach(cb => { cb.checked = false; });
      entryList.querySelectorAll('.playlist-entry-row--selected').forEach(r => r.classList.remove('playlist-entry-row--selected'));
      countSpan.textContent = '0';
    });

    const exitBtn = _el('button', 'playlist-multiselect-exit');
    exitBtn.innerHTML = icons.x;
    createCustomTooltip(exitBtn, 'Выйти из режима выбора');
    exitBtn.addEventListener('click', e => {
      e.stopPropagation();
      exitSelectionMode();
    });

    // Right side: repeat stepper + duplicate + params + remove
    const repCount = { value: 1 };
    const repStepper  = _el('div', 'playlist-multiselect-stepper');
    const repDecBtn   = _el('button', 'playlist-stepper-btn');
    repDecBtn.innerHTML = icons.chevronLeft;
    const repCountSpan = _el('span', 'playlist-stepper-count', '1');
    const repIncBtn   = _el('button', 'playlist-stepper-btn');
    repIncBtn.innerHTML = icons.chevronRight;
    repStepper.append(repDecBtn, repCountSpan, repIncBtn);
    createCustomTooltip(repStepper, 'Задать повторы для выбранных');

    const applyBulkRepeat = () => {
      this.bulkSetRepeat(playlist.id, [...sel], repCount.value);
      // Update each affected entry row's stepper count in-place without a full refresh
      const entryList = repStepper.closest('.playlist-entries');
      if (entryList) {
        sel.forEach(entryId => {
          const row  = entryList.querySelector(`.playlist-entry-row[data-entry-id="${entryId}"]`);
          const span = row?.querySelector('.playlist-stepper-count');
          if (span) span.textContent = String(repCount.value);
        });
      }
    };

    this._attachStepperHold(repDecBtn, () => {
      if (sel.size === 0) return;
      repCount.value = Math.max(1, repCount.value - 1);
      repCountSpan.textContent = String(repCount.value);
      applyBulkRepeat();
    });
    this._attachStepperHold(repIncBtn, () => {
      if (sel.size === 0) return;
      repCount.value++;
      repCountSpan.textContent = String(repCount.value);
      applyBulkRepeat();
    });

    const dupBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--copy');
    dupBtn.innerHTML = icons.copy;
    createCustomTooltip(dupBtn, 'Дублировать выбранные');
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.bulkDuplicateEntries(playlist.id, [...sel]);
      this.refresh();
    });

    const paramsBtn = _el('button', 'playlist-multiselect-btn playlist-multiselect-btn--params');
    paramsBtn.innerHTML = icons.parameters;
    createCustomTooltip(paramsBtn, 'Задать параметры для выбранных');
    paramsBtn.addEventListener('click', e => {
      e.stopPropagation();
      const entryList = paramsBtn.closest('.playlist-entries');
      if (!entryList) return;
      const existing = entryList.querySelector('.playlist-bulk-params');
      if (existing) {
        existing.remove();
        bar.classList.remove('playlist-multiselect-bar--params-open');
        return;
      }
      bar.insertAdjacentElement('afterend', this._buildBulkParamsSection(playlist, [...sel]));
      bar.classList.add('playlist-multiselect-bar--params-open');
      // Measure bar height now that it's visible and set the CSS var on the block
      // so .playlist-bulk-params knows exactly where to stick (header + bar).
      requestAnimationFrame(() => {
        const block = bar.closest('.playlist-block');
        if (block) {
          block.style.setProperty('--playlist-multiselect-bar-height', `${bar.offsetHeight}px`);
        }
      });
    });

    const removeBtn = _el('button', 'playlist-multiselect-remove');
    removeBtn.innerHTML = icons.delete;
    createCustomTooltip(removeBtn, 'Убрать выбранные из плейлиста');
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const n = sel.size;
      if (!n) return;
      const word = n === 1 ? 'игру' : n < 5 ? 'игры' : 'игр';
      if (!confirm(`Убрать ${n} ${word} из плейлиста?`)) return;
      this.bulkRemoveEntries(playlist.id, [...sel]);
      this.refresh();
    });

    const left = _el('div', 'playlist-multiselect-left');
    left.append(countSpan, selAllBtn, deselBtn, exitBtn);
    const right = _el('div', 'playlist-multiselect-right');
    right.append(repStepper, dupBtn, paramsBtn, removeBtn);
    bar.append(left, right);
    return bar;
  },

  // ── Per-entry duplicate bar ────────────────────────────────────────────────
  // Toggle: if a dup bar for this entry is already open, close it; otherwise
  // close any other open dup bar in the list and open one for this entry.
  _toggleDupBar(playlist, entry, entryList) {
    const existing = entryList.querySelector('.playlist-dup-bar');
    if (existing) {
      const wasFor = existing.dataset.entryId === entry.id;
      existing.remove();
      if (wasFor) return; // clicked Ctrl+same row → just close
    }
    const bar = this._buildDupBar(playlist, entry, entryList);
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

  _buildDupBar(playlist, entry, entryList) {
    const DUP_MAX = 50;
    const dupCount = { value: 1 };
    const bar = _el('div', 'playlist-dup-bar');
    bar.dataset.entryId = entry.id;

    // ── Input — direct number entry; overrides stepper when non-empty ─────
    const input = _el('input', 'playlist-dup-input');
    createCustomTooltip(input, `Количество копий (макс. ${DUP_MAX})`);
    input.type        = 'number';
    input.min         = '1';
    input.max         = String(DUP_MAX);
    input.addEventListener('click',   e => e.stopPropagation());
    input.addEventListener('keydown', e => e.stopPropagation());
    input.addEventListener('input', e => {
      e.stopPropagation();
      const v = parseInt(input.value, 10);
      // Live-clamp only on explicit out-of-range to not interfere while typing
      if (!isNaN(v)) {
        const clamped = Math.max(1, Math.min(DUP_MAX, v));
        if (v !== clamped) input.value = String(clamped);
        dupCount.value = clamped;
        stepperCountSpan.textContent = String(clamped);
      }
    });

    // ── Stepper — active only when input is empty ─────────────────────────
    const stepperWrap   = _el('div', 'playlist-multiselect-stepper');
    const decBtn        = _el('button', 'playlist-stepper-btn');
    decBtn.innerHTML    = icons.chevronLeft;
    const stepperCountSpan = _el('span', 'playlist-stepper-count', '1');
    const incBtn        = _el('button', 'playlist-stepper-btn');
    incBtn.innerHTML    = icons.chevronRight;
    stepperWrap.append(decBtn, stepperCountSpan, incBtn);
    createCustomTooltip(stepperWrap, `Количество копий (макс. ${DUP_MAX})`);

    const getEffectiveCount = () => {
      const v = parseInt(input.value, 10);
      return (!input.value.trim() || isNaN(v)) ? dupCount.value : Math.max(1, Math.min(DUP_MAX, v));
    };

    this._attachStepperHold(decBtn, () => {
      if (input.value.trim()) return; // input has priority — stepper is ignored
      dupCount.value = Math.max(1, dupCount.value - 1);
      stepperCountSpan.textContent = String(dupCount.value);
    });
    this._attachStepperHold(incBtn, () => {
      if (input.value.trim()) return;
      dupCount.value = Math.min(DUP_MAX, dupCount.value + 1);
      stepperCountSpan.textContent = String(dupCount.value);
    });

    // ── Confirm ───────────────────────────────────────────────────────────
    const confirmBtn = _el('button', 'playlist-dup-confirm');
    confirmBtn.textContent = 'Дублировать';
    confirmBtn.addEventListener('click', e => {
      e.stopPropagation();
      const n = getEffectiveCount();
      const fresh = this.load().find(p => p.id === playlist.id);
      if (!fresh) return;
      entryList.querySelector('.playlist-entries-empty')?.remove();
      for (let i = 0; i < n; i++) {
        const copy = this.duplicateEntry(playlist.id, entry.id);
        if (!copy) break;
        const refreshed = this.load().find(p => p.id === playlist.id);
        if (!refreshed) break;
        const newRow = this._buildEntryRow(refreshed, copy, null, false, refreshed.entries.length - 1);
        entryList.appendChild(newRow);
      }
      this._attachEntryDrag(entryList, playlist.id);
      bar.remove();
    });

    // ── Cancel ────────────────────────────────────────────────────────────
    const cancelBtn = _el('button', 'playlist-dup-cancel');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); bar.remove(); });

    // Enter key in input confirms
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.stopPropagation(); confirmBtn.click(); }
      if (e.key === 'Escape') { e.stopPropagation(); bar.remove(); }
    });

    bar.append(stepperWrap, input, confirmBtn, cancelBtn);
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
      this.refresh();
    });

    const clearBtn = _el('button', 'playlist-bulk-params-clear');
    clearBtn.textContent = 'Сбросить';
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.bulkSetParams(playlist.id, entryIds, { type: null, timeout: null, idletime: null });
      this.refresh();
    });

    const cancelBtn = _el('button', 'playlist-bulk-params-cancel');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); closePanel(); });

    actionRow.append(applyBtn, clearBtn, cancelBtn);
    section.appendChild(actionRow);
    return section;
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
    form.appendChild(nameRow);

    // ── Group shortcuts ────────────────────────────────────────────────────────
    if (this.main) {
      const groups = this.main.groupsManager.groups.filter(g => g.games.length > 0);
      if (groups.length) {
        const groupsToggle = _el('button', 'playlists-create-groups-toggle');
        groupsToggle.innerHTML = `${icons.plus}<span>Из группы</span>`;
        form.appendChild(groupsToggle);

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
            createCustomTooltip(btn, `Плейлист «${group.title}» уже создан из этой группы`);

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
      }
    }

    return form;
  },

  _buildGamePicker(playlist) {
    const picker = _el('div', 'playlist-game-picker');

    // ── Button row: single "Add games" toggle ─────────────────────────────
    const btnRow    = _el('div', 'playlist-picker-btn-row');
    const toggleBtn = _el('button', 'playlist-picker-toggle');
    toggleBtn.innerHTML = `${icons.plus}<span>Добавить игры</span>`;
    createCustomTooltip(toggleBtn, 'Показать список игр для добавления в плейлист');

    btnRow.append(toggleBtn);
    picker.appendChild(btnRow);

    // ── Picker body — portaled to popup root so it floats above playlists-list
    const body = _el('div', 'playlist-picker-body playlist-picker-body--hidden playlist-picker-body--overlay');

    // ── Dedicated close footer inside the overlay (never moves, always at bottom) ──
    const overlayFooter   = _el('div', 'playlist-picker-overlay-footer');
    const collapseBtn     = _el('button', 'playlist-picker-toggle');
    collapseBtn.innerHTML = `${icons.chevronLeft}<span>Свернуть</span>`;
    createCustomTooltip(collapseBtn, 'Закрыть список игр и вернуться к плейлисту');

    const filtersBtn      = _el('button', 'playlist-picker-toggle playlist-picker-filters-btn');
    filtersBtn.innerHTML  = `<span>Фильтры</span>`;
    createCustomTooltip(filtersBtn, '[Клик] Показать / Скрыть фильтр по группам [ЛКМ + Перетаскивание] Множественный выбор групп');

    overlayFooter.append(collapseBtn, filtersBtn);

    // ── Open / close helpers ───────────────────────────────────────────────
    const _positionOverlay = () => {
      const popup = PlaylistsManager.popup;
      if (!popup || body.classList.contains('playlist-picker-body--hidden')) return;
      const header = popup.querySelector('.popup-header');
      const pr = popup.getBoundingClientRect();
      const top = header
        ? Math.round(header.getBoundingClientRect().bottom - pr.top)
        : 0;
      body.style.top = top + 'px';
    };

    const openPicker = () => {
      const popup = PlaylistsManager.popup;
      if (!popup) return;
      if (!popup.contains(body)) popup.appendChild(body);
      body.classList.remove('playlist-picker-body--hidden');
      toggleBtn.innerHTML = `${icons.chevronLeft}<span>Свернуть</span>`;
      _positionOverlay();
      requestAnimationFrame(() => { syncHeights(); PlaylistsManager._constrain(); });
    };

    const closePicker = () => {
      // Exit picker selection mode and clear all row selections on close
      body.classList.remove('playlist-picker-body--selection');
      window.getSelection()?.removeAllRanges();
      pickerSel.clear();
      body.querySelectorAll('.playlist-picker-checkbox').forEach(cb => { cb.checked = false; });
      body.querySelectorAll('.playlist-picker-game-row').forEach(r => r.classList.remove('picker-row--selected'));
      updateConfirmBar();
      body.classList.add('playlist-picker-body--hidden');
      toggleBtn.innerHTML = `${icons.plus}<span>Добавить игры</span>`;
      requestAnimationFrame(() => PlaylistsManager._constrain());
    };

    // toggleBtn in picker (sticky bottom of playlists-list) — always visible
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      body.classList.contains('playlist-picker-body--hidden') ? openPicker() : closePicker();
    });

    // collapseBtn in overlay footer — mirrors the same action
    collapseBtn.addEventListener('click', e => {
      e.stopPropagation();
      closePicker();
    });

    // filtersBtn wired after groupFilterRow is defined (see below)

    if (!this.main) { picker.append(body); return picker; }

    // ── Search ─────────────────────────────────────────────────────────────
    const searchWrap  = _el('div', 'playlist-picker-search-wrap');
    const searchInput = _el('input', 'playlist-search-input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Поиск по названию...';
    searchWrap.appendChild(searchInput);
    searchInput.addEventListener('click', e => e.stopPropagation());

    // ── Group filter chip strip — always visible when picker is open ──────
    const groupFilterRow = _el('div', 'playlist-picker-group-filter playlist-picker-group-filter--hidden');
    const activeGroups   = new Set();
    let   chipDragState  = null;

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
    confirmAddBtn.textContent  = 'Добавить';
    const confirmClearBtn = _el('button', 'playlist-picker-confirm-clear');
    confirmClearBtn.textContent = 'Снять';
    confirmBar.append(confirmCount, confirmAddBtn, confirmClearBtn);

    // ── Sync CSS vars for sticky top offsets ──────────────────────────────
    const syncHeights = () => {
      requestAnimationFrame(() => {
        const sh = searchWrap.offsetHeight;
        const filterVisible = !groupFilterRow.classList.contains('playlist-picker-group-filter--hidden');
        const gh = filterVisible ? groupFilterRow.offsetHeight : 0;
        body.style.setProperty('--picker-search-height',       `${sh}px`);
        body.style.setProperty('--picker-group-filter-height', `${gh}px`);
        const ch = confirmBar.classList.contains('playlist-picker-confirm-bar--hidden')
          ? 0 : confirmBar.offsetHeight;
        body.style.setProperty('--picker-confirm-height', `${ch}px`);
      });
    };

    // ── Combined filter: text + group chips ────────────────────────────────
    const applyFilter = () => {
      const term    = searchInput.value.toLowerCase().trim();
      const byGroup = activeGroups.size > 0;
      const visibleHeaders = new Set();
      allRows.forEach(({ gameRow, groupHeader, name, groupTitle }) => {
        const show = (!term || name.includes(term)) && (!byGroup || activeGroups.has(groupTitle));
        gameRow.style.display = show ? '' : 'none';
        if (show) visibleHeaders.add(groupHeader);
      });
      body.querySelectorAll('.playlist-picker-group-header').forEach(h => {
        h.style.display = visibleHeaders.has(h) ? '' : 'none';
      });
    };

    // ── Confirm bar update ─────────────────────────────────────────────────
    const updateConfirmBar = () => {
      confirmCount.textContent = `${pickerSel.size}`;
      const visible = pickerSel.size > 0;
      confirmBar.classList.toggle('playlist-picker-confirm-bar--hidden', !visible);
      syncHeights();
    };

    // ── Inject newly added entries into the live entry list ────────────────
    // picker (btn-row) stays in its original DOM place even after body is
    // portaled, so picker.closest() still resolves the playlist-block correctly.
    const injectAddedEntries = (block, countBefore) => {
      const entryList = block?.querySelector('.playlist-entries');
      if (!entryList) return;
      entryList.querySelector('.playlist-entries-empty')?.remove();
      const fresh = this.load().find(p => p.id === playlist.id);
      if (!fresh) return;
      fresh.entries.slice(countBefore).forEach((newEntry, i) => {
        playlist.entries.push(newEntry);
        const newRow = this._buildEntryRow(fresh, newEntry, null, false, countBefore + i);
        entryList.appendChild(newRow);
      });
      this._attachEntryDrag(entryList, playlist.id);
    };

    confirmAddBtn.addEventListener('click', e => {
      e.stopPropagation();
      const countBefore = playlist.entries.length;
      pickerSel.forEach(gameId => {
        this.addEntry(playlist.id, gameId, 1);
        const gameRow = body.querySelector(`.playlist-picker-game-row[data-game-id="${gameId}"]`);
        if (gameRow) {
          gameRow.classList.add('already-added');
          const cb = gameRow.querySelector('.playlist-picker-checkbox');
          if (cb) { cb.checked = false; cb.disabled = true; }
          const btn = gameRow.querySelector('.playlist-picker-add-btn');
          if (btn) { btn.innerHTML = icons.checkmark; btn.disabled = true; }
        }
      });
      pickerSel.clear();
      // Exit picker selection mode after bulk-add
      body.classList.remove('playlist-picker-body--selection');
      window.getSelection()?.removeAllRanges();
      updateConfirmBar();
      injectAddedEntries(picker.closest('.playlist-block'), countBefore);
    });

    confirmClearBtn.addEventListener('click', e => {
      e.stopPropagation();
      pickerSel.clear();
      // Exit picker selection mode on clear
      body.classList.remove('playlist-picker-body--selection');
      window.getSelection()?.removeAllRanges();
      body.querySelectorAll('.playlist-picker-checkbox').forEach(cb => { cb.checked = false; });
      body.querySelectorAll('.playlist-picker-game-row').forEach(r => r.classList.remove('picker-row--selected'));
      updateConfirmBar();
    });

    // ── Build game rows (keyed by group) ───────────────────────────────────
    const allRows = [];
    this.main.groupsManager.groups.forEach(group => {
      if (!group.games.length) return;

      const groupHeader = _el('div', 'playlist-picker-group-header', group.title);
      body.appendChild(groupHeader);

      group.games.forEach(game => {
        const alreadyAdded = playlist.entries.some(e => e.gameId === game.id);
        const gtype   = gameTypes[game.params.gametype] || game.params.gametype;
        const name    = game.params.vocName ? `«${game.params.vocName}»` : gtype;
        const gameRow = _el('div', `playlist-picker-game-row${alreadyAdded ? ' already-added' : ''}`);
        gameRow.dataset.gameId = game.id;

        // ── Checkbox — always in DOM; CSS hides it until playlist-picker-body--selection ──
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
        const descSpan = _el('span', 'playlist-picker-game-desc', `${visLabel} · TM ${game.params.timeout}`);

        const addBtn = _el('button', 'playlist-picker-add-btn');
        addBtn.innerHTML = alreadyAdded ? icons.checkmark : icons.plus;
        createCustomTooltip(addBtn, alreadyAdded ? 'Уже в плейлисте' : 'Добавить в плейлист');

        if (!alreadyAdded) {
          addBtn.addEventListener('click', e => {
            e.stopPropagation();
            const countBefore = playlist.entries.length;
            this.addEntry(playlist.id, game.id, 1);
            addBtn.innerHTML = icons.checkmark;
            addBtn.disabled  = true;
            gameRow.classList.add('already-added');
            const cb = gameRow.querySelector('.playlist-picker-checkbox');
            if (cb) { cb.checked = false; cb.disabled = true; }
            pickerSel.delete(game.id);
            gameRow.classList.remove('picker-row--selected');
            updateConfirmBar();
            injectAddedEntries(picker.closest('.playlist-block'), countBefore);
          });
        } else {
          addBtn.disabled = true;
        }

        gameRow.append(nameSpan, descSpan, addBtn);
        body.appendChild(gameRow);
        allRows.push({ gameRow, groupHeader, name: name.toLowerCase(), groupTitle: group.title });
      });
    });

    // ── Drag-to-select on game rows — always attached; checkboxes always in DOM ──
    this._attachDragSelect(body, '.playlist-picker-checkbox', (cb, checked) => {
      const gameId  = cb.dataset.gameId;
      const gameRow = cb.closest('.playlist-picker-game-row');
      checked ? pickerSel.add(gameId) : pickerSel.delete(gameId);
      gameRow?.classList.toggle('picker-row--selected', checked);
      updateConfirmBar();
    }, {
      rowSelector:  '.playlist-picker-game-row',
      activeClass:  'playlist-picker-body--selection',
      skipSelector: 'button, input',
    });

    // ── Long-press on any game row to enter picker selection mode ──────────
    this._attachLongPressSelection(body, {
      rowSelector:     '.playlist-picker-game-row',
      skipSelector:    'button, input',
      activeClass:     'playlist-picker-body--selection',
      isAlreadyActive: () => body.classList.contains('playlist-picker-body--selection'),
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

    if (!allRows.length) body.appendChild(_el('div', 'playlist-picker-empty', 'Нет доступных игр'));

    // ── Build group chips (one per unique group that has games) ───────────
    const groupsWithGames = [...new Set(allRows.map(r => r.groupTitle))];
    groupsWithGames.forEach(groupTitle => {
      const chip = _el('button', 'playlist-picker-group-chip');
      chip.textContent        = groupTitle;
      chip.dataset.groupTitle = groupTitle;
      createCustomTooltip(chip, `Показать только группу «${groupTitle}»`);
      groupFilterRow.appendChild(chip);
    });

    // Chip state helper
    const applyChipState = (chip, state) => {
      chip.classList.toggle('active', state);
      state ? activeGroups.add(chip.dataset.groupTitle) : activeGroups.delete(chip.dataset.groupTitle);
    };

    // Drag-to-toggle chips — LMB down sets intent, mouseover spreads it
    groupFilterRow.addEventListener('mousedown', e => {
      const chip = e.target.closest('.playlist-picker-group-chip');
      if (!chip) return;
      e.preventDefault();
      chipDragState = !chip.classList.contains('active');
      applyChipState(chip, chipDragState);
      applyFilter();
    });
    groupFilterRow.addEventListener('mouseover', e => {
      if (chipDragState === null || e.buttons !== 1) { chipDragState = null; return; }
      const chip = e.target.closest('.playlist-picker-group-chip');
      if (chip && chip.classList.contains('active') !== chipDragState) {
        applyChipState(chip, chipDragState);
        applyFilter();
      }
    });
    document.addEventListener('mouseup', () => { chipDragState = null; }, { capture: true });

    searchInput.addEventListener('input', () => applyFilter());

    // ── Assemble body (prepend sticky controls, game rows already appended)
    // Final DOM order: searchWrap → groupFilterRow → confirmBar → [rows] → overlayFooter
    body.prepend(confirmBar);
    if (groupsWithGames.length > 0) body.prepend(groupFilterRow);
    body.prepend(searchWrap);
    body.append(overlayFooter);

    // body stays detached until openPicker() portals it to the popup root.
    // picker only ever contains btnRow (sticky bottom of playlists-list).
    return picker;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update the HUD playlist indicator text in-place (called on stepper change)
// ─────────────────────────────────────────────────────────────────────────────
function _updatePlaylistHud() {
  try {
    PlaylistsManager.main?.pageHandler?.gamesDataContainer?.updatePlaylistIndicator();
  } catch { }
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