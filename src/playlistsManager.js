import { createCustomTooltip } from './tooltip.js';
import { icons } from './icons.js';
import { gameTypes, visibilities } from './definitions.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// Advance to the next step and navigate. Returns true if navigation triggered.
// ─────────────────────────────────────────────────────────────────────────────
export function advancePlaylist(main) {
  const session = getActivePlaylistSession();
  if (!session) return false;

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
  const game    = _findGameById(main, entry.gameId);
  if (!game) return advancePlaylist(main); // skip deleted games

  window.location.href = main.gamesManager.generateGameLink(game);
  return true;
}

function _finishPlaylist(main, playlist) {
  cancelActivePlaylist(); // restores settings
  const name = playlist?.title || 'Плейлист';
  // Friendly completion alert
  setTimeout(() => alert(`✅ Плейлист «${name}» завершён!`), 300);
}

function _findGameById(main, gameId) {
  for (const group of main.groupsManager.groups) {
    const g = group.games.find(g => g.id === gameId);
    if (g) return g;
  }
  return null;
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
    const playlist = { id: _uid(), title: name, entries: [] };
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
    p.entries.push({ id: _uid(), gameId, repeatCount: Math.max(1, repeatCount) });
    this.save(playlists);
  },

  removeEntry(playlistId, entryId) {
    const playlists = this.load();
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    p.entries = p.entries.filter(e => e.id !== entryId);
    this.save(playlists);
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

    // If another playlist is active, ask first
    const existing = getActivePlaylistSession();
    if (existing && existing.playlistId !== playlistId) {
      if (!confirm('Уже идёт другой плейлист. Остановить его и запустить этот?')) return;
    }

    // Save current auto-start/replay settings so we can restore them after
    try {
      sessionStorage.setItem('latestGames_prePlaylistSettings', JSON.stringify({
        shouldStart:         this.main.shouldStart,
        shouldReplay:        this.main.shouldReplay,
        replayNextGame:      this.main.replayNextGame,
        replayWithoutWaiting: this.main.replayWithoutWaiting
      }));
    } catch { }

    // Force auto-start + auto-replay-next-game on, no waiting for players
    this.main.shouldStart          = true;
    this.main.shouldReplay         = true;
    this.main.replayNextGame       = true;
    this.main.replayWithoutWaiting = true;
    this.main.settingsManager.saveSettings();

    const firstEntry = playlist.entries[0];
    const game = _findGameById(this.main, firstEntry.gameId);
    if (!game) { alert('⚠️ Первая игра плейлиста не найдена.'); return; }

    setActivePlaylistSession({ playlistId, entryIndex: 0, remainingRepeats: firstEntry.repeatCount });
    window.location.href = this.main.gamesManager.generateGameLink(game);
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
    this.popup.style.left = (x + 20) + 'px';
    this.popup.style.top  = (y + 20) + 'px';
    this._constrain();
    // Scroll active playlist block + active entry into view (centered)
    if (session) {
      requestAnimationFrame(() => {
        const list = this.popup?.querySelector('.playlists-list');
        const activeEntry = this.popup?.querySelector('.playlist-entry-row--active');
        const activeBlock = this.popup?.querySelector(`.playlist-block[data-playlist-id="${session.playlistId}"]`);
        if (activeEntry && list) {
          // Scroll so the active entry is centered in the list viewport
          const listRect  = list.getBoundingClientRect();
          const entryRect = activeEntry.getBoundingClientRect();
          const offset = entryRect.top - listRect.top - (listRect.height / 2) + (entryRect.height / 2);
          list.scrollBy({ top: offset, behavior: 'smooth' });
        } else if (activeBlock && list) {
          activeBlock.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    }
    setTimeout(() => {
      document.addEventListener('click', this._outside);
      document.addEventListener('keydown', this._keydown);
    }, 100);
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
    }
  },

  toggle(x, y) {
    if (this.popup) this.hide();
    else this.show(x, y);
  },

  refresh() {
    if (!this.popup) return;
    const rect = this.popup.getBoundingClientRect();
    const newPopup = this._buildPanel();
    newPopup.style.left = rect.left + 'px';
    newPopup.style.top  = rect.top  + 'px';
    this.popup.parentNode.replaceChild(newPopup, this.popup);
    this.popup = newPopup;
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
      requestAnimationFrame(() => {
        const list       = this.popup?.querySelector('.playlists-list');
        const activeEntry = this.popup?.querySelector('.playlist-entry-row--active');
        if (activeEntry && list) {
          const listRect  = list.getBoundingClientRect();
          const entryRect = activeEntry.getBoundingClientRect();
          const offset = entryRect.top - listRect.top - (listRect.height / 2) + (entryRect.height / 2);
          list.scrollBy({ top: offset, behavior: 'smooth' });
        }
      });
    }
  },

  // Only close on click that is truly outside the popup and not a prompt/confirm dialog
  _outside: e => {
    if (!PlaylistsManager.popup) return;
    if (PlaylistsManager.popup.contains(e.target)) return;
    // Don't close if the click was on a button anywhere in the document
    // (could be a confirm dialog button or similar)
    if (e.target.closest('button, input, select, textarea')) return;
    PlaylistsManager.hide();
  },

  _keydown: e => {
    if (e.key === 'Escape') PlaylistsManager.hide();
  },

  _startDrag(e) {
    if (e.button !== 0) return;
    this.isDragging = true;
    const rect = this.popup.getBoundingClientRect();
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', this._drag);
    document.addEventListener('mouseup', this._stopDrag);
  },

  _drag: e => {
    if (!PlaylistsManager.isDragging || !PlaylistsManager.popup) return;
    PlaylistsManager.popup.style.left = (e.clientX - PlaylistsManager.offsetX) + 'px';
    PlaylistsManager.popup.style.top  = (e.clientY - PlaylistsManager.offsetY) + 'px';
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

  // ── DOM builder ────────────────────────────────────────────────────────────
  _buildPanel() {
    const playlists = this.load();
    const session   = getActivePlaylistSession();
    const panel     = _el('div', 'playlists-manager-popup');

    // Header (draggable)
    const header = _el('div', 'popup-header');
    header.style.cursor = 'move';
    header.addEventListener('mousedown', e => this._startDrag(e));

    const titleSpan = _el('span', 'popup-header-title', 'Плейлисты');

    const addBtn = _el('button', 'playlists-add-btn');
    addBtn.innerHTML = `${icons.addGroup}<span>Новый</span>`;
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
      // Active: stop button on the LEFT replaces play, badge + rename/del on right
      const stopBtn = _el('button', 'playlist-cancel-btn');
      stopBtn.innerHTML = icons.stop;
      createCustomTooltip(stopBtn, 'Остановить плейлист');
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

      row.append(stopBtn, titleSpan);
    } else {
      // Inactive: play button on left, rename + delete on right
      const playBtn = _el('button', 'playlist-play-btn');
      playBtn.innerHTML = icons.start;
      createCustomTooltip(playBtn, `Запустить плейлист «${playlist.title}»`);
      playBtn.addEventListener('click', e => { e.stopPropagation(); this.startPlaylist(playlist.id); });

      const titleSpan = _el('span', 'playlist-title', playlist.title);

      const renameBtn = _el('button', 'playlist-rename-btn');
      renameBtn.innerHTML = icons.renameGroup;
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
    const game = _findGameById(this.main, entry.gameId);
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
    handle.innerHTML = icons.dragToggle;

    // Game label
    const label = _el('span', 'playlist-entry-label');
    if (game) {
      const gtype = gameTypes[game.params.gametype] || game.params.gametype;
      const name  = game.params.vocName ? `«${game.params.vocName}»` : gtype;
      label.textContent = name;
      label.classList.add(`gametype-${game.params.gametype}`);
      const visLabel = visibilities[game.params.type] || game.params.type;
      let tip = `[Режим] ${visLabel}[TM] ${game.params.timeout}`;
      if (game.params.idletime) tip += `[AFK] ${game.params.idletime}`;
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
    decBtn.innerHTML = icons.decrease;
    const countSpan = _el('span', 'playlist-entry-stepper-count', String(entry.repeatCount));
    const incBtn   = _el('button', 'playlist-entry-stepper-btn');
    incBtn.innerHTML = icons.increase;
    createCustomTooltip(stepper, 'Количество повторов этой игры');

    decBtn.addEventListener('click', e => {
      e.stopPropagation();
      const next = Math.max(1, entry.repeatCount - 1);
      this.setRepeat(playlist.id, entry.id, next);
      countSpan.textContent = String(next);
      entry.repeatCount = next;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, session, isCurrentEntry);
    });
    incBtn.addEventListener('click', e => {
      e.stopPropagation();
      const next = entry.repeatCount + 1;
      this.setRepeat(playlist.id, entry.id, next);
      countSpan.textContent = String(next);
      entry.repeatCount = next;
      _updatePlaylistHud();
      _updateEntryProgress(row, entry, session, isCurrentEntry);
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
      const game = _findGameById(this.main, targetEntry.gameId);
      if (!game) { alert('⚠️ Игра не найдена.'); return; }
      // Save pre-playlist settings
      try {
        sessionStorage.setItem('latestGames_prePlaylistSettings', JSON.stringify({
          shouldStart: this.main.shouldStart,
          shouldReplay: this.main.shouldReplay,
          replayNextGame: this.main.replayNextGame,
          replayWithoutWaiting: this.main.replayWithoutWaiting
        }));
      } catch { }
      this.main.shouldStart          = true;
      this.main.shouldReplay         = true;
      this.main.replayNextGame       = true;
      this.main.replayWithoutWaiting = true;
      this.main.settingsManager.saveSettings();
      setActivePlaylistSession({ playlistId: playlist.id, entryIndex, remainingRepeats: targetEntry.repeatCount });
      window.location.href = this.main.gamesManager.generateGameLink(game);
    });

    row.append(entryPlayBtn, handle, label, stepper, removeBtn);
    return row;
  },

  // ── Vertical drag-to-reorder for entry rows ─────────────────────────────
  _attachEntryDrag(entryList, playlistId) {
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
    toggleBtn.innerHTML = `${icons.addGroup}<span>Добавить игры</span>`;

    const body = _el('div', 'playlist-picker-body playlist-picker-body--hidden');

    const setToggleState = hidden => {
      toggleBtn.innerHTML = hidden
        ? `${icons.addGroup}<span>Добавить игры</span>`
        : `${icons.decrease}<span>Свернуть</span>`;
    };

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const hidden = body.classList.toggle('playlist-picker-body--hidden');
      setToggleState(hidden);
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
        addBtn.innerHTML = alreadyAdded ? icons.checkmark : icons.addGroup;
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
    // Use SVG inline for the icon in the HUD
    indicator.innerHTML = `<span class="playlist-hud-icon">${icons.start}</span>${pos}/${total} ×${reps}`;
  } catch { }
}

// Update the progress fill on the active entry row in real-time
function _updateEntryProgress(row, entry, session, isCurrentEntry) {
  if (!isCurrentEntry || !session || entry.repeatCount <= 1) {
    row.style.removeProperty('--playlist-progress');
    row.classList.remove('playlist-entry-row--progress');
    return;
  }
  // Read latest remainingRepeats from session (setRepeat may have updated it)
  const fresh = getActivePlaylistSession();
  const remaining = fresh ? fresh.remainingRepeats : session.remainingRepeats;
  const played = entry.repeatCount - remaining;
  const pct = Math.max(0, Math.min(100, Math.round((played / entry.repeatCount) * 100)));
  row.classList.add('playlist-entry-row--progress');
  row.style.setProperty('--playlist-progress', `${pct}%`);
}
function _el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function _uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => (b % 36).toString(36))
    .join('');
}