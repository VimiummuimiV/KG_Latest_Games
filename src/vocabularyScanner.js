import { fetchVocabularyBasicData } from './vocabularyCreation.js';

const CONCURRENCY = 3;   // simultaneous fetches
const BATCH_PAUSE = 300; // ms between batches

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Group picker dialog
// ─────────────────────────────────────────────────────────────────────────────

function showGroupPicker(groups) {
  return new Promise((resolve) => {
    const groupsWithVocs = groups.filter(group =>
      group.games.some(g => g.params?.gametype === 'voc' && g.params?.vocId)
    );

    if (!groupsWithVocs.length) { resolve([]); return; }
    if (groupsWithVocs.length === 1) { resolve(groupsWithVocs); return; }

    const overlay = el('div', 'rg-scanner-overlay');
    const card = el('div', 'rg-scanner-card');
    card.appendChild(el('div', 'rg-scanner-title', '📂 Выбор групп для сканирования'));

    const list = el('div', 'rg-scanner-group-list');
    const checked = new Set();

    // Drag-to-toggle: mousedown records the target state, mouseover while held applies it
    let dragState = null; // null | true | false

    list.addEventListener('mousedown', (e) => {
      const cb = e.target.closest('input[type=checkbox]') || e.target.closest('label')?.querySelector('input[type=checkbox]');
      if (!cb) return;
      dragState = !cb.checked;
    });

    list.addEventListener('mouseover', (e) => {
      if (dragState === null || e.buttons !== 1) { dragState = null; return; }
      const cb = e.target.closest('input[type=checkbox]') || e.target.closest('label')?.querySelector('input[type=checkbox]');
      if (!cb || cb.checked === dragState) return;
      cb.checked = dragState;
      dragState ? checked.add(cb.dataset.groupId) : checked.delete(cb.dataset.groupId);
      scanBtn.disabled = checked.size === 0;
    });

    document.addEventListener('mouseup', () => { dragState = null; }, { capture: true });

    groupsWithVocs.forEach(group => {
      const vocCount = group.games.filter(g => g.params?.gametype === 'voc' && g.params?.vocId).length;
      const label = el('label', 'rg-scanner-group-label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = false;
      cb.dataset.groupId = group.id;
      cb.addEventListener('change', () => {
        cb.checked ? checked.add(group.id) : checked.delete(group.id);
        scanBtn.disabled = checked.size === 0;
      });
      label.append(cb, el('span', null, group.title), el('span', 'rg-scanner-group-label-count', `(${vocCount} словарей)`));
      list.appendChild(label);
    });

    card.appendChild(list);

    const btnRow = el('div', 'rg-scanner-btn-row');
    const selectBtn   = el('button', 'rg-scanner-btn rg-scanner-btn--select',   'Выбрать все');
    const deselectBtn = el('button', 'rg-scanner-btn rg-scanner-btn--deselect', 'Снять все');
    const cancelBtn   = el('button', 'rg-scanner-btn rg-scanner-btn--cancel', 'Отмена');
    const scanBtn     = el('button', 'rg-scanner-btn rg-scanner-btn--scan',   'Сканировать');
    scanBtn.disabled = true;

    selectBtn.addEventListener('click', () => {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = true;
        checked.add(cb.dataset.groupId);
      });
      scanBtn.disabled = false;
    });

    deselectBtn.addEventListener('click', () => {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        checked.delete(cb.dataset.groupId);
      });
      scanBtn.disabled = true;
    });

    cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
    scanBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(groupsWithVocs.filter(g => checked.has(g.id)));
    });

    btnRow.append(selectBtn, deselectBtn, cancelBtn, scanBtn);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress UI
// ─────────────────────────────────────────────────────────────────────────────

