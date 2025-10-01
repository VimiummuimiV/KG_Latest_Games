import { fetchVocabularyContent, showTooltip, startHideTimeout } from "./vocabularyParser";
import { fetchVocabularyBasicData } from "./vocabularyCreation";
import { createCustomTooltip } from "./tooltip";

export const VocabulariesManager = {
  popup: null,
  isDragging: false,
  offsetX: 0,
  offsetY: 0,
  hasUnsavedChanges: false,
  currentListType: 'bannedVocabularies', // Track which list we're managing

  // Configuration for different list types
  listConfigs: {
    bannedVocabularies: {
      title: 'Заблокированные словари',
      mainKey: 'bannedVocabularies',
      backupKey: 'bannedVocabularies*Backup'
    },
    playedVocabularies: {
      title: 'Проигранные словари',
      mainKey: 'playedVocabularies',
      backupKey: 'playedVocabularies*Backup'
    }
  },

  getConfig() {
    return this.listConfigs[this.currentListType];
  },

  get() { 
    try {
      const config = this.getConfig();
      const source = localStorage[config.backupKey] ? config.backupKey : config.mainKey;
      const data = JSON.parse(localStorage[source]) || [];
      
      this.hasUnsavedChanges = source === config.backupKey;
      
      // Handle legacy format (array of strings) by converting to objects
      return data.map(item => 
        typeof item === 'string' ? { id: item, isNew: false } : { ...item, isNew: item.isNew || false }
      );
    } catch { return []; } 
  },
  
  save(arr, createBackup = true) {
    const config = this.getConfig();
    if (createBackup) {
      localStorage[config.backupKey] = JSON.stringify(arr);
      this.hasUnsavedChanges = true;
    } else {
      const targetKey = this.hasUnsavedChanges ? config.backupKey : config.mainKey;
      localStorage[targetKey] = JSON.stringify(arr);
    }
  },
  
  commitSave() {
    const config = this.getConfig();
    const backup = localStorage[config.backupKey];
    if (backup) {
      localStorage[config.mainKey] = backup;
      delete localStorage[config.backupKey];
    }
    this.hasUnsavedChanges = false;
  },
  
  revertChanges() {
    const config = this.getConfig();
    delete localStorage[config.backupKey];
    this.hasUnsavedChanges = false;
  },

  // Method to add a new vocabulary (should be called when adding vocabularies)
  add(vocabularyId) {
    const existing = this.get();
    const alreadyExists = existing.some(v => v.id === vocabularyId);
    
    if (!alreadyExists) {
      existing.push({ id: vocabularyId, isNew: true });
      this.save(existing);
    }
  },

  filterVocabs(vocabs, searchTerm, statusFilter = 'all') {
    let filtered = vocabs;

    // Apply status filter
    if (statusFilter === 'new') filtered = filtered.filter(vocab => vocab.isNew);
    else if (statusFilter === 'old') filtered = filtered.filter(vocab => !vocab.isNew);
    else if (statusFilter === 'unavailable') filtered = filtered.filter(vocab => !vocab.name);

    // Apply search filter
    if (searchTerm?.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(vocab => 
        vocab.id.toLowerCase().includes(term) ||
        (vocab.name && vocab.name.toLowerCase().includes(term)) ||
        (vocab.author && vocab.author.toLowerCase().includes(term))
      );
    }

    return filtered;
  },
  
  async fetchAndCacheVocabData(vocabObj, forceRefetch = false) {
    // If we already have name and author is defined (not empty string) and not forcing refetch, return as is
    if (!forceRefetch && vocabObj.name && vocabObj.author) return vocabObj;
    
    const data = await fetchVocabularyBasicData(vocabObj.id);
    if (data) {
      return { 
        ...vocabObj,
        name: data.vocabularyName, 
        author: data.vocabularyAuthor 
      };
    }
    // Mark as unavailable if fetch failed
    return { ...vocabObj, name: null, author: null };
  },

  remove(id) { this.save(this.get().filter(v => v.id !== id)); this.refresh(); },

  toggleBtnText(selector, tempText, originalTextFn, duration = 1000) {
    const btn = this.popup.querySelector(selector);
    const originalText = originalTextFn();
    btn.textContent = tempText;
    setTimeout(() => btn.textContent = originalText, duration);
  },

  async copy(vocabsToCopy = null, useAlternativeFormat = false, filterType = 'all', isSearchActive = false) {
    const vocabs = vocabsToCopy || this.get();
    
    let textToCopy;
    if (useAlternativeFormat) {
      // Create alternative format: each vocabulary on a new line with author, name, and URL
      const lines = vocabs.map((v, index) => {
        const author = v.author || 'Неизвестный автор';
        const name = v.name || 'Название недоступно';
        const url = `https://klavogonki.ru/vocs/${v.id}/`;
        return `${index + 1}. Автор: ${author}, Словарь: ${name} - ${url}`;
      });
      textToCopy = lines.join('\n');
    } else {
      // Original format: comma-separated IDs
      textToCopy = vocabs.map(v => v.id).join(',');
    }
    
    try { 
      await navigator.clipboard.writeText(textToCopy); 
    }
    catch { 
      // Silent fail if clipboard is not available
    }
    
    this.toggleBtnText('.copy-all-btn', 'Скопировано!', () => this.getButtonText('copy', filterType, vocabs.length, isSearchActive));
  },

  removeAll(filterType = 'all', filteredVocabs = null) {
    const vocabs = this.get();
    let filtered;
    
    // If filteredVocabs is provided (search is active), remove only those specific items
    if (filteredVocabs) {
      const idsToRemove = new Set(filteredVocabs.map(v => v.id));
      filtered = vocabs.filter(v => !idsToRemove.has(v.id));
    } else {
      // Original filter-based removal
      if (filterType === 'all') {
        filtered = [];
      } else if (filterType === 'new') {
        filtered = vocabs.filter(v => !v.isNew);
      } else if (filterType === 'old') {
        filtered = vocabs.filter(v => v.isNew);
      } else if (filterType === 'unavailable') {
        filtered = vocabs.filter(v => v.name);
      }
    }
    
    const countToDelete = vocabs.length - filtered.length;
    this.save(filtered);
    this.toggleBtnText('.remove-all-btn', 'Удалено!', () => this.getButtonText('remove', filterType, countToDelete, !!filteredVocabs));
    this.refresh();
  },
  
  getButtonText(action, filterType, count, isSearchActive = false) {
    const filterNames = {
      'all': 'все',
      'new': 'новые',
      'old': 'старые',
      'unavailable': 'недоступные'
    };
    
    const actionVerbs = {
      'copy': 'Копировать',
      'remove': 'Удалить'
    };
    
    const actionVerb = actionVerbs[action] || '';
    
    if (isSearchActive) {
      return `${actionVerb} результат (${count})`;
    }
    
    const filterName = filterNames[filterType] || 'все';
    return `${actionVerb} ${filterName} (${count})`;
  },

  sortAll() {
    const vocabs = this.get().map(vocab => ({ ...vocab, isNew: false })); // Remove new status
    const sorted = vocabs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    this.save(sorted);
    this.toggleBtnText('.sort-all-btn', 'Отсортировано!', () => 'Сортировать');
    this.refresh();
  },
  
  async forceFetchAll() {
    const btn = this.popup.querySelector('.force-fetch-btn');
    btn.textContent = 'Обновление...';
    btn.disabled = true;

    const vocabs = this.get();
    const updatedVocabs = await Promise.all(
      vocabs.map(vocabObj => this.fetchAndCacheVocabData(vocabObj, true))
    );

    const availableCount = updatedVocabs.filter(v => v.name).length;
    const unavailableCount = updatedVocabs.filter(v => !v.name).length;

    this.save(updatedVocabs, false);

    btn.disabled = false;
    this.toggleBtnText('.force-fetch-btn', 'Обновлено!', () => 'Обновить все');
    await this.refresh();

    alert(
      `Обновление завершено!\n\n` +
      `Всего словарей: ${updatedVocabs.length}\n` +
      `Доступно: ${availableCount}\n` +
      `Недоступно: ${unavailableCount}`
    );
  },
  
  async handleSave() {
    this.commitSave();
    this.toggleBtnText('.save-btn', 'Сохранено!', () => 'Сохранить');
    await this.refresh();
  },
  
  async handleRevert() {
    this.revertChanges();
    this.toggleBtnText('.revert-btn', 'Отменено!', () => 'Отменить');
    await this.refresh();
  },

  scrollToBottom() {
    if (this.popup) {
      const vocabList = this.popup.querySelector('.vocab-list');
      if (vocabList) {
        vocabList.scrollTop = vocabList.scrollHeight;
      }
    }
  },

  scheduleScrollToBottom() {
    requestAnimationFrame(() => this.scrollToBottom());
  },

  createSearchAndFilterSection() {
    const searchSection = document.createElement('div');
    searchSection.className = 'popup-search-filters';

    // Search input
    const searchInput = Object.assign(document.createElement('input'), {
      type: 'text',
      placeholder: 'Поиск по ID, названию или автору...',
      className: 'search-input'
    });

    // Filter buttons container
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-buttons';

    // Create filter buttons
    const allBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn active',
      textContent: 'Все'
    });
    allBtn.setAttribute('data-filter', 'all');
    createCustomTooltip(allBtn, 'Показать все словари');

    const newBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Новые'
    });
    newBtn.setAttribute('data-filter', 'new');
    createCustomTooltip(newBtn, 'Показать только новые словари');

    const oldBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Старые'
    });
    oldBtn.setAttribute('data-filter', 'old');
    createCustomTooltip(oldBtn, 'Показать только старые словари');

    const unavailableBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Недоступные'
    });
    unavailableBtn.setAttribute('data-filter', 'unavailable');
    createCustomTooltip(unavailableBtn, 'Показать только недоступные словари');

    filterContainer.append(allBtn, newBtn, oldBtn, unavailableBtn);
    searchSection.append(searchInput, filterContainer);

    return { searchSection, searchInput, filterContainer };
  },

  async createElements() {
    const v = this.get();
    const container = document.createElement('div');
    container.className = 'banned-vocabularies-popup';

    const header = document.createElement('div');
    header.className = 'popup-header';
    const config = this.getConfig();
    header.textContent = this.hasUnsavedChanges ? `${config.title} *` : config.title;
    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    container.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'popup-actions';
    
    const copyBtn = Object.assign(document.createElement('button'), {
      className: 'copy-all-btn', 
      textContent: this.getButtonText('copy', 'all', v.length, false), 
      disabled: !v.length,
    });
    createCustomTooltip(copyBtn,
      `[Клик] Копировать в соответствии с текущим фильтром или результатами поиска 
      [Shift + Клик] Копировать в расширенном формате с авторами, названиями и ссылками`
    );
    
    const removeAllBtn = Object.assign(document.createElement('button'), {
      className: 'remove-all-btn', 
      textContent: this.getButtonText('remove', 'all', v.length, false), 
      disabled: !v.length
    });
    createCustomTooltip(removeAllBtn, 'Удалить в соответствии с текущим фильтром или результатами поиска');
    
    const sortBtn = Object.assign(document.createElement('button'), {
      className: 'sort-all-btn', 
      textContent: 'Сортировать', 
      disabled: !v.length, 
      onclick: () => this.sortAll()
    });
    createCustomTooltip(sortBtn, 'Отсортировать все словари по ID и снять статус новых');
    
    const forceFetchBtn = Object.assign(document.createElement('button'), {
      className: 'force-fetch-btn', 
      textContent: 'Обновить', 
      disabled: !v.length, 
      onclick: () => this.forceFetchAll()
    });
    createCustomTooltip(forceFetchBtn, 'Принудительно обновить информацию о всех словарях');
    
    actions.append(copyBtn, removeAllBtn, sortBtn, forceFetchBtn);
    
    // Save/Revert buttons (only show if there are unsaved changes)
    if (this.hasUnsavedChanges) {
      const saveBtn = Object.assign(document.createElement('button'), {
        className: 'save-btn',
        textContent: 'Сохранить',
        onclick: () => this.handleSave()
      });
      createCustomTooltip(saveBtn, '[Ctrl + S] Сохранить изменения');
      
      const revertBtn = Object.assign(document.createElement('button'), {
        className: 'revert-btn',
        textContent: 'Отменить',
        onclick: () => this.handleRevert()
      });
      createCustomTooltip(revertBtn, '[Ctrl + Z] Отменить все изменения');
      
      actions.append(saveBtn, revertBtn);
    }
    
    container.appendChild(actions);

    // Search and filter section
    const { searchSection, searchInput, filterContainer } = this.createSearchAndFilterSection();
    container.appendChild(searchSection);

    const list = document.createElement('div');
    list.className = 'vocab-list';

    if (v.length) {
      // Fetch vocabulary data for items that don't have it cached
      const updatedVocabs = await Promise.all(
        v.map(vocabObj => this.fetchAndCacheVocabData(vocabObj))
      );
      
      // Save enriched data without creating backup
      this.save(updatedVocabs, false);
      
      let currentFilteredVocabs = updatedVocabs; // Track currently displayed vocabularies
      let currentStatusFilter = 'all'; // Track current filter
      
      const updateButtons = (filterType, filteredVocabs, searchTerm) => {
        const isSearchActive = searchTerm?.trim().length > 0;
        
        // Update copy button - always based on currently displayed items
        copyBtn.textContent = this.getButtonText('copy', filterType, filteredVocabs.length, isSearchActive);
        copyBtn.disabled = filteredVocabs.length === 0;
        
        // Update remove button - based on displayed items when searching, or filter when not
        if (isSearchActive) {
          removeAllBtn.textContent = this.getButtonText('remove', filterType, filteredVocabs.length, true);
          removeAllBtn.disabled = filteredVocabs.length === 0;
        } else {
          const filterOnlyVocabs = this.filterVocabs(updatedVocabs, '', filterType);
          removeAllBtn.textContent = this.getButtonText('remove', filterType, filterOnlyVocabs.length, false);
          removeAllBtn.disabled = filterOnlyVocabs.length === 0;
        }
      };
      
      const updateFilterButtonCounts = () => {
        const allBtn = filterContainer.querySelector('[data-filter="all"]');
        const newBtn = filterContainer.querySelector('[data-filter="new"]');
        const oldBtn = filterContainer.querySelector('[data-filter="old"]');
        const unavailableBtn = filterContainer.querySelector('[data-filter="unavailable"]');
        
        const newCount = updatedVocabs.filter(v => v.isNew).length;
        const oldCount = updatedVocabs.filter(v => !v.isNew).length;
        const unavailableCount = updatedVocabs.filter(v => !v.name).length;
        
        allBtn.textContent = `Все (${updatedVocabs.length})`;
        newBtn.textContent = `Новые (${newCount})`;
        oldBtn.textContent = `Старые (${oldCount})`;
        unavailableBtn.textContent = `Недоступные (${unavailableCount})`;
      };
      
      const renderVocabs = (vocabsToRender) => {
        // Clear existing items
        list.innerHTML = '';
        currentFilteredVocabs = vocabsToRender; // Update the current filtered list
        
        if (vocabsToRender.length === 0) {
          const noResults = document.createElement('div');
          noResults.className = 'empty-state';
          noResults.textContent = 'Ничего не найдено';
          list.appendChild(noResults);
          return;
        }
        
        vocabsToRender.forEach((vocabObj) => {
          const item = document.createElement('div');
          item.className = 'vocab-item';
          if (vocabObj.isNew) {
            item.classList.add('vocab-item-new');
          }
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

        // Schedule scroll to bottom after rendering
        this.scheduleScrollToBottom();
      };

      const applyFilters = () => {
        const searchTerm = searchInput.value;
        const filteredVocabs = this.filterVocabs(updatedVocabs, searchTerm, currentStatusFilter);
        renderVocabs(filteredVocabs);
        updateButtons(currentStatusFilter, filteredVocabs, searchTerm);
      };

      // Initial render with all vocabularies and update filter button counts
      updateFilterButtonCounts();
      renderVocabs(updatedVocabs);
      updateButtons(currentStatusFilter, currentFilteredVocabs, '');

      // Add event listeners for buttons
      copyBtn.addEventListener('click', (e) => {
        const useAlternativeFormat = e.shiftKey;
        const isSearchActive = searchInput.value.trim().length > 0;
        this.copy(currentFilteredVocabs, useAlternativeFormat, currentStatusFilter, isSearchActive);
      });

      removeAllBtn.addEventListener('click', () => {
        const isSearchActive = searchInput.value.trim().length > 0;
        // If search is active, pass the filtered vocabs to remove only those
        this.removeAll(currentStatusFilter, isSearchActive ? currentFilteredVocabs : null);
      });

      // Add search functionality
      searchInput.addEventListener('input', applyFilters);

      // Add filter button functionality
      filterContainer.addEventListener('click', (e) => {
        if (!e.target.classList.contains('filter-btn')) return;
        
        // Update active button
        filterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update current filter
        currentStatusFilter = e.target.dataset.filter;
        
        // Apply filters
        applyFilters();
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
      // Schedule scroll to bottom after refresh
      this.scheduleScrollToBottom();
    }
  },

  async show(x = 100, y = 100) {
    this.hide();
    this.popup = await this.createElements();
    document.body.appendChild(this.popup);
    this.popup.style.left = x + 'px';
    this.popup.style.top = y + 'px';
    this.constrainToScreen();
    
    // Schedule scroll to bottom when showing
    this.scheduleScrollToBottom();
    
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

  toggle(x, y, listType = 'bannedVocabularies') { 
    this.currentListType = listType;
    this.popup ? this.hide() : this.show(x, y); 
  },

  outside: e => { 
    if (!VocabulariesManager.popup?.contains(e.target) && e.target.tagName !== 'BUTTON') 
      VocabulariesManager.hide(); 
  },
  
  keydown: e => {
    if (e.key === 'Escape') {
      VocabulariesManager.hide();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (VocabulariesManager.hasUnsavedChanges) {
        VocabulariesManager.handleSave();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (VocabulariesManager.hasUnsavedChanges) {
        VocabulariesManager.handleRevert();
      }
    }
  },

  startDrag(e) {
    this.isDragging = true;
    const rect = this.popup.getBoundingClientRect();
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', this.drag);
    document.addEventListener('mouseup', this.stopDrag);
  },

  drag: (e) => {
    if (!VocabulariesManager.isDragging || !VocabulariesManager.popup) return;
    VocabulariesManager.popup.style.left = (e.clientX - VocabulariesManager.offsetX) + 'px';
    VocabulariesManager.popup.style.top = (e.clientY - VocabulariesManager.offsetY) + 'px';
    VocabulariesManager.constrainToScreen();
  },

  stopDrag: () => {
    VocabulariesManager.isDragging = false;
    document.removeEventListener('mousemove', VocabulariesManager.drag);
    document.removeEventListener('mouseup', VocabulariesManager.stopDrag);
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