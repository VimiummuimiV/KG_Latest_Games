export const BannedVocabPopup = {
  popup: null,
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
    try { 
      await navigator.clipboard.writeText(ids); 
    } catch {
      // Fallback: select existing text if available
      if (document.getSelection && ids) {
        const selection = document.getSelection();
        selection.removeAllRanges();
      }
    }
    this.toggleBtnText('.copy-all-btn', 'Скопировано!', () => `Копировать все (${this.get().length})`);
  },
  removeAll() {
    this.save([]);
    this.toggleBtnText('.remove-all-btn', 'Удалено!', () => 'Удалить всё');
    this.refresh();
  },
  createElements() {
    const v = this.get();
    
    // Main container
    const container = document.createElement('div');
    container.className = 'banned-vocabularies-popup';
    
    // Header
    const header = document.createElement('div');
    header.className = 'popup-header';
    header.textContent = 'Заблокированные словари';
    container.appendChild(header);
    
    // Actions section
    const actions = document.createElement('div');
    actions.className = 'popup-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-all-btn';
    copyBtn.textContent = `Копировать все (${v.length})`;
    copyBtn.disabled = !v.length;
    copyBtn.onclick = () => this.copy();
    
    const removeAllBtn = document.createElement('button');
    removeAllBtn.className = 'remove-all-btn';
    removeAllBtn.textContent = 'Удалить всё';
    removeAllBtn.disabled = !v.length;
    removeAllBtn.onclick = () => this.removeAll();
    
    const count = document.createElement('span');
    count.className = 'vocab-count';
    count.textContent = `${v.length} ${v.length === 1 ? 'элемент' : v.length < 5 ? 'элемента' : 'элементов'}`;
    
    actions.appendChild(copyBtn);
    actions.appendChild(removeAllBtn);
    actions.appendChild(count);
    container.appendChild(actions);
    
    // Vocab list
    const list = document.createElement('div');
    list.className = 'vocab-list';
    
    if (v.length) {
      v.forEach(id => {
        const item = document.createElement('div');
        item.className = 'vocab-item';
        
        const idSpan = document.createElement('span');
        idSpan.className = 'vocab-id';
        idSpan.textContent = id;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Удалить';
        removeBtn.onclick = () => this.remove(id);
        
        item.appendChild(idSpan);
        item.appendChild(removeBtn);
        list.appendChild(item);
      });
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
    const rect = this.popup.getBoundingClientRect();
    this.popup.style.left = Math.min(Math.max(x, 10), window.innerWidth - rect.width - 10) + 'px';
    this.popup.style.top = Math.min(Math.max(y, 10), window.innerHeight - rect.height - 10) + 'px';
    setTimeout(() => {
      document.addEventListener('click', this.outside);
      document.addEventListener('keydown', this.keydown);
    }, 100);
  },
  hide() {
    if (this.popup) {
      document.body.removeChild(this.popup);
      this.popup = null;
      document.removeEventListener('click', this.outside);
      document.removeEventListener('keydown', this.keydown);
    }
  },
  toggle(x, y) { this.popup ? this.hide() : this.show(x, y); },
  outside: e => {
    if (!BannedVocabPopup.popup?.contains(e.target)) {
      // Don't hide if clicking remove buttons
      if (!e.target.classList?.contains('remove-btn')) {
        BannedVocabPopup.hide();
      }
    }
  },
  keydown: e => e.key === 'Escape' && BannedVocabPopup.hide()
};