function createProgressUI(total) {
  const overlay = el('div', 'rg-scanner-overlay');
  const card    = el('div', 'rg-scanner-card rg-scanner-progress-card');

  card.appendChild(el('div', 'rg-scanner-title', '🔍 Сканирование словарей'));

  const meta     = el('div', 'rg-scanner-progress-meta');
  const groupLbl = el('span', 'rg-scanner-progress-group', '—');
  const fraction = el('span', 'rg-scanner-progress-fraction', `0 / ${total}`);
  meta.append(groupLbl, fraction);

  const vocRow   = el('div', 'rg-scanner-progress-voc');
  const vocIdLbl = el('span', 'rg-scanner-progress-voc-id', '#—');
  const vocName  = el('span', 'rg-scanner-progress-voc-name', 'Ожидание…');
  vocRow.append(vocIdLbl, vocName);

  const barRow  = el('div', 'rg-scanner-bar-row');
  const barWrap = el('div', 'rg-scanner-bar-wrap');
  const barFill = el('div', 'rg-scanner-bar-fill');
  barFill.style.width = '0%';
  barWrap.appendChild(barFill);
  const pct = el('span', 'rg-scanner-progress-percent', '0%');
  barRow.append(barWrap, pct);

  const cancelBtn = el('button', 'rg-scanner-btn rg-scanner-btn--cancel', 'Отменить');
  const btnRow    = el('div', 'rg-scanner-btn-row');
  btnRow.appendChild(cancelBtn);

  card.append(meta, vocRow, barRow, btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let cancelled = false;
  cancelBtn.addEventListener('click', () => {
    cancelled = true;
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Отмена…';
  });

  return {
    isCancelled: () => cancelled,
    update(done, currentTotal, groupTitle, currentVocId, name) {
      const p = currentTotal > 0 ? Math.round((done / currentTotal) * 100) : 0;
      groupLbl.textContent = groupTitle || '—';
      fraction.textContent = `${done} / ${currentTotal}`;
      vocIdLbl.textContent = currentVocId ? `#${currentVocId}` : '#—';
      vocName.textContent  = name || '…';
      barFill.style.width  = `${p}%`;
      pct.textContent      = `${p}%`;
    },
    remove() { overlay.remove(); }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Results UI
// ─────────────────────────────────────────────────────────────────────────────

function showResults(groupResults, removedResults, totalScanned, wasCancelled) {
  const overlay        = el('div', 'rg-scanner-overlay');
  const card           = el('div', 'rg-scanner-card rg-scanner-results-card');
  const nonPublicCount = groupResults.reduce((s, gr) => s + gr.items.length, 0);
  const removedCount   = removedResults.reduce((s, gr) => s + gr.items.length, 0);

  const titleEl = el('div', 'rg-scanner-title');
  titleEl.append(
    document.createTextNode(wasCancelled ? '⚠️ Сканирование прервано ' : '✅ Сканирование завершено '),
    el('span', 'rg-scanner-results-badge', `${nonPublicCount} непубличных`),
    ...(removedCount > 0 ? [
      document.createTextNode(' '),
      el('span', 'rg-scanner-results-badge rg-scanner-results-badge--removed', `${removedCount} удалённых`)
    ] : [])
  );
  card.appendChild(titleEl);

  const sub = el('div', 'rg-scanner-results-subtitle');
  const parts = [`Проверено <strong>${totalScanned}</strong> словарей.`];
  if (nonPublicCount > 0) parts.push(`Непубличных: <strong>${nonPublicCount}</strong>.`);
  if (removedCount > 0)   parts.push(`Удалённых: <strong>${removedCount}</strong>.`);
  sub.innerHTML = parts.join(' ');
  card.appendChild(sub);

  const tree = el('div', 'rg-scanner-results-tree');

  if (nonPublicCount === 0 && removedCount === 0) {
    tree.appendChild(el('div', 'rg-scanner-results-empty', 'Все словари публичные 🎉'));
  } else {
    const renderGroup = ({ groupTitle, items }, icon) => {
      if (items.length === 0) return;

      const groupBlock  = el('div', 'rg-scanner-tree-group');
      const groupHeader = el('div', 'rg-scanner-tree-group-header');
      groupHeader.append(
        el('span', 'rg-scanner-tree-group-icon', '📁'),
        el('span', 'rg-scanner-tree-group-title', groupTitle),
        el('span', 'rg-scanner-tree-group-count', String(items.length))
      );
      groupBlock.appendChild(groupHeader);

      const itemsList = el('ul', 'rg-scanner-tree-items');
      items.forEach(({ vocId, vocName }) => {
        const item = el('li', 'rg-scanner-tree-item');
        const link = document.createElement('a');
        link.className   = 'rg-scanner-tree-item-link';
        link.textContent = `#${vocId}`;
        link.href        = `https://klavogonki.ru/vocs/${vocId}/`;
        link.target      = '_blank';
        item.append(
          el('span', 'rg-scanner-tree-item-icon', icon),
          link,
          el('span', 'rg-scanner-tree-item-name', vocName || '—')
        );
        itemsList.appendChild(item);
      });

      groupBlock.appendChild(itemsList);
      tree.appendChild(groupBlock);
    };

    if (nonPublicCount > 0) {
      tree.appendChild(el('div', 'rg-scanner-results-section-title', '🔒 Непубличные словари'));
      groupResults.forEach(gr => renderGroup(gr, '🔒'));
    }
    if (removedCount > 0) {
      tree.appendChild(el('div', 'rg-scanner-results-section-title', '🗑️ Удалённые словари'));
      removedResults.forEach(gr => renderGroup(gr, '🗑️'));
    }
  }

  card.appendChild(tree);

  const btnRow   = el('div', 'rg-scanner-btn-row');
  const closeBtn = el('button', 'rg-scanner-btn rg-scanner-btn--close', 'Закрыть');
  closeBtn.addEventListener('click', () => overlay.remove());
  btnRow.appendChild(closeBtn);
  card.appendChild(btnRow);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scan logic
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBatch(entries, ui, doneRef, total) {
  return Promise.all(entries.map(async entry => {
    if (ui.isCancelled()) return { ...entry, data: null };
    const { group, game, vocId } = entry;
    const data = await fetchVocabularyBasicData(vocId).catch(() => null);
    doneRef.value++;
    ui.update(doneRef.value, total, group.title, vocId, data?.vocabularyName || game.params?.vocName || null);
    return { group, game, vocId, data };
  }));
}

/**
 * Run the full vocabulary scan.
 * Called from controls.js: await runVocScan(main)
 */
export async function runVocScan(main) {
  const targetGroups = await showGroupPicker(main.groupsManager.groups);
  if (!targetGroups || targetGroups.length === 0) return;

  const entries = [];
  for (const group of targetGroups) {
    for (const game of group.games) {
      const vocId = String(game.params?.vocId || '');
      if (game.params?.gametype !== 'voc' || !vocId) continue;
      entries.push({ group, game, vocId });
    }
  }

  if (entries.length === 0) {
    alert('В выбранных группах нет игр с словарями.');
    return;
  }

  const ui      = createProgressUI(entries.length);
  const doneRef = { value: 0 };
  const allResults = [];

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    if (ui.isCancelled()) break;

    const results = await fetchBatch(entries.slice(i, i + CONCURRENCY), ui, doneRef, entries.length);
    allResults.push(...results);

    for (const { game, data } of results) {
      if (!data) continue;
      if (data.removed) {
        game.params.vocIsRemoved = true;
        continue;
      }
      game.params.vocIsRemoved = false;
      if (data.vocabularyType     !== undefined) game.params.vocType     = data.vocabularyType    ?? game.params.vocType;
      if (data.vocabularyName     !== undefined) game.params.vocName     = data.vocabularyName    || game.params.vocName;
      if (data.vocabularyIsPublic !== undefined) {
        game.params.vocIsPublic =
          data.vocabularyIsPublic === 'Нет' ? false :
          data.vocabularyIsPublic === 'Да'  ? true  : null;

        if (game.params.vocIsPublic === false) {
          game.params.type    = 'practice';
          game.params.timeout = 5;
        }
      }
    }

    if (i + CONCURRENCY < entries.length) await sleep(BATCH_PAUSE);
  }

  const wasCancelled = ui.isCancelled();
  const totalScanned = doneRef.value;

  try {
    main.gamesManager.saveGameData();
    main.uiManager.refreshContainer();
  } catch (err) {
    console.warn('[VocScan] Could not save game data:', err);
  }

  // Build results tree from all non-public findings
  const groupMap = new Map();
  for (const { group, vocId, game, data } of allResults) {
    if (data?.vocabularyIsPublic !== 'Нет') continue;
    if (!groupMap.has(group.id)) groupMap.set(group.id, { groupTitle: group.title, items: [] });
    groupMap.get(group.id).items.push({ vocId, vocName: game.params?.vocName || null });
  }

  // Build results tree from removed findings
  const removedMap = new Map();
  for (const { group, vocId, game, data } of allResults) {
    if (!data?.removed) continue;
    if (!removedMap.has(group.id)) removedMap.set(group.id, { groupTitle: group.title, items: [] });
    removedMap.get(group.id).items.push({ vocId, vocName: game.params?.vocName || null });
  }

  ui.remove();
  showResults([...groupMap.values()], [...removedMap.values()], totalScanned, wasCancelled);
}