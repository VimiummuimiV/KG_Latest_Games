import { fetchVocabularyContent, showTooltip, startHideTimeout } from "../../vocabularyParser";
import { fetchVocabularyBasicData } from "../../vocabularyCreation";

export const BannedVocabPopup = {
  popup: null,
  isDragging: false,
  offsetX: 0,
  offsetY: 0,

  get() { 
    try { 
      const data = JSON.parse(localStorage.bannedVocabularies) || [];
      // Handle legacy format (array of strings) by converting to objects
      return data.map(item => 
        typeof item === 'string' ? { id: item } : item
      );
    } catch { return []; } 
  },
  save(arr) { localStorage.bannedVocabularies = JSON.stringify(arr); },
  
  async fetchAndCacheVocabData(vocabObj) {
    // If we already have name and author is defined (not empty string), return as is
    if (vocabObj.name && vocabObj.author) return vocabObj;
    
    const data = await fetchVocabularyBasicData(vocabObj.id);
    if (data) {
      return { 
        id: vocabObj.id, 
        name: data.vocabularyName, 
        author: data.vocabularyAuthor 
      };
    }
    return vocabObj; // Return original if fetch failed
  },

  remove(id) { this.save(this.get().filter(v => v.id !== id)); this.refresh(); },

  toggleBtnText(selector, tempText, originalTextFn, duration = 1000) {
    const btn = this.popup.querySelector(selector);
    const originalText = originalTextFn();
    btn.textContent = tempText;
    setTimeout(() => btn.textContent = originalText, duration);
  },

  async copy() {
    const ids = this.get().map(v => v.id).join(',');
    try { await navigator.clipboard.writeText(ids); }
    catch { if (document.getSelection && ids) document.getSelection().removeAllRanges(); }
    this.toggleBtnText('.copy-all-btn', 'Скопировано!', () => `Копировать все (${this.get().length})`);
  },

  removeAll() {
    this.save([]);
    this.toggleBtnText('.remove-all-btn', 'Удалено!', () => 'Удалить всё');
    this.refresh();
  },

  sortAll() {
    const sorted = this.get().sort((a, b) => parseInt(a.id) - parseInt(b.id));
    this.save(sorted);
    this.toggleBtnText('.sort-all-btn', 'Отсортировано!', () => 'Сортировать');
    this.refresh();
  },

  async createElements() {
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
    const sortBtn = Object.assign(document.createElement('button'), {
      className: 'sort-all-btn', textContent: 'Сортировать', disabled: !v.length, onclick: () => this.sortAll()
    });
    actions.append(copyBtn, removeAllBtn, sortBtn);
    container.appendChild(actions);

    const list = document.createElement('div');
    list.className = 'vocab-list';

    if (v.length) {
      // Fetch vocabulary data for items that don't have it cached
      const updatedVocabs = await Promise.all(
        v.map(vocabObj => this.fetchAndCacheVocabData(vocabObj))
      );
      
      // Save updated data back to localStorage
      this.save(updatedVocabs);
      
      updatedVocabs.forEach((vocabObj) => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        item.dataset.id = vocabObj.id;
        item.style.cursor = 'pointer';

        const leftSection = document.createElement('div');
        leftSection.className = 'vocab-left';
        
        const idSpan = Object.assign(document.createElement('span'), { 
          className: 'vocab-id', 
          textContent: vocabObj.id 
        });
        leftSection.appendChild(idSpan);

        const rightSection = document.createElement('div');
        rightSection.className = 'vocab-right';
        
        if (vocabObj.name) {
          const nameSpan = Object.assign(document.createElement('div'), {
            className: 'vocab-name',
            textContent: vocabObj.name
          });
          rightSection.appendChild(nameSpan);
          
          if (vocabObj.author) {
            const authorSpan = Object.assign(document.createElement('div'), {
              className: 'vocab-author',
              textContent: `Автор: ${vocabObj.author}`
            });
            rightSection.appendChild(authorSpan);
          }
        } else {
          const loadingSpan = Object.assign(document.createElement('div'), {
            className: 'vocab-loading',
            textContent: 'Не удалось загрузить'
          });
          rightSection.appendChild(loadingSpan);
        }

        const removeBtn = Object.assign(document.createElement('button'), {
          className: 'remove-btn',
          textContent: 'Удалить'
        });

        item.append(leftSection, rightSection, removeBtn);
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

  async refresh() {
    if (this.popup) {
      const newPopup = await this.createElements();
      const parent = this.popup.parentNode;
      const rect = this.popup.getBoundingClientRect();
      parent.replaceChild(newPopup, this.popup);
      this.popup = newPopup;
      this.popup.style.left = rect.left + 'px';
      this.popup.style.top = rect.top + 'px';
    }
  },

  async show(x = 100, y = 100) {
    this.hide();
    this.popup = await this.createElements();
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