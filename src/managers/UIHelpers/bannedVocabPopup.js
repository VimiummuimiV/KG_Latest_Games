import { fetchVocabularyContent, showTooltip, startHideTimeout } from "../../vocabularyParser";

export const BannedVocabPopup = {
  popup: null,
  isDragging: false,
  offsetX: 0,
  offsetY: 0,

  get() { try { return JSON.parse(localStorage.bannedVocabularies) || []; } catch { return []; } },
  save(arr) { localStorage.bannedVocabularies = JSON.stringify(arr); },
  remove(id) { this.save(this.get().filter(v => v !== id)); this.refresh(); },

  toggleBtnText(selector, tempText, originalTextFn, duration = 1000) {
    const btn = this.popup.querySelector(selector);
    const originalText = originalTextFn();
    btn.textContent = tempText;
    setTimeout(() => btn.textContent = originalText, duration);
  },

  async copy() {
    const ids = this.get().join(',');
    try { await navigator.clipboard.writeText(ids); }
    catch { if (document.getSelection && ids) document.getSelection().removeAllRanges(); }
    this.toggleBtnText('.copy-all-btn', 'Скопировано!', () => `Копировать все (${this.get().length})`);
  },

  removeAll() {
    this.save([]);
    this.toggleBtnText('.remove-all-btn', 'Удалено!', () => 'Удалить всё');
    this.refresh();
  },

  createElements() {
    const v = this.get();
    const container = document.createElement('div');
    container.className = 'banned-vocabularies-popup';

    const header = document.createElement('div');
    header.className = 'popup-header';
    header.textContent = 'Заблокированные словари';
    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    container.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'popup-actions';
    const copyBtn = Object.assign(document.createElement('button'), {
      className: 'copy-all-btn', textContent: `Копировать все (${v.length})`, disabled: !v.length, onclick: () => this.copy()
    });
    const removeAllBtn = Object.assign(document.createElement('button'), {
      className: 'remove-all-btn', textContent: 'Удалить всё', disabled: !v.length, onclick: () => this.removeAll()
    });
    const count = document.createElement('span');
    count.className = 'vocab-count';
    count.textContent = `${v.length} ${v.length === 1 ? 'элемент' : v.length < 5 ? 'элемента' : 'элементов'}`;
    actions.append(copyBtn, removeAllBtn, count);
    container.appendChild(actions);

    const list = document.createElement('div');
    list.className = 'vocab-list';

    if (v.length) {
      v.forEach(id => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        item.dataset.id = id; // Store id for delegation
        item.style.cursor = 'pointer';

        const idSpan = Object.assign(document.createElement('span'), { 
          className: 'vocab-id', 
          textContent: id 
        });

        const removeBtn = Object.assign(document.createElement('button'), {
          className: 'remove-btn',
          textContent: 'Удалить'
        });

        item.append(idSpan, removeBtn);
        list.appendChild(item);
      });

      // delegated handler (only one for the whole list)
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.vocab-item');
        if (!item) return;

        const id = item.dataset.id;

        if (e.target.classList.contains('remove-btn')) {
          this.remove(id);
        } else {
          window.open(`https://klavogonki.ru/vocs/${id}/`, '_blank');
        }
      });

      // Shift + hover: show shared tooltip anchored to the .vocab-item
      list.addEventListener('mouseover', (e) => {
        if (!e.shiftKey) return;
        const item = e.target.closest('.vocab-item');
        if (!item) return;
        const id = item.dataset.id || item.querySelector('.vocab-id')?.textContent;
        if (!id) return;
        // Use shared fetch + tooltip functions from vocabularyParser
        fetchVocabularyContent(id).then(content => showTooltip(item, content)).catch(() => {});
      }, { capture: true });

      list.addEventListener('mouseout', (e) => {
        const item = e.target.closest('.vocab-item');
        if (!item) return;
        // Trigger the normal tooltip hide flow (shared helper) which
        // respects hover state handled inside vocabularyParser.
        startHideTimeout();
      }, { capture: true });

    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Нет заблокированных словарей';
      list.appendChild(empty);
    }

    container.appendChild(list);
    return container;
  },

  refresh() {
    if (this.popup) {
      const newPopup = this.createElements();
      const parent = this.popup.parentNode;
      const rect = this.popup.getBoundingClientRect();
      parent.replaceChild(newPopup, this.popup);
      this.popup = newPopup;
      this.popup.style.left = rect.left + 'px';
      this.popup.style.top = rect.top + 'px';
    }
  },

  show(x = 100, y = 100) {
    this.hide();
    this.popup = this.createElements();
    document.body.appendChild(this.popup);
    this.popup.style.left = x + 'px';
    this.popup.style.top = y + 'px';
    this.constrainToScreen();
    setTimeout(() => {
      document.addEventListener('click', this.outside);
      document.addEventListener('keydown', this.keydown);
    }, 100);
  },

  hide() {
    if (this.popup) {
      document.body.removeChild(this.popup);
      this.popup = null;
      this.isDragging = false;
      document.removeEventListener('click', this.outside);
      document.removeEventListener('keydown', this.keydown);
      document.removeEventListener('mousemove', this.drag);
      document.removeEventListener('mouseup', this.stopDrag);
    }
  },

  toggle(x, y) { this.popup ? this.hide() : this.show(x, y); },

  outside: e => { if (!BannedVocabPopup.popup?.contains(e.target) && !e.target.classList?.contains('remove-btn')) BannedVocabPopup.hide(); },
  keydown: e => e.key === 'Escape' && BannedVocabPopup.hide(),

  startDrag(e) {
    this.isDragging = true;
    const rect = this.popup.getBoundingClientRect();
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', this.drag);
    document.addEventListener('mouseup', this.stopDrag);
  },

  drag: (e) => {
    if (!BannedVocabPopup.isDragging || !BannedVocabPopup.popup) return;
    BannedVocabPopup.popup.style.left = (e.clientX - BannedVocabPopup.offsetX) + 'px';
    BannedVocabPopup.popup.style.top = (e.clientY - BannedVocabPopup.offsetY) + 'px';
    BannedVocabPopup.constrainToScreen();
  },

  stopDrag: () => {
    BannedVocabPopup.isDragging = false;
    document.removeEventListener('mousemove', BannedVocabPopup.drag);
    document.removeEventListener('mouseup', BannedVocabPopup.stopDrag);
  },

  constrainToScreen() {
    if (!this.popup) return;
    const rect = this.popup.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    if (rect.left < 0) this.popup.style.left = '0px';
    if (rect.top < 0) this.popup.style.top = '0px';
    if (rect.left > maxLeft) this.popup.style.left = maxLeft + 'px';
    if (rect.top > maxTop) this.popup.style.top = maxTop + 'px';
  }
};
