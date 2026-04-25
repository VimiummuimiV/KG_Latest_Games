import { createCustomTooltip } from './tooltip.js';
import { icons } from './icons.js';
import { gameTypes, visibilities, timeouts, idleTimes } from './definitions.js';
import { generateRandomString, getCurrentPage } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Storage / session keys
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'latestGamesPlaylists';
const SESSION_KEY = 'latestGames_activePlaylist';

// ─────────────────────────────────────────────────────────────────────────────
// Session helpers
// ─────────────────────────────────────────────────────────────────────────────
export function getActivePlaylistSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setActivePlaylistSession(data) {
  try {
    if (data) sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { }
}

/** Cancel the active playlist. */
export function cancelActivePlaylist() {
  const session = getActivePlaylistSession();
  if (!session) return;
  // Restore shouldStart / shouldReplay / replayNextGame / replayWithoutWaiting to pre-playlist values if we had overridden them
  try {
    const saved = JSON.parse(sessionStorage.getItem('latestGames_prePlaylistSettings') || 'null');
    if (saved && PlaylistsManager.main) {
      PlaylistsManager.main.shouldStart    = saved.shouldStart;
      PlaylistsManager.main.shouldReplay   = saved.shouldReplay;
      PlaylistsManager.main.replayNextGame = saved.replayNextGame;
      PlaylistsManager.main.replayWithoutWaiting = saved.replayWithoutWaiting;
      PlaylistsManager.main.settingsManager.saveSettings();
    }
  } catch { }
  sessionStorage.removeItem('latestGames_prePlaylistSettings');
  setActivePlaylistSession(null);
}

// Returns the URL for the current active playlist entry, or null if none.
export function getActivePlaylistUrl(main) {
  const session = getActivePlaylistSession();
  if (!session) return null;
  try {
    const playlist = PlaylistsManager.load().find(p => p.id === session.playlistId);
    const entry = playlist?.entries[session.entryIndex];
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

  let { entryIndex, remainingRepeats } = session;
  remainingRepeats--;

  if (remainingRepeats > 0) {
    setActivePlaylistSession({ ...session, remainingRepeats });
  } else {
    entryIndex++;
    if (entryIndex >= playlist.entries.length) {
      _finishPlaylist(main, playlist);
      return false;
    }
    const nextEntry = playlist.entries[entryIndex];
    setActivePlaylistSession({ playlistId: session.playlistId, entryIndex, remainingRepeats: nextEntry.repeatCount });
  }

  const updated = getActivePlaylistSession();
  const entry   = playlist.entries[updated.entryIndex];
  const game    = main.gamesManager.findGameById(entry.gameId);
  // Skip deleted/missing games by recursing
  if (!game) return advancePlaylist(main);

  return { url: _generatePlaylistEntryLink(main, game, entry) };
}

function _finishPlaylist(main, playlist) {
  cancelActivePlaylist(); // restores settings
  const name = playlist?.title || 'Плейлист';
  // Friendly completion alert
  setTimeout(() => alert(`✅ Плейлист «${name}» завершён!`), 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-entry param override helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true when the entry has at least one param override set. */
function _hasEntryParamOverrides(params) {
  return !!(params && ('type' in params || 'timeout' in params || 'idletime' in params));
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
 * Build the collapsible per-entry params section that lets the user override
 * type (visibility), timeout and idletime for this specific playlist entry.
 */
function _buildParamsSection(playlist, entry, paramsBtn) {
  if (!entry.params) entry.params = {};
  const ep = entry.params;

  const section = _el('div', 'playlist-entry-params');

  // Enforce: открытый (normal) cannot have timeout 5 — bump to 10 automatically.
  function syncConstraints() {
    const isNormal = (ep.type ?? null) === 'normal';
    section.querySelectorAll('.playlist-entry-params-option[data-group="timeout"]').forEach(btn => {
      const isBlocked = isNormal && Number(btn.dataset.val) === 5;
      btn.disabled = isBlocked;
      btn.classList.toggle('playlist-entry-params-option--disabled', isBlocked);
    });
    // Auto-bump: if normal is now active and timeout override is 5, switch to 10
    if (isNormal && ep.timeout === 5) {
      ep.timeout = 10;
      section.querySelectorAll('.playlist-entry-params-option[data-group="timeout"]').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.val) === ep.timeout);
      });
      PlaylistsManager.setEntryParams(playlist.id, entry.id, ep);
    }
  }

  function _persistAndRefresh() {
    PlaylistsManager.setEntryParams(playlist.id, entry.id, ep);
    syncConstraints();
    const hasOv = _hasEntryParamOverrides(ep);
    paramsBtn.classList.toggle('has-overrides', hasOv);
    createCustomTooltip(paramsBtn, hasOv
      ? 'Параметры переопределены · Клик для изменения'
      : 'Переопределить параметры (режим, TM, AFK)');

    // Also refresh the entry label tooltip so it reflects the latest overrides
    const row = paramsBtn.closest('.playlist-entry-row');
    if (row) {
      const label = row.querySelector('.playlist-entry-label');
      const game = PlaylistsManager.main?.gamesManager?.findGameById(entry.gameId);
      if (label && game) {
        const visLabel = visibilities[ep.type ?? game.params.type] || (ep.type ?? game.params.type);
        const tmVal    = ep.timeout  ?? game.params.timeout;
        const afkVal   = ep.idletime ?? game.params.idletime;
        let tip = `[Режим] ${visLabel}[TM] ${tmVal}`;
        if (afkVal) tip += `[AFK] ${afkVal}`;
        if (hasOv) tip += `[Параметры] переопределены`;
        createCustomTooltip(label, tip);
      }
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
        _persistAndRefresh();
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

  // Apply initial constraint state (e.g. params loaded from storage)
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
    const playlist = { id: generateRandomString(), title: name, entries: [] };
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
        if (entryIdx === session.entryIndex) {
          const delta = newCount - oldCount;
          const newRemaining = Math.min(newCount, Math.max(1, session.remainingRepeats + delta));
          setActivePlaylistSession({ ...session, remainingRepeats: newRemaining });
        }
      }
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

  // ── Playback ───────────────────────────────────────────────────────────────
  startPlaylist(playlistId) {
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

    this._activatePlaylistSettings();

    const firstEntry = playlist.entries[0];
    const game = this.main.gamesManager.findGameById(firstEntry.gameId);
    if (!game) { alert('⚠️ Первая игра плейлиста не найдена.'); return; }

    setActivePlaylistSession({ playlistId, entryIndex: 0, remainingRepeats: firstEntry.repeatCount });
    window.location.href = _generatePlaylistEntryLink(this.main, game, firstEntry);
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
      const entry = playlist.entries[session.entryIndex];
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

  // Save current auto-start/replay settings and force all of them on for playlist playback.
  // Called before starting any playlist (from startPlaylist and per-entry play button).
  _activatePlaylistSettings() {
    try {
      sessionStorage.setItem('latestGames_prePlaylistSettings', JSON.stringify({
        shouldStart:          this.main.shouldStart,
        shouldReplay:         this.main.shouldReplay,
        replayNextGame:       this.main.replayNextGame,
        replayWithoutWaiting: this.main.replayWithoutWaiting
      }));
    } catch { }
    this.main.shouldStart          = true;
    this.main.shouldReplay         = true;
    this.main.replayNextGame       = true;
    this.main.replayWithoutWaiting = true;
    this.main.settingsManager.saveSettings();
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

    const addBtn = _el('button', 'playlists-add-btn');
    addBtn.innerHTML = `${icons.plus}<span>Новый</span>`;
    createCustomTooltip(addBtn, 'Создать новый плейлист');
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      const t = prompt('Название плейлиста:');
      if (t === null) return; // cancelled
      const created = this.createPlaylist(t);
      this.expandedPlaylistId = created.id;
      this.refresh();
    });

    header.append(titleSpan, addBtn);
    panel.appendChild(header);

    if (!playlists.length) {
      panel.appendChild(_el('div', 'playlists-empty', 'Нет плейлистов. Создайте первый!'));
      return panel;
    }

    const list = _el('div', 'playlists-list');
    playlists.forEach(playlist => list.appendChild(this._buildPlaylistBlock(playlist, session)));
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
    const row = _el('div', `playlist-header-row${isActive ? ' playlist-header-row--active' : ''}`);

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
          const playlists = this.load();
          const pl = playlists.find(p => p.id === current.playlistId);
          const entry = pl?.entries[current.entryIndex];
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
          this.refresh();
        }
      });

      const stopBtn = _el('button', 'playlist-cancel-btn');
      stopBtn.innerHTML = icons.stop;
      createCustomTooltip(stopBtn, `Остановить плейлист «${playlist.title}»`);
      stopBtn.addEventListener('click', e => {
        e.stopPropagation();
        cancelActivePlaylist();
        this.refresh();
      });

      const titleSpan = _el('span', 'playlist-title', playlist.title);
      const entry = playlist.entries[session.entryIndex];
      if (entry) {
        const badge = _el('span', 'playlist-active-badge',
          `${session.entryIndex + 1}/${playlist.entries.length} · ×${session.remainingRepeats}`);
        createCustomTooltip(badge,
          `[Плейлист] ${playlist.title}[Позиция] ${session.entryIndex + 1} из ${playlist.entries.length}[Осталось повторов] ${session.remainingRepeats}`);
        titleSpan.appendChild(badge);
      }

      row.append(pauseBtn, stopBtn, titleSpan);
    } else {
      // Inactive: play button on left, rename + delete on right
      const playBtn = _el('button', 'playlist-play-btn');
      playBtn.innerHTML = icons.start;
      createCustomTooltip(playBtn, `Запустить плейлист «${playlist.title}»`);
      playBtn.addEventListener('click', e => { e.stopPropagation(); this.startPlaylist(playlist.id); });

      const titleSpan = _el('span', 'playlist-title', playlist.title);

      const renameBtn = _el('button', 'playlist-rename-btn');
      renameBtn.innerHTML = icons.rename;
      createCustomTooltip(renameBtn, 'Переименовать');
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        const t = prompt('Новое название:', playlist.title);
        if (t && t.trim()) { this.renamePlaylist(playlist.id, t); this.refresh(); }
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
      row.append(playBtn, titleSpan, renameBtn, delBtn);
    }

    // Toggle expand on row click (excluding buttons)
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      this.expandedPlaylistId = isExpanded && !isActive ? null : playlist.id;
      this.refresh();
    });

    block.appendChild(row);

    if (!isExpanded) return block;

    // Collapsible body
    const body = _el('div', 'playlist-body');

    // Entry list (no search here — entries list is short)
    const entryList = _el('div', 'playlist-entries');

    if (!playlist.entries.length) {
      entryList.appendChild(_el('div', 'playlist-entries-empty', 'Нет игр. Добавьте из групп ниже.'));
    } else {
      playlist.entries.forEach((entry, idx) => {
        const isCurrentEntry = isActive && session.entryIndex === idx;
        const row = this._buildEntryRow(playlist, entry, session, isCurrentEntry, idx);
        entryList.appendChild(row);
      });
      // Entry drag-to-reorder (vertical, same feel as game buttons)
      this._attachEntryDrag(entryList, playlist.id);
    }

    body.appendChild(entryList);
    body.appendChild(this._buildGamePicker(playlist));
    block.appendChild(body);
    return block;
  },

  _buildEntryRow(playlist, entry, session, isCurrentEntry, entryIndex) {
    const game = this.main?.gamesManager?.findGameById(entry.gameId) ?? null;
    const row  = _el('div', `playlist-entry-row${isCurrentEntry ? ' playlist-entry-row--active' : ''}`);
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
      const visLabel = visibilities[entry.params?.type ?? game.params.type] || (entry.params?.type ?? game.params.type);
      const tmVal    = entry.params?.timeout  ?? game.params.timeout;
      const afkVal   = entry.params?.idletime ?? game.params.idletime;
      let tip = `[Режим] ${visLabel}[TM] ${tmVal}`;
      if (afkVal) tip += `[AFK] ${afkVal}`;
      if (_hasEntryParamOverrides(entry.params)) tip += `[Параметры] переопределены`;
      if (isCurrentEntry && session) {
        const played = entry.repeatCount - session.remainingRepeats;
        tip += `[Пройдено] ${played} из ${entry.repeatCount}`;
      }
      createCustomTooltip(label, tip);
    } else {
      label.textContent = `#${entry.gameId} (удалена)`;
      label.classList.add('playlist-entry-missing');
    }

    // Stepper
    const stepper  = _el('div', 'playlist-entry-stepper');
    const decBtn   = _el('button', 'playlist-entry-stepper-btn');
    decBtn.innerHTML = icons.chevronLeft;
    const countSpan = _el('span', 'playlist-entry-stepper-count', String(entry.repeatCount));
    const incBtn   = _el('button', 'playlist-entry-stepper-btn');
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

    decBtn.addEventListener('click', e => {
      e.stopPropagation();
      const next = Math.max(1, entry.repeatCount - 1);
      this.setRepeat(playlist.id, entry.id, next);
      countSpan.textContent = String(next);
      entry.repeatCount = next;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, playedCount, isCurrentEntry);
    });
    incBtn.addEventListener('click', e => {
      e.stopPropagation();
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

    // Duplicate — appends a copy of this entry to the end of the playlist
    const dupBtn = _el('button', 'playlist-entry-duplicate-btn');
    dupBtn.innerHTML = icons.copy;
    createCustomTooltip(dupBtn, 'Дублировать в конец плейлиста');
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      const copy = this.duplicateEntry(playlist.id, entry.id);
      if (!copy) return;
      const fresh = this.load().find(p => p.id === playlist.id);
      if (!fresh) return;
      const entryList = row.closest('.playlist-entries');
      if (!entryList) return;
      // Remove empty-state placeholder if present
      const empty = entryList.querySelector('.playlist-entries-empty');
      if (empty) empty.remove();
      const newRow = this._buildEntryRow(fresh, copy, null, false, fresh.entries.length - 1);
      entryList.appendChild(newRow);
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
      this._activatePlaylistSettings();
      setActivePlaylistSession({ playlistId: playlist.id, entryIndex, remainingRepeats: targetEntry.repeatCount });
      window.location.href = _generatePlaylistEntryLink(this.main, game, targetEntry);
    });

    // Params override button — toggles the inline param picker
    const hasOv = _hasEntryParamOverrides(entry.params);
    const paramsBtn = _el('button', `playlist-entry-params-btn${hasOv ? ' has-overrides' : ''}`);
    paramsBtn.innerHTML = icons.parameters;
    createCustomTooltip(paramsBtn, hasOv
      ? 'Параметры переопределены · Клик для изменения'
      : 'Переопределить параметры (режим, TM, AFK)');
    paramsBtn.addEventListener('click', e => {
      e.stopPropagation();
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
    });

    row.append(entryPlayBtn, handle, dupBtn, label, stepper, paramsBtn, removeBtn);
    return row;
  },

  // ── Vertical drag-to-reorder for entry rows ─────────────────────────────
  _attachEntryDrag(entryList, playlistId) {
    // Guard against stacking multiple listeners when entries are live-injected
    if (entryList.dataset.dragAttached) return;
    entryList.dataset.dragAttached = '1';

    let dragEl = null, placeholder = null, startY = 0, startIdx = 0;

    const getRows = () => Array.from(entryList.querySelectorAll('.playlist-entry-row'));

    entryList.addEventListener('mousedown', e => {
      const handle = e.target.closest('.playlist-entry-drag-handle');
      if (!handle) return;
      e.preventDefault();

      // Clear any leftover placeholders from a previous interrupted drag
      entryList.querySelectorAll('.playlist-entry-placeholder').forEach(p => p.remove());

      dragEl   = handle.closest('.playlist-entry-row');
      startIdx = getRows().indexOf(dragEl);
      startY   = e.clientY;

      const rect = dragEl.getBoundingClientRect();
      dragEl.style.width  = rect.width + 'px';
      dragEl.classList.add('playlist-entry-dragging');

      placeholder = _el('div', 'playlist-entry-placeholder');
      placeholder.style.height = rect.height + 'px';
      dragEl.parentNode.insertBefore(placeholder, dragEl);

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const onMove = e => {
      if (!dragEl) return;
      const dy = e.clientY - startY;
      dragEl.style.transform = `translateY(${dy}px)`;

      const rows = getRows().filter(r => r !== dragEl);
      let insertBefore = null;
      for (const r of rows) {
        const rRect = r.getBoundingClientRect();
        if (e.clientY < rRect.top + rRect.height / 2) { insertBefore = r; break; }
      }
      if (insertBefore) entryList.insertBefore(placeholder, insertBefore);
      else entryList.appendChild(placeholder);
    };

    const onUp = () => {
      if (!dragEl) return;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      const rows   = getRows().filter(r => r !== dragEl);
      const phIdx  = Array.from(entryList.children).indexOf(placeholder);
      const toIdx  = Math.min(phIdx, rows.length);

      dragEl.classList.remove('playlist-entry-dragging');
      dragEl.style.transform = '';
      dragEl.style.width     = '';
      placeholder.replaceWith(dragEl);

      const finalIdx = getRows().indexOf(dragEl);
      if (finalIdx !== startIdx) {
        this.reorderEntries(playlistId, startIdx, finalIdx);
      }

      dragEl = null; placeholder = null;
    };
  },

  _buildGamePicker(playlist) {
    const picker    = _el('div', 'playlist-game-picker');
    const toggleBtn = _el('button', 'playlist-picker-toggle');
    toggleBtn.innerHTML = `${icons.plus}<span>Добавить игры</span>`;

    const body = _el('div', 'playlist-picker-body playlist-picker-body--hidden');

    const setToggleState = hidden => {
      toggleBtn.innerHTML = hidden
        ? `${icons.plus}<span>Добавить игры</span>`
        : `${icons.chevronLeft}<span>Свернуть</span>`;
    };

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const hidden = body.classList.toggle('playlist-picker-body--hidden');
      setToggleState(hidden);
      requestAnimationFrame(() => {
        // If the panel is currently constrained by the viewport edges, keep it there after expanding the picker
        if (hidden && PlaylistsManager.popup) {
          if (PlaylistsManager._intendedX !== null) PlaylistsManager.popup.style.left = PlaylistsManager._intendedX + 'px';
          if (PlaylistsManager._intendedY !== null) PlaylistsManager.popup.style.top  = PlaylistsManager._intendedY + 'px';
        }
        PlaylistsManager._constrain();
      });
    });

    if (!this.main) { picker.append(toggleBtn, body); return picker; }

    // Search inside picker
    const searchWrap  = _el('div', 'playlist-picker-search-wrap');
    const searchInput = _el('input', 'playlist-search-input');
    searchInput.type        = 'text';
    searchInput.placeholder = 'Поиск по названию...';
    searchWrap.appendChild(searchInput);
    body.appendChild(searchWrap);

    // After appending, measure search wrap height and expose as CSS var
    // so sticky group headers can offset themselves below it
    requestAnimationFrame(() => {
      const h = searchWrap.offsetHeight;
      if (h) body.style.setProperty('--picker-search-height', `${h}px`);
    });

    // Prevent outside-click handler from firing when interacting with the search
    searchInput.addEventListener('click', e => e.stopPropagation());

    const allRows = [];
    this.main.groupsManager.groups.forEach(group => {
      if (!group.games.length) return;
      const groupHeader = _el('div', 'playlist-picker-group-header', group.title);
      body.appendChild(groupHeader);

      group.games.forEach(game => {
        const alreadyAdded = playlist.entries.some(e => e.gameId === game.id);
        const gtype  = gameTypes[game.params.gametype] || game.params.gametype;
        const name   = game.params.vocName ? `«${game.params.vocName}»` : gtype;
        const gameRow = _el('div', `playlist-picker-game-row${alreadyAdded ? ' already-added' : ''}`);

        const nameSpan = _el('span', `playlist-picker-game-name gametype-${game.params.gametype}`, name);
        const visLabel = visibilities[game.params.type] || game.params.type;
        const descSpan = _el('span', 'playlist-picker-game-desc', `${visLabel} · TM ${game.params.timeout}`);

        const addBtn = _el('button', 'playlist-picker-add-btn');
        addBtn.innerHTML = alreadyAdded ? icons.checkmark : icons.plus;
        createCustomTooltip(addBtn, alreadyAdded ? 'Уже в плейлисте' : 'Добавить в плейлист');

        if (!alreadyAdded) {
          addBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.addEntry(playlist.id, game.id, 1);
            addBtn.innerHTML = icons.checkmark;
            addBtn.disabled  = true;
            gameRow.classList.add('already-added');
            // Live-inject into entry list
            const block = addBtn.closest('.playlist-block');
            if (block) {
              const entryList = block.querySelector('.playlist-entries');
              if (entryList) {
                entryList.querySelector('.playlist-entries-empty')?.remove();
                const fresh    = this.load().find(p => p.id === playlist.id);
                const newEntry = fresh?.entries[fresh.entries.length - 1];
                if (fresh && newEntry) {
                  playlist.entries.push(newEntry);
                  const newRow = this._buildEntryRow(fresh, newEntry, null, false, fresh.entries.length - 1);
                  entryList.appendChild(newRow);
                  this._attachEntryDrag(entryList, playlist.id);
                }
              }
            }
          });
        } else {
          addBtn.disabled = true;
        }

        gameRow.append(nameSpan, descSpan, addBtn);
        body.appendChild(gameRow);
        allRows.push({ gameRow, groupHeader, name: name.toLowerCase() });
      });
    });

    if (!allRows.length) body.appendChild(_el('div', 'playlist-picker-empty', 'Нет доступных игр'));

    searchInput.addEventListener('input', e => {
      const term = e.target.value.toLowerCase().trim();
      const visibleGroups = new Set();
      allRows.forEach(({ gameRow, groupHeader, name }) => {
        const match = !term || name.includes(term);
        gameRow.style.display = match ? '' : 'none';
        if (match) visibleGroups.add(groupHeader);
      });
      body.querySelectorAll('.playlist-picker-group-header').forEach(h => {
        h.style.display = visibleGroups.has(h) ? '' : 'none';
      });
    });

    picker.append(toggleBtn, body);
    return picker;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update the HUD playlist indicator text in-place (called on stepper change)
// ─────────────────────────────────────────────────────────────────────────────
function _updatePlaylistHud() {
  const session = getActivePlaylistSession();
  if (!session) return;
  try {
    const playlists = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const playlist  = playlists.find(p => p.id === session.playlistId);
    if (!playlist) return;
    const indicator = document.querySelector('.playlist-progress-indicator');
    if (!indicator) return;
    const total = playlist.entries.length;
    const pos   = session.entryIndex + 1;
    const reps  = session.remainingRepeats;
    indicator.innerHTML = `<span class="playlist-hud-icon">${icons.playing}</span><span class="playlist-hud-counter">${pos}/${total} ×${reps}</span>`;
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