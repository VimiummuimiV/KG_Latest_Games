import { fetchVocabularyContent, showTooltip, startHideTimeout } from "./vocabularyContent";
import { fetchVocabularyBasicData } from "./vocabularyCreation";
import { createCustomTooltip } from "./tooltip";
import { icons } from './icons.js';
import { typeMapping } from "./definitions";

export const VocabulariesManager = {
  popup: null,
  isDragging: false,
  offsetX: 0,
  offsetY: 0,
  hasUnsavedChanges: false,
  currentListType: 'bannedVocabularies',

  listConfigs: {
    bannedVocabularies: {
      title: 'Заблокированные словари',
      adjective: 'заблокированных',
      mainKey: 'bannedVocabularies',
      backupKey: 'bannedVocabularies*Backup'
    },
    playedVocabularies: {
      title: 'Проигранные словари',
      adjective: 'проигранных',
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

  add(vocabularyId) {
    const existing = this.get();
    const alreadyExists = existing.some(v => v.id === vocabularyId);
   
    if (!alreadyExists) {
      existing.push({ id: vocabularyId, isNew: true });
      this.save(existing);
    }
  },

  filterVocabs(vocabs, searchTerm, statusFilter = 'all', typeFilter = 'all') {
    let filtered = vocabs;

    if (statusFilter === 'new') filtered = filtered.filter(vocab => vocab.isNew);
    else if (statusFilter === 'old') filtered = filtered.filter(vocab => !vocab.isNew);
    else if (statusFilter === 'unavailable') filtered = filtered.filter(vocab => !vocab.name);

    if (typeFilter !== 'all') {
      filtered = filtered.filter(vocab => vocab.vocType === typeFilter);
    }

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
    if (!forceRefetch && vocabObj.name && vocabObj.author && vocabObj.vocType) return vocabObj;
   
    const data = await fetchVocabularyBasicData(vocabObj.id);
    if (data) {
      return {
        ...vocabObj,
        name: data.vocabularyName,
        author: data.vocabularyAuthor,
        vocType: data.vocabularyType
      };
    }
    return { ...vocabObj, name: null, author: null, vocType: null };
  },

  remove(id) { this.save(this.get().filter(v => v.id !== id)); this.refresh(); },

  toggleBtnText(selector, tempText, originalTextFn, duration = 1000) {
    const btn = this.popup.querySelector(selector);
    const originalText = originalTextFn();
    btn.textContent = tempText;
    setTimeout(() => btn.textContent = originalText, duration);
  },

  async copy(vocabsToCopy = null, useAlternativeFormat = false, filterType = 'all', typeFilter = 'all', isSearchActive = false) {
    const vocabs = vocabsToCopy || this.get();
   
    let textToCopy;
    if (useAlternativeFormat) {
      const lines = vocabs.map((v, index) => {
        const author = v.author || 'Неизвестный автор';
        const name = v.name || 'Название недоступно';
        const url = `https://klavogonki.ru/vocs/${v.id}/`;
        return `${index + 1}. Автор: ${author}, Словарь: ${name} - ${url}`;
      });
      textToCopy = lines.join('\n');
    } else {
      textToCopy = vocabs.map(v => v.id).join(',');
    }
   
    try {
      await navigator.clipboard.writeText(textToCopy);
    }
    catch { }
   
    this.toggleBtnText('.copy-all-btn', 'Скопировано!', () => this.getButtonText('copy', filterType, typeFilter, vocabs.length, isSearchActive));
  },

  removeAll(filterType = 'all', typeFilter = 'all', filteredVocabs = null) {
    const vocabs = this.get();
    let filtered;
   
    if (filteredVocabs) {
      const idsToRemove = new Set(filteredVocabs.map(v => v.id));
      filtered = vocabs.filter(v => !idsToRemove.has(v.id));
    } else {
      if (filterType === 'all' && typeFilter === 'all') {
        filtered = [];
      } else {
        filtered = vocabs.filter(v => {
          let keepStatus = true;
          let keepType = true;
         
          if (filterType === 'new') keepStatus = !v.isNew;
          else if (filterType === 'old') keepStatus = v.isNew;
          else if (filterType === 'unavailable') keepStatus = !!v.name;
         
          if (typeFilter !== 'all') keepType = v.vocType !== typeFilter;
         
          return keepStatus && keepType;
        });
      }
    }
   
    const countToDelete = vocabs.length - filtered.length;
    this.save(filtered);
    this.toggleBtnText('.remove-all-btn', 'Удалено!', () => this.getButtonText('remove', filterType, typeFilter, countToDelete, !!filteredVocabs));
    this.refresh();
  },
 
  getButtonText(action, filterType, typeFilter, count, isSearchActive = false) {
    const filterNames = {
      'all': 'все',
      'new': 'новые',
      'old': 'старые',
      'unavailable': 'недоступные'
    };
   
    const typeNames = {
      'words': 'Слова',
      'phrases': 'Фразы',
      'texts': 'Тексты',
      'url': 'URL',
      'books': 'Книга',
      'generator': 'Генератор'
    };
   
    const actionVerbs = {
      'copy': 'Копировать',
      'remove': 'Удалить'
    };
   
    const actionVerb = actionVerbs[action] || '';
   
    if (isSearchActive) {
      return `${actionVerb} результат (${count})`;
    }
   
    const parts = [];
    if (filterType !== 'all') {
      parts.push(filterNames[filterType]);
    }
    if (typeFilter !== 'all') {
      parts.push(typeNames[typeFilter]);
    }
   
    const filterText = parts.length > 0 ? parts.join(' ') : filterNames['all'];
    return `${actionVerb} ${filterText} (${count})`;
  },

  sortAll() {
    let vocabs = this.get().map(vocab => ({ ...vocab, isNew: false }));

    if (this.currentListType === 'playedVocabularies') {
      // Sort playHistory within each vocab by date ascending
      vocabs.forEach(v => {
        if (v.playHistory && Array.isArray(v.playHistory)) {
          v.playHistory = v.playHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
      });

      // Group by primary date (earliest play date)
      const groups = {};
      vocabs.forEach(vocab => {
        if (vocab.playHistory && vocab.playHistory.length > 0) {
          const primaryDate = vocab.playHistory[0].date;
          const dateStr = new Date(primaryDate).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          if (!groups[dateStr]) {
            groups[dateStr] = [];
          }
          groups[dateStr].push(vocab);
        }
      });

      // Sort date keys ascending (oldest first)
      const sortedDateStr = Object.keys(groups).sort((a, b) => new Date(a) - new Date(b));

      // Sort within each group by ID ascending and flatten
      vocabs = sortedDateStr.flatMap(date => groups[date].sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    } else {
      // Simple numeric ID sort for banned lists (or any other list type)
      vocabs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }

    this.save(vocabs);
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

    const searchInput = Object.assign(document.createElement('input'), {
      type: 'text',
      placeholder: 'Поиск по ID, названию или автору...',
      className: 'search-input'
    });

    const statusFilterContainer = document.createElement('div');
    statusFilterContainer.className = 'filter-buttons';

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

    statusFilterContainer.append(allBtn, newBtn, oldBtn, unavailableBtn);

    const typeFilterContainer = document.createElement('div');
    typeFilterContainer.className = 'filter-buttons type-filter-buttons';

    const allTypesBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn active',
      textContent: 'Все типы'
    });
    allTypesBtn.setAttribute('data-type-filter', 'all');
    createCustomTooltip(allTypesBtn, 'Показать все типы словарей');

    const wordsBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Слова'
    });
    wordsBtn.setAttribute('data-type-filter', 'words');
    createCustomTooltip(wordsBtn, 'Показать только словари типа "Слова"');

    const phrasesBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Фразы'
    });
    phrasesBtn.setAttribute('data-type-filter', 'phrases');
    createCustomTooltip(phrasesBtn, 'Показать только словари типа "Фразы"');

    const textsBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Тексты'
    });
    textsBtn.setAttribute('data-type-filter', 'texts');
    createCustomTooltip(textsBtn, 'Показать только словари типа "Тексты"');

    const urlBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'URL'
    });
    urlBtn.setAttribute('data-type-filter', 'url');
    createCustomTooltip(urlBtn, 'Показать только словари типа "URL"');

    const booksBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Книга'
    });
    booksBtn.setAttribute('data-type-filter', 'books');
    createCustomTooltip(booksBtn, 'Показать только словари типа "Книга"');

    const generatorBtn = Object.assign(document.createElement('button'), {
      className: 'filter-btn',
      textContent: 'Генератор'
    });
    generatorBtn.setAttribute('data-type-filter', 'generator');
    createCustomTooltip(generatorBtn, 'Показать только словари типа "Генератор"');

    typeFilterContainer.append(allTypesBtn, wordsBtn, phrasesBtn, textsBtn, urlBtn, booksBtn, generatorBtn);

    searchSection.append(searchInput, statusFilterContainer, typeFilterContainer);

    return { searchSection, searchInput, statusFilterContainer, typeFilterContainer };
  },

  // Create a vocab item DOM node. count is optional (used for played count badges).
  createVocabItem(vocabObj, count = 0) {
    const item = document.createElement('div');
    item.className = 'vocab-item';
    if (vocabObj.isNew) item.classList.add('vocab-item-new');
    item.dataset.id = vocabObj.id;
    item.style.cursor = 'pointer';

    const leftSection = document.createElement('div');
    leftSection.className = 'vocab-left';

    const playBtn = Object.assign(document.createElement('button'), {
      className: 'vocab-play-btn control-button',
      innerHTML: icons.start
    });
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const params = new URLSearchParams({
        gametype: 'voc',
        type: 'normal',
        timeout: '10',
        level_from: '1',
        level_to: '9',
        submit: '1',
        voc: String(vocabObj.id)
      });
      window.location.href = `${location.protocol}//klavogonki.ru/create/?${params.toString()}`;
    });

    const idSpan = Object.assign(document.createElement('span'), {
      className: 'vocab-id',
      textContent: vocabObj.id
    });
    leftSection.appendChild(playBtn);
    leftSection.appendChild(idSpan);

    if (count > 1) {
      const badge = Object.assign(document.createElement('span'), {
        className: 'vocab-play-count-badge',
        textContent: count.toString()
      });
      leftSection.appendChild(badge);
    }

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

      if (vocabObj.vocType) {
        const typeNameRu = Object.keys(typeMapping).find(key => typeMapping[key] === vocabObj.vocType) || vocabObj.vocType;
        const typeSpan = Object.assign(document.createElement('div'), {
          className: 'vocab-type',
          textContent: `Тип словаря: ${typeNameRu}`
        });
        rightSection.appendChild(typeSpan);
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
    return item;
  },

  async createElements() {
    const v = this.get();
    const container = document.createElement('div');
    container.className = 'vocabularies-manager-popup';

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
      textContent: this.getButtonText('copy', 'all', 'all', v.length, false),
      disabled: !v.length,
    });
    createCustomTooltip(copyBtn,
      `[Клик] Копировать в соответствии с текущим фильтром или результатами поиска
      [Shift + Клик] Копировать в расширенном формате с авторами, названиями и ссылками`
    );
   
    const removeAllBtn = Object.assign(document.createElement('button'), {
      className: 'remove-all-btn',
      textContent: this.getButtonText('remove', 'all', 'all', v.length, false),
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

    const { searchSection, searchInput, statusFilterContainer, typeFilterContainer } = this.createSearchAndFilterSection();
    container.appendChild(searchSection);

    const list = document.createElement('div');
    list.className = 'vocab-list';

    if (v.length) {
      const updatedVocabs = await Promise.all(
        v.map(vocabObj => this.fetchAndCacheVocabData(vocabObj))
      );
     
      this.save(updatedVocabs, false);
     
      let currentFilteredVocabs = updatedVocabs;
      let currentStatusFilter = 'all';
      let currentTypeFilter = 'all';
     
      const updateButtons = (filterType, typeFilter, filteredVocabs, searchTerm) => {
        const isSearchActive = searchTerm?.trim().length > 0;
       
        copyBtn.textContent = this.getButtonText('copy', filterType, typeFilter, filteredVocabs.length, isSearchActive);
        copyBtn.disabled = filteredVocabs.length === 0;
       
        if (isSearchActive) {
          removeAllBtn.textContent = this.getButtonText('remove', filterType, typeFilter, filteredVocabs.length, true);
          removeAllBtn.disabled = filteredVocabs.length === 0;
        } else {
          const filterOnlyVocabs = this.filterVocabs(updatedVocabs, '', filterType, typeFilter);
          removeAllBtn.textContent = this.getButtonText('remove', filterType, typeFilter, filterOnlyVocabs.length, false);
          removeAllBtn.disabled = filterOnlyVocabs.length === 0;
        }
      };
     
      const updateFilterButtonCounts = () => {
        const allBtn = statusFilterContainer.querySelector('[data-filter="all"]');
        const newBtn = statusFilterContainer.querySelector('[data-filter="new"]');
        const oldBtn = statusFilterContainer.querySelector('[data-filter="old"]');
        const unavailableBtn = statusFilterContainer.querySelector('[data-filter="unavailable"]');
       
        const newCount = updatedVocabs.filter(v => v.isNew).length;
        const oldCount = updatedVocabs.filter(v => !v.isNew).length;
        const unavailableCount = updatedVocabs.filter(v => !v.name).length;
       
        allBtn.textContent = `Все (${updatedVocabs.length})`;
        newBtn.textContent = `Новые (${newCount})`;
        oldBtn.textContent = `Старые (${oldCount})`;
        unavailableBtn.textContent = `Недоступные (${unavailableCount})`;

        const allTypesBtn = typeFilterContainer.querySelector('[data-type-filter="all"]');
        const wordsCount = updatedVocabs.filter(v => v.vocType === 'words').length;
        const phrasesCount = updatedVocabs.filter(v => v.vocType === 'phrases').length;
        const textsCount = updatedVocabs.filter(v => v.vocType === 'texts').length;
        const urlCount = updatedVocabs.filter(v => v.vocType === 'url').length;
        const booksCount = updatedVocabs.filter(v => v.vocType === 'books').length;
        const generatorCount = updatedVocabs.filter(v => v.vocType === 'generator').length;

        allTypesBtn.textContent = `Все типы (${updatedVocabs.length})`;
        typeFilterContainer.querySelector('[data-type-filter="words"]').textContent = `Слова (${wordsCount})`;
        typeFilterContainer.querySelector('[data-type-filter="phrases"]').textContent = `Фразы (${phrasesCount})`;
        typeFilterContainer.querySelector('[data-type-filter="texts"]').textContent = `Тексты (${textsCount})`;
        typeFilterContainer.querySelector('[data-type-filter="url"]').textContent = `URL (${urlCount})`;
        typeFilterContainer.querySelector('[data-type-filter="books"]').textContent = `Книга (${booksCount})`;
        typeFilterContainer.querySelector('[data-type-filter="generator"]').textContent = `Генератор (${generatorCount})`;
      };
     
      const renderVocabs = (vocabsToRender) => {
        list.innerHTML = '';
        currentFilteredVocabs = vocabsToRender;

        if (vocabsToRender.length === 0) {
          const noResults = document.createElement('div');
          noResults.className = 'empty-state';
          noResults.textContent = 'Ничего не найдено';
          list.appendChild(noResults);
          return;
        }

        if (this.currentListType === 'playedVocabularies') {
          // Group vocabs by date from playHistory
          const vocabsByDate = new Map();
          
          vocabsToRender.forEach((vocabObj) => {
            if (vocabObj.playHistory && Array.isArray(vocabObj.playHistory)) {
              vocabObj.playHistory.forEach(historyEntry => {
                const dateStr = new Date(historyEntry.date).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                });
                
                if (!vocabsByDate.has(dateStr)) {
                  vocabsByDate.set(dateStr, {
                    items: [],
                    sortDate: new Date(historyEntry.date)
                  });
                }
                
                vocabsByDate.get(dateStr).items.push({
                  vocab: vocabObj,
                  count: historyEntry.count,
                  date: historyEntry.date
                });
              });
            }
          });
          
          // Sort dates in ascending order (oldest first)
          const sortedDates = Array.from(vocabsByDate.entries())
            .sort((a, b) => a[1].sortDate - b[1].sortDate)
            .map(([dateStr]) => dateStr);
          
          sortedDates.forEach(dateStr => {
            // Add date separator
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'vocab-date-separator';
            dateSeparator.textContent = dateStr;
            list.appendChild(dateSeparator);
            
            // Get vocabs for this date
            const vocabsForDate = vocabsByDate.get(dateStr).items;
            
            // Render vocabs for this date
            vocabsForDate.forEach(({ vocab: vocabObj, count }) => {
              list.appendChild(this.createVocabItem(vocabObj, count));
            });
          });
        } else {
          // Flat list rendering for banned vocabularies (or any other list type)
          vocabsToRender.forEach(vocabObj => list.appendChild(this.createVocabItem(vocabObj, 0)));
        }
        
        this.scheduleScrollToBottom();
      };

      const applyFilters = () => {
        const searchTerm = searchInput.value;
        const filteredVocabs = this.filterVocabs(updatedVocabs, searchTerm, currentStatusFilter, currentTypeFilter);
        renderVocabs(filteredVocabs);
        updateButtons(currentStatusFilter, currentTypeFilter, filteredVocabs, searchTerm);
      };

      updateFilterButtonCounts();
      renderVocabs(updatedVocabs);
      updateButtons(currentStatusFilter, currentTypeFilter, currentFilteredVocabs, '');

      copyBtn.addEventListener('click', (e) => {
        const useAlternativeFormat = e.shiftKey;
        const isSearchActive = searchInput.value.trim().length > 0;
        this.copy(currentFilteredVocabs, useAlternativeFormat, currentStatusFilter, currentTypeFilter, isSearchActive);
      });

      removeAllBtn.addEventListener('click', () => {
        const isSearchActive = searchInput.value.trim().length > 0;
        this.removeAll(currentStatusFilter, currentTypeFilter, isSearchActive ? currentFilteredVocabs : null);
      });

      searchInput.addEventListener('input', applyFilters);

      statusFilterContainer.addEventListener('click', (e) => {
        if (!e.target.classList.contains('filter-btn')) return;
       
        statusFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
       
        currentStatusFilter = e.target.dataset.filter;
       
        applyFilters();
      });

      typeFilterContainer.addEventListener('click', (e) => {
        if (!e.target.classList.contains('filter-btn')) return;
       
        typeFilterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
       
        currentTypeFilter = e.target.dataset.typeFilter;
       
        applyFilters();
      });

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

      list.addEventListener('mouseover', (e) => {
        if (!e.shiftKey) return;
        const item = e.target.closest('.vocab-item');
        if (!item) return;
        const id = item.dataset.id || item.querySelector('.vocab-id')?.textContent;
        if (!id) return;
        fetchVocabularyContent(id).then(content => showTooltip(item, content)).catch(() => {});
      }, { capture: true });

      list.addEventListener('mouseout', (e) => {
        const item = e.target.closest('.vocab-item');
        if (!item) return;
        startHideTimeout();
      }, { capture: true });

    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = `Нет ${this.getConfig().adjective} словарей`;
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
      this.scheduleScrollToBottom();
    }
  },

  async show(x = 100, y = 100, offsetX = 20, offsetY = 20) {
    this.hide();
    this.popup = await this.createElements();
    document.body.appendChild(this.popup);
    this.popup.style.left = (x + offsetX) + 'px';
    this.popup.style.top = (y + offsetY) + 'px';
    this.constrainToScreen();

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
    // If popup is open and same type requested -> hide. If open and different type -> switch and refresh.
    if (this.popup) {
      if (this.currentListType === listType) {
        this.hide();
      } else {
        this.currentListType = listType;
        // refresh will recreate contents while preserving popup element position
        this.refresh().catch(() => {});
      }
    } else {
      this.currentListType = listType;
      this.show(x, y);
    }
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