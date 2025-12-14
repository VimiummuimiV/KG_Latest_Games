import { createElement, generateUniqueId, getCurrentPage } from "../../utils.js";
import { createCustomTooltip, refreshTooltipSettings } from "../../tooltip.js";
import { icons } from "../../icons.js";
import { toggleSearchBox } from "./search.js";
import { DEFAULTS } from "../../definitions.js";
import { addGameToGroup, fetchVocabularyBasicData } from "../../vocabularyCreation.js";
import { showMigrationPopup } from "../../vocabularyMigration.js";
import { getSessionVocId } from "../../vocabularyContent.js";
import { VocabulariesManager } from "../../vocabulariesManager.js";
import { showVocabularyTypesPopup } from "../../vocabularyType.js";

export function createControls(main) {
  const controlsContainer = createElement('div', { className: 'latest-games-controls' });

  const controlsLimiter = createElement('div', { className: 'controls-limiter' });
  const controlsButtons = createElement('div', { className: 'controls-buttons' });
  // Create visible and more buttons containers
  const visibleButtons = createElement('div', { className: 'controls-visible' });
  const moreButtons = createElement('div', { className: 'controls-more' });

  controlsButtons.append(visibleButtons, moreButtons);
  moreButtons.appendChild(controlsLimiter);
  controlsContainer.append(controlsButtons);

  // Create the options section with buttons to adjust game count
  const options = createElement('span', { id: 'latest-games-options' });
  controlsLimiter.appendChild(options);

  const decreaseBtn = createElement('span', {
    id: 'latest-games-count-dec',
    className: 'control-button',
    innerHTML: icons.decrease
  });
  createCustomTooltip(decreaseBtn, 'Уменьшить количество сохраняемых игр');

  const countDisplay = createElement('span', {
    id: 'latest-games-count',
    className: main.shouldAutoSave === false ? 'latest-games-disabled' : '',
    textContent: main.maxGameCount.toString()
  });
  createCustomTooltip(countDisplay,
    main.shouldAutoSave
      ? 'Автосохранение включено'
      : 'Автосохранение отключено'
  );

  countDisplay.addEventListener('click', () => {
    main.shouldAutoSave = !main.shouldAutoSave;
    main.uiManager.updateGameCountDisplay();
    main.settingsManager.saveSettings();
    main.uiManager.refreshContainer();
  });

  const increaseBtn = createElement('span', {
    id: 'latest-games-count-inc',
    className: 'control-button',
    innerHTML: icons.increase
  });
  createCustomTooltip(increaseBtn, 'Увеличить количество сохраняемых игр');

  decreaseBtn.addEventListener('click', () => main.gamesManager.changeGameCount(-1));
  increaseBtn.addEventListener('click', () => main.gamesManager.changeGameCount(1));

  options.append(decreaseBtn, countDisplay, increaseBtn);

  // Function to update the tooltip text based on button state
  const updateTooltip = (button, isEnabled, texts, delay) => {
    // texts: { click, shift, ctrl, alt, shiftAlt }
    const clickText = typeof texts.click === 'function' ? texts.click(isEnabled) : texts.click;
    const shiftText = typeof texts.shift === 'function' ? texts.shift(isEnabled) : texts.shift;
    const ctrlText = texts.ctrl ? (typeof texts.ctrl === 'function' ? texts.ctrl(isEnabled) : texts.ctrl) : '';
    const altText = texts.alt ? (typeof texts.alt === 'function' ? texts.alt(isEnabled) : texts.alt) : '';
    const shiftAltText = texts.shiftAlt ? (typeof texts.shiftAlt === 'function' ? texts.shiftAlt(isEnabled) : texts.shiftAlt) : '';
    createCustomTooltip(button, `
      [Клик] ${clickText}
      [Shift + Клик] ${shiftText}${delay ? ` (${delay} мс)` : ''}
      ${ctrlText ? `[Ctrl + Клик] ${ctrlText}` : ''}
      ${altText ? `[Alt + Клик] ${altText}` : ''}
      ${shiftAltText ? `[Shift + Alt + Клик] ${shiftAltText}` : ''}
    `);
  };

  const setupControlButton = (button, context, property, delayProperty, texts) => {
    const isInitiallyEnabled = context[property];
    button.classList.toggle('latest-games-disabled', !isInitiallyEnabled);
    updateTooltip(button, isInitiallyEnabled, texts, context[delayProperty]);

    button.onclick = (e) => {
      if (e.ctrlKey && button === replayBtn) {
        main.replayNextGame = !main.replayNextGame;
        main.settingsManager.saveSettings();
        button.classList.toggle('replay-next-game', main.replayNextGame);
        button.innerHTML = getReplayIcon();
        updateTooltip(button, context[property], texts, context[delayProperty]);
        return;
      }
      if (e.altKey && button === replayBtn) {
        main.replayWithoutWaiting = !main.replayWithoutWaiting;
        main.settingsManager.saveSettings();
        button.classList.toggle('replay-without-waiting', main.replayWithoutWaiting);
        button.innerHTML = getReplayIcon();
        updateTooltip(button, context[property], texts, context[delayProperty]);
        return;
      }
      const shiftText = typeof texts.shift === 'function' ? texts.shift(context[property]) : texts.shift;
      if (e.shiftKey) {
        const newDelay = prompt(shiftText, "");
        if (newDelay !== null) {
          const delayValue = parseInt(newDelay, 10);
          if (!isNaN(delayValue) && delayValue >= 0) {
            context[delayProperty] = delayValue;
            main.settingsManager.saveSettings();
            updateTooltip(button, context[property], texts, delayValue);
          } else {
            alert(texts.delayErrorText);
          }
        }
      } else {
        context[property] = !context[property];
        main.settingsManager.saveSettings();
        button.classList.toggle('latest-games-disabled', !context[property]);
        updateTooltip(button, context[property], texts, context[delayProperty]);
      }
    };
  };

  // Add refresh button (regenerate all IDs or vocTypes)
  const refreshBtn = createElement('span', {
    className: 'latest-games-refresh control-button',
    innerHTML: icons.refresh
  });

  createCustomTooltip(refreshBtn, `
    [Клик] Сгенерировать новые уникальные ID для всех групп и игр
    [Shift + Клик] Обновить типы словарей для всех игр (если отсутствуют)
  `);

  refreshBtn.addEventListener('click', async (e) => {
    if (e.shiftKey) {
      // Shift+Click: Update missing vocType for all games
      if (!confirm('Вы уверены, что хотите обновить типы словарей для всех игр без них? Это может занять время.')) return;

      const allGames = [];
      main.groupsManager.groups.forEach(group => {
        group.games.forEach(game => {
          if (game.params && (game.params.vocType === null || game.params.vocType === undefined)) {
            allGames.push({ group, game });
          }
        });
      });

      if (allGames.length === 0) {
        alert('✔️ Все игры уже имеют типы словарей.');
        return;
      }

      let updatedCount = 0;
      const DELAY_MS = 500; // Optional delay between fetches (set to 0 for no rate limiting)

      for (const { group, game } of allGames) {
        const vocId = game.params.vocId;
        if (vocId) {
          const basic = await fetchVocabularyBasicData(vocId).catch(() => null);
          if (basic && basic.vocabularyType) {
            game.params.vocType = basic.vocabularyType;
            updatedCount++;
          }
        }
        // Optional rate limiting delay
        if (DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      main.gamesManager.saveGameData();
      main.uiManager.refreshContainer();
      alert(`✔️ Обновлено ${updatedCount} игр с типами словарей.`);
    } else {
      // Original Click: Refresh IDs only
      if (!confirm('Вы уверены, что хотите сгенерировать новые уникальные ID для всех групп и игр? Это действие нельзя отменить.')) return;

      // Save previous group and game IDs
      const previousGroupId = main.groupsManager.currentGroupId;
      const previousGameId = main.gamesManager.latestGamesData?.previousGameId;

      // Store old IDs before regeneration
      main.groupsManager.groups.forEach(group => {
        group._oldId = group.id;
        group.games.forEach(game => {
          game._oldId = game.id;
        });
      });

      // Regenerate all IDs
      main.groupsManager.groups.forEach(group => {
        group.id = generateUniqueId(main.groupsManager.groups);
        group.games.forEach(game => {
          game.id = generateUniqueId(main.groupsManager.groups);
        });
      });

      // Restore currentGroupId if possible
      if (previousGroupId) {
        const foundGroup = main.groupsManager.groups.find(g => g._oldId === previousGroupId);
        if (foundGroup) main.groupsManager.currentGroupId = foundGroup.id;
      }
      // Restore previousGameId if possible
      if (previousGameId) {
        for (const group of main.groupsManager.groups) {
          const found = group.games.find(g => g._oldId === previousGameId);
          if (found) {
            main.gamesManager.latestGamesData.previousGameId = found.id;
            break;
          }
        }
      }
      // Remove temporary _oldId properties
      main.groupsManager.groups.forEach(group => {
        delete group._oldId;
        group.games.forEach(game => delete game._oldId);
      });
      main.gamesManager.saveGameData();
      main.uiManager.refreshContainer();
      alert('✔️ Все ID для групп и игр были обновлены!');
    }
  });

  // Add button to reset panel individual page settings to defaults
  const resetButton = createElement('span', {
    className: 'latest-games-reset-panels control-button',
    innerHTML: icons.reset
  });

  createCustomTooltip(resetButton, 'Сбросить настройки панели на значения по умолчанию');

  resetButton.addEventListener('click', () => {
    if (!confirm('Вы уверены, что хотите сбросить настройки панели на значения по умолчанию? Это действие нельзя отменить.')) return;
    resetPanelSettings(main);
  });

  function resetPanelSettings(main) {
    // Reset panel-specific settings to defaults
    main.panelWidths = { ...DEFAULTS.panelWidths };
    main.panelHeights = { ...DEFAULTS.panelHeights };
    main.panelYPosition = { ...DEFAULTS.panelYPosition };
    main.alwaysVisiblePanel = { ...DEFAULTS.alwaysVisiblePanel };

    // Save the updated settings
    main.settingsManager.saveSettings();

    // If there's a UI refresh method, call it to apply changes immediately
    if (main.uiManager && main.uiManager.refreshContainer) {
      main.uiManager.refreshContainer();
    }
  }

  // Add button to toggle auto-start of games
  const playBtn = createElement('span', {
    className: 'latest-games-play control-button',
    innerHTML: icons.play
  });
  setupControlButton(playBtn, main, 'shouldStart', 'startDelay', {
    click: (isEnabled) => isEnabled
      ? 'Отключить автозапуск игры'
      : 'Включить автозапуск игры',
    shift: () => 'Изменить задержку запуска в миллисекундах',
    delayErrorText: 'Пожалуйста, введите корректное значение задержки запуска.'
  });

  // Add button to toggle replay in game
  const getReplayIcon = () => main.replayWithoutWaiting ? icons.replayImmediately : icons.replay;
  const replayBtn = createElement('span', {
    className: 'latest-games-replay control-button'
      + (main.replayNextGame ? ' replay-next-game' : '')
      + (main.replayWithoutWaiting ? ' replay-without-waiting' : ''),
    innerHTML: getReplayIcon()
  });
  setupControlButton(replayBtn, main, 'shouldReplay', 'replayDelay', {
    click: (isEnabled) => isEnabled
      ? 'Отключить автоповтор игры'
      : 'Включить автоповтор игры',
    shift: () => 'Изменить задержку автосоздания в миллисекундах:',
    ctrl: () => main.replayNextGame ? 'Режим создания следующей игры' : 'Режим повтора текущей игры',
    alt: () => main.replayWithoutWaiting ? 'Режим создания без ожидания игроков' : 'Режим создания с ожиданием игроков',
    delayErrorText: 'Пожалуйста, введите корректное значение задержки автоповтора.'
  });

  // Add button to toggle replay more functionality with count setting
  const replayMoreBtn = createElement('span', {
    className: 'latest-games-replay-more control-button' + (main.shouldReplayMore === false ? ' latest-games-disabled' : ''),
    innerHTML: icons.replayMore
  });

  const updateReplayMoreTooltip = () => {
    createCustomTooltip(replayMoreBtn, `
      [Клик] ${main.shouldReplayMore ? 'Отключить многократный повтор игры' : 'Включить многократный повтор игры'}
      [Shift + Клик] Изменить количество повторов (${main.replayNextGameCount})
    `);
  };

  updateReplayMoreTooltip();

  replayMoreBtn.onclick = (e) => {
    if (e.shiftKey) {
      let countInput;
      do {
        countInput = prompt('Введите количество повторов игры:', main.replayNextGameCount.toString());
        if (countInput === null) return; // User cancelled
        
        const countValue = parseInt(countInput, 10);
        if (!isNaN(countValue) && countValue >= 1) {
          main.replayNextGameCount = countValue;
          main.settingsManager.saveSettings();
          updateReplayMoreTooltip();
          return;
        } else {
          alert('⚠️ Пожалуйста, введите корректное число (больше или равно 1).');
        }
      } while (true);
    } else {
      main.shouldReplayMore = !main.shouldReplayMore;
      main.settingsManager.saveSettings();
      replayMoreBtn.classList.toggle('latest-games-disabled', !main.shouldReplayMore);
      updateReplayMoreTooltip();
    }
  };

  // Add button to pin all games in the current group or all groups
  const pinAllBtn = createElement('span', {
    className: 'latest-games-pinall control-button',
    innerHTML: icons.pin
  });
  createCustomTooltip(pinAllBtn, `
    [Клик] Закрепить все игры в текущей группе
    [Shift + Клик] Закрепить все игры во всех группах
  `);
  pinAllBtn.onclick = (e) => {
    if (e.shiftKey) {
      main.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 1));
    } else {
      const currentGroup = main.groupsManager.getCurrentGroup(main.groupsManager.groups, main.groupsManager.currentGroupId);
      if (currentGroup) {
        currentGroup.games.forEach(game => game.pin = 1);
      }
    }
    main.gamesManager.saveGameData();
    main.uiManager.refreshContainer();
  };

  // Add button to unpin all games in the current group or all groups
  const unpinAllBtn = createElement('span', {
    className: 'latest-games-unpinall control-button',
    innerHTML: icons.unpin
  });
  createCustomTooltip(unpinAllBtn, `
    [Клик] Открепить все игры в текущей группе
    [Shift + Клик] Открепить все игры во всех группах
  `);
  unpinAllBtn.onclick = (e) => {
    if (e.shiftKey) {
      main.groupsManager.groups.forEach(group => group.games.forEach(game => game.pin = 0));
    } else {
      const currentGroup = main.groupsManager.getCurrentGroup(main.groupsManager.groups, main.groupsManager.currentGroupId);
      if (currentGroup) {
        currentGroup.games.forEach(game => game.pin = 0);
      }
    }
    main.gamesManager.saveGameData();
    main.uiManager.refreshContainer();
  };

  // Add button to sort games in the current group alphabetically
  const sortBtn = createElement('span', {
    className: 'latest-games-sort control-button',
    innerHTML: icons.sort
  });
  createCustomTooltip(sortBtn, 'Сортировать игры в текущей группе по алфавиту');
  sortBtn.addEventListener('click', () => main.groupsManager.sortActiveGroupGames());

  // Add button to import settings from a JSON file
  const importBtn = createElement('span', {
    className: 'latest-games-import control-button',
    innerHTML: icons.import
  });
  createCustomTooltip(importBtn, 'Импортировать настройки из JSON файла');
  importBtn.onclick = () => main.settingsManager.importSettings(main);

  // Add button to export all settings to a JSON file
  const exportBtn = createElement('span', {
    className: 'latest-games-export control-button',
    innerHTML: icons.export
  });
  createCustomTooltip(exportBtn, 'Экспортировать все настройки в JSON файл');
  exportBtn.onclick = () => main.settingsManager.exportSettings(main);

  // Add button to remove all settings
  const removeAllBtn = createElement('span', {
    className: 'latest-games-removeall control-button',
    innerHTML: icons.trashNothing
  });
  createCustomTooltip(removeAllBtn, 'Удалить все настройки');
  removeAllBtn.onclick = () => main.settingsManager.removeAllSettings(main);

  // Add button to remove all unpinned games in the current group or all groups
  const removeUnpinnedBtn = createElement('span', {
    className: 'latest-games-remove-unpinned control-button',
    innerHTML: icons.broom
  });
  createCustomTooltip(removeUnpinnedBtn, `
    [Клик] Удалить все незакреплённые игры в текущей группе
    [Shift + Клик] Удалить все незакреплённые игры во всех группах
  `);
  removeUnpinnedBtn.onclick = (e) => {
    if (e.shiftKey) {
      main.groupsManager.groups.forEach(group => {
        group.games = group.games.filter(game => game.pin);
      });
    } else {
      const currentGroup = main.groupsManager.getCurrentGroup(main.groupsManager.groups, main.groupsManager.currentGroupId);
      if (currentGroup) {
        currentGroup.games = currentGroup.games.filter(game => game.pin);
      }
    }
    main.gamesManager.saveGameData();
    main.uiManager.refreshContainer();
  };

  // Add drag toggle button
  const dragToggleBtn = createElement('span', {
    className: 'latest-games-drag-toggle control-button',
    innerHTML: icons.dragToggle
  });
  createCustomTooltip(
    dragToggleBtn,
    main.enableDragging
      ? 'Перетаскивание включено'
      : 'Перетаскивание отключено'
  );
  dragToggleBtn.classList.toggle('latest-games-disabled', !main.enableDragging);
  dragToggleBtn.onclick = () => {
    main.enableDragging = !main.enableDragging;
    main.settingsManager.saveSettings();
    main.uiManager.refreshContainer();
    createCustomTooltip(
      dragToggleBtn,
      main.enableDragging
        ? 'Перетаскивание включено'
        : 'Перетаскивание отключено'
    );
    dragToggleBtn.classList.toggle('latest-games-disabled', !main.enableDragging);
  };

  // Add description toggle button
  const descToggleBtn = createElement('span', {
    className: 'latest-games-desc-toggle control-button',
    innerHTML: icons.info
  });
  createCustomTooltip(
    descToggleBtn,
    main.showButtonDescriptions
      ? 'Скрыть описания кнопок'
      : 'Показать описания кнопок'
  );
  descToggleBtn.classList.toggle('latest-games-disabled', !main.showButtonDescriptions);

  descToggleBtn.onclick = () => {
    main.showButtonDescriptions = !main.showButtonDescriptions;
    main.settingsManager.saveSettings();
    descToggleBtn.classList.toggle('latest-games-disabled', !main.showButtonDescriptions);
    createCustomTooltip(
      descToggleBtn,
      main.showButtonDescriptions
        ? 'Скрыть описания кнопок'
        : 'Показать описания кнопок'
    );
    // Refresh the container so that game descriptions are re-rendered according to the setting
    main.uiManager.refreshContainer();
    // Scroll controls to bottom after refresh to ensure all buttons are accessible
    setTimeout(() => {
      const controlsArea = document.querySelector('.latest-games-controls');
      if (controlsArea) controlsArea.scrollTop = controlsArea.scrollHeight;
    }, 0);
  };

  // Add help toggle button
  const helpToggleBtn = createElement('span', {
    className: 'latest-games-help-toggle control-button' + (main.showHelpTooltips ? '' : ' latest-games-disabled'),
    innerHTML: icons.help
  });
  const updateHelpTooltip = () => {
    createCustomTooltip(
      helpToggleBtn,
      main.showHelpTooltips
        ? 'Скрыть подсказки'
        : 'Показать подсказки',
      'help'
    );
    helpToggleBtn.classList.toggle('latest-games-disabled', !main.showHelpTooltips);
  }
  updateHelpTooltip();
  helpToggleBtn.addEventListener('click', () => {
    refreshTooltipSettings();
    main.showHelpTooltips = !main.showHelpTooltips;
    main.settingsManager.saveSettings();
    updateHelpTooltip();
    // Refresh the container to update tooltips
    main.uiManager.refreshContainer();
  });

  // Add search button
  const searchBtn = createElement('span', {
    className: 'latest-games-search-btn control-button' + (main.showSearchBox ? '' : ' latest-games-disabled'),
    innerHTML: icons.search
  });
  const updateSearchTooltip = () => {
    createCustomTooltip(
      searchBtn,
      main.showSearchBox
        ? 'Скрыть строку поиска'
        : 'Показать строку поиска'
    );
    searchBtn.classList.toggle('latest-games-disabled', !main.showSearchBox);
  };
  updateSearchTooltip();
  searchBtn.addEventListener('click', () => {
    toggleSearchBox(main);
    updateSearchTooltip();
  });

  // Add random game button
  const randomRaceBtn = createElement('span', {
    className: 'latest-games-random control-button' + (main.randomGameId ? '' : ' latest-games-disabled'),
    innerHTML: icons.random
  });
  const updateRandomTooltip = () => {
    updateTooltip(randomRaceBtn, !!main.randomGameId, {
      click: (isEnabled) => {
        const modeLabel = main.randomGameId === 'global' ? 'глобальный' : main.randomGameId === 'local' ? 'локальный' : 'выключен';
        return isEnabled
          ? `Отключить случайный выбор игры (${modeLabel})`
          : `Включить случайный выбор игры (${modeLabel})`;
      },
      shift: () => {
        // total: from raw validVocabularies in localStorage (pre-filter)
        let totalIds = [];
        try {
          const raw = JSON.parse(localStorage.getItem('validVocabularies') || '{}');
          if (raw && typeof raw === 'object') totalIds = Object.values(raw).flat().filter(Boolean).map(String);
        } catch (_) { totalIds = []; }
        const total = new Set(totalIds).size;
        const excluded = (() => {
          try {
            return new Set([
              ...(JSON.parse(localStorage.getItem('bannedVocabularies')||'[]')||[]).map(x=>String(typeof x==='string'?x:x.id||x||'')),
              ...(JSON.parse(localStorage.getItem('playedVocabularies')||'[]')||[]).map(x=>String(typeof x==='string'?x:x.id||x||''))
            ].filter(Boolean));
          } catch (_) { return new Set(); }
        })();
        let available = 0; for (const id of new Set(totalIds)) if (!excluded.has(id)) available++;
        return `Обновить список допустимых словарей (всего: ${total}, доступно: ${available})`;
      },
      ctrl: () => main.showBlockedVocabAlert ? 'Отключить предупреждение о недоступных словарях' : 'Включить предупреждение о недоступных словарях',
      alt: (isEnabled) => isEnabled === 'global' || main.randomGameId === 'global' ? 'Отключить глобальный режим' : 'Включить глобальный режим',
      shiftAlt: () => 'Выбрать типы словарей'
    });
    // Reflect disabled state visually
    randomRaceBtn.classList.toggle('latest-games-disabled', !main.randomGameId);
    // Add mode-specific classes for styling: random-global or random-local
    randomRaceBtn.classList.remove('random-global', 'random-local');
    if (main.randomGameId === 'global') {
      randomRaceBtn.classList.add('random-global');
    } else if (main.randomGameId === 'local') {
      randomRaceBtn.classList.add('random-local');
    }
  };
  updateRandomTooltip();

  // Toggle random game selection setting when clicking the button
  // Shift+Click: set globalLatestId
  randomRaceBtn.onclick = (e) => {
    // Shift+Alt+Click: show vocabulary types toggle popup
    if (e.shiftKey && e.altKey) {
      e.preventDefault();
      showVocabularyTypesPopup(e, main);
      return;
    }
    // Ctrl+Click: toggle showing the blocked-vocab alert
    if (e.ctrlKey) {
      main.showBlockedVocabAlert = !main.showBlockedVocabAlert;
      main.settingsManager.saveSettings();
      updateRandomTooltip();
      alert(
        main.showBlockedVocabAlert
          ? '✔️ Предупреждение о заблокированных словарях включено.'
          : '❌ Предупреждение о заблокированных словарях отключено.'
      );
      return;
    }
    if (e.shiftKey) {
      // Fetch the CSV/CSV-like list from the raw GitHub URL and store in localStorage
      const url = 'https://raw.githubusercontent.com/VimiummuimiV/KG_Latest_Games/refs/heads/main/src/etc/valid_vocabularies.txt';
      fetch(url, { cache: 'no-store' })
        .then(r => {
          if (!r.ok) throw new Error('Network response was not ok: ' + r.status);
          return r.json();
        })
        .then(data => {
          try {
            const saved = main.settingsManager.saveValidVocabularies(data.validVocabularies || {});
            const totalCount = Object.values(saved).flat().length;
            updateRandomTooltip();
            alert(`✔️ Список словарей обновлён, записано ${totalCount} ID.`);
          } catch (err) {
            console.warn('Could not save valid vocabularies via SettingsManager', err);
            alert('⚠️ Не удалось сохранить список в localStorage.');
          }
        }).catch(err => {
          console.warn('Failed to fetch valid vocabularies:', err);
          alert('⚠️ Ошибка загрузки списка допустимых словарей: ' + err.message);
        });
      return;
    }
    // Alt+Click: toggle global mode on/off
    if (e.altKey) {
      if (main.randomGameId === 'global') {
        main.randomGameId = false;
      } else {
        main.randomGameId = 'global';
      }
      main.settingsManager.saveSettings();
      updateRandomTooltip();
      return;
    }
    // Regular click: toggle between false and 'local'
    if (main.randomGameId === 'local') {
      main.randomGameId = false;
    } else {
      main.randomGameId = 'local';
    }
    main.settingsManager.saveSettings();
    updateRandomTooltip();
  };

  // Add start latest played or random game button
  const startRaceBtn = createElement('span', {
    className: 'latest-games-start control-button',
    innerHTML: icons.start
  });
  createCustomTooltip(
    startRaceBtn, `
    [Shift + Enter | Клик] Начать игру (последняя или следующая: работает только на странице игры)
    [Ctrl + Shift + Enter | Клик] Пройти квалификацию по словарю
    [Shift + Alt + Enter | Клик] Добавить текущий словарь в Избранные
    `
  );

  // Function to add 'qual=1' parameter to URL
  const addQualParam = (url) => {
    try {
      const u = new URL(url);
      u.searchParams.set('qual', '1');
      return u.toString();
    } catch (__) {
      return url;
    }
  };

  // Start race action function
  // Choose id (random or previous), switch group if needed, save and navigate
  const startRaceAction = (qual = false) => {
    // If qualification requested, force local mode — do not randomize
    const randomMode = qual ? false : main.randomGameId;
    let res = null;

    // If we're on a GAME page and not in random mode, pick the next
    // game from the group after the previous played one.
    // If NONE, pick the previous played.
    try {
      if (getCurrentPage() === 'game' && !randomMode && !qual) {
        const currentGroup = main.groupsManager.getCurrentGroup(main.groupsManager.groups, main.groupsManager.currentGroupId);
        if (!currentGroup || !Array.isArray(currentGroup.games) || currentGroup.games.length === 0) return alert('❌ Нет игр в текущей группе');
        const prevId = main.gamesManager.getPreviousGameId();
        let idx = currentGroup.games.findIndex(g => String(g.id) === String(prevId));
        idx = (idx === -1) ? 0 : (idx + 1) % currentGroup.games.length;
        const nextGame = currentGroup.games[idx];
        if (!nextGame) return alert('❌ Не удалось определить следующую игру');

        // Select group and persist previousGameId
        main.groupsManager.selectGroup(currentGroup.id);
        main.gamesManager.latestGamesData = main.gamesManager.latestGamesData || {};
        main.gamesManager.latestGamesData.previousGameId = nextGame.id;
        main.gamesManager.saveGameData();

        // Register pending played vocab if vocId exists
        const vocId = String(nextGame.params?.vocId || '');
        if (vocId) {
          try {
            main.gamesManager.registerPendingPlayed(vocId, nextGame.params?.vocName || null, nextGame.params?.vocType || null);
          } catch (__) { }
        }

        const url = main.gamesManager.generateGameLink(nextGame);
        location.href = qual ? addQualParam(url) : url;
        return;
      }
    } catch (err) {
      console.warn('Error selecting next game in group', err);
    }

    if (randomMode) {
      res = main.gamesManager.getRandomGameId();
      if (!res) return alert('❌ Нет подходящей игры');
    } else {
      const prevId = main.gamesManager.getPreviousGameId();
      if (!prevId) return alert('❌ Нет подходящей игры');
      const game = main.gamesManager.findGameById(prevId);
      if (!game) return alert('❌ Игра не найдена');
      res = { mode: 'local', id: prevId, game, groupId: main.groupsManager.currentGroupId, url: main.gamesManager.generateGameLink(game) };
    }

    // If local mode, ensure we switch to the containing group and persist previousGameId
    if (res.mode === 'local') {
      if (res.groupId) {
        main.groupsManager.selectGroup(res.groupId);
      } else {
        // Try to find the group containing the game
        for (const g of main.groupsManager.groups) {
          if (g.games.some(x => x.id === res.id)) {
            main.groupsManager.selectGroup(g.id);
            break;
          }
        }
      }
      main.gamesManager.latestGamesData = main.gamesManager.latestGamesData || {};
      main.gamesManager.latestGamesData.previousGameId = res.id;
      main.gamesManager.saveGameData();

      // Register pending played vocab if vocId exists
      const vocId = String(res.game.params.vocId || '');
      if (vocId) {
        try {
          main.gamesManager.registerPendingPlayed(vocId, res.game.params.vocName || null, res.game.params.vocType || null);
        } catch (__) { }
      }

      if (!res.url) {
        if (res.game) res.url = main.gamesManager.generateGameLink(res.game);
        else return alert('❌ Игра не найдена');
      }
      location.href = qual ? addQualParam(res.url) : res.url;
      return;
    }

    // Global mode: validate and possibly retry using GamesManager helper
    if (res.mode === 'global') {
      (async () => {
        const validated = await main.gamesManager.getValidRandomGameId();
        if (!validated) return alert('🔒 Максимальное количество попыток поиска подходящей игры исчерпано. Попробуйте ещё раз.');
        
        // Register pending played vocab if id exists
        if (validated.id) {
          try { main.gamesManager.registerPendingPlayed(validated.id); } catch (__) { }
        }
        
        window.location.href = qual ? addQualParam(validated.url) : validated.url;
      })();
      return;
    }
  };

  // Function to ban current vocabulary (add to BannedVocabPopup)
  async function banCurrentVocabulary() {
    if (getCurrentPage() !== 'game') {
      alert('⚠️ Блокировать словарь можно только на странице игры');
      return false;
    }
    
    const currentVocabId = getSessionVocId();
    if (!currentVocabId) {
      alert('⚠️ Не удалось определить ID текущего словаря');
      return false;
    }

    try {
      // Check if already banned using BannedVocabPopup
      VocabulariesManager.currentListType = 'bannedVocabularies';
      const existing = VocabulariesManager.get();
      const alreadyBanned = existing.some(v => v.id === String(currentVocabId));
      
      if (alreadyBanned) {
        alert(`🛑 Словарь ${currentVocabId} уже в чёрном списке`);
        return false;
      }

      // Fetch vocabulary data
      const basicData = await fetchVocabularyBasicData(currentVocabId).catch(() => null);
      
      // Create vocabulary object with full structure
      const vocabToAdd = {
        id: String(currentVocabId),
        name: basicData?.vocabularyName || null,
        author: basicData?.vocabularyAuthor || null,
        vocType: basicData?.vocabularyType || null,
        isNew: true
      };

      // Add to BannedVocabPopup's enhanced storage
      const updatedList = [...existing, vocabToAdd];
      VocabulariesManager.save(updatedList, false); // prevent save with backup key creation

      alert(`✔️ Словарь ${currentVocabId} добавлен в чёрный список`);
      
      // After banning, immediately start/create a new game
      try {
        startRaceAction();
      } catch (err) {
        console.warn('Could not start a new game after banning vocabulary', err);
      }
      
      return true;
      
    } catch (error) {
      console.error('Error banning vocabulary:', error);
      alert('⚠️ Ошибка при блокировке словаря');
      return false;
    }
  }

  // Function to add current vocabulary into group "Избранные"
  function addCurrentVocabularyToFavorites() {
    if (getCurrentPage() !== 'game') {
      alert('⚠️ Добавлять в Избранные можно только на странице игры');
      return false;
    }
    const currentVocabId = getSessionVocId();
    if (!currentVocabId) {
      alert('⚠️ Не удалось определить ID текущего словаря');
      return false;
    }

    // Find or create the "Избранные" group
    let favGroup = main.groupsManager.groups.find(g => g.title === 'Избранные');
    if (!favGroup) {
      const created = main.groupsManager.createGroup('Избранные');
      main.groupsManager.groups.push(created);
      favGroup = created;
    }

    // Async block: fetch name (best-effort) and delegate creation to helper
    (async () => {
      try {
        let vocName = '';
        let vocType = null;
        const basic = await fetchVocabularyBasicData(currentVocabId).catch(() => null);
        if (basic && basic.vocabularyName) {
          vocName = basic.vocabularyName;
          vocType = basic.vocabularyType || null;
        }

        // Prevent adding if the vocabulary already exists in any group
        const existingGroup = main.groupsManager.groups.find(g => g.games.some(game => String(game.params?.vocId) === String(currentVocabId)));
        if (existingGroup) {
          if (existingGroup.id === favGroup.id) {
            alert(`🛑 Словарь ${currentVocabId} уже в группе "Избранные"`);
          } else {
            alert(`🛑 Словарь ${currentVocabId} уже в группе "${existingGroup.title}"`);
          }
          return;
        }

        // Now pass all 6 args: group, vocId, vocName, vocType, groups, main
        addGameToGroup(favGroup, String(currentVocabId), vocName, vocType, main.groupsManager.groups, main);
        alert(`✔️ Словарь ${currentVocabId} добавлен в группу "Избранные"`);

        // Find the newly added game and show migration popup so user can move it immediately if desired
        const newGame = favGroup.games.find(game => String(game.params?.vocId) === String(currentVocabId));
        if (newGame) {
          const fakeEvent = { clientX: Math.floor(window.innerWidth / 2), clientY: Math.floor(window.innerHeight / 2) };
          try {
            showMigrationPopup(main, main.groupsManager.groups, favGroup.id, fakeEvent, newGame.id);
          } catch (err) {
            console.warn('Could not open migration popup for newly added vocabulary', err);
          }
        }
      } catch (err) {
        console.warn('Could not add vocabulary to favorites group', err);
        alert('⚠️ Не удалось добавить словарь в Избранные');
      }
    })();
  }

  startRaceBtn.onclick = (e) => {
    // Add current vocabulary to favorites
    if (e.altKey && e.shiftKey) {
      e.preventDefault();
      addCurrentVocabularyToFavorites();
      return;
    }
    // Start race in qualification mode
    if (e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      startRaceAction(true);
      return;
    }
    // Regular click to start race in normal mode
    startRaceAction();
  };

  const bannedVocabulariesBtn = createElement('span', {
    className: 'latest-games-ban-vocabulary control-button',
    innerHTML: icons.slash
  });
  createCustomTooltip(
    bannedVocabulariesBtn, `
    [Клик] Показать заблокированные словари
    [Alt + Enter | Alt + Клик] Заблокировать текущий словарь
    `
  );

  // Open banned vocabularies popup when clicking the button
  // Alt+Click: ban current vocabulary
  bannedVocabulariesBtn.onclick = (e) => {
    // Alt+Click: ban current vocabulary
    if (e.altKey) {
      e.preventDefault();
      banCurrentVocabulary();
    // Click: open the banned vocabularies popup
    } else {
      e.stopPropagation();
      VocabulariesManager.toggle(e.clientX, e.clientY, 'bannedVocabularies');
    }
  };

  const playedVocabulariesBtn = createElement('span', {
    className: 'latest-games-played-vocabularies control-button',
    innerHTML: icons.book
  });
  createCustomTooltip(playedVocabulariesBtn, 'Показать проигранные словари');

  playedVocabulariesBtn.onclick = (e) => {
    e.stopPropagation();
    VocabulariesManager.toggle(e.clientX, e.clientY, 'playedVocabularies');
  };

  // Start latest played or random game when pressing Shift+Enter
  // or add current vocabulary to banned list when pressing Alt+Enter
  document.addEventListener('keydown', e => {
    // Alt+Shift+Enter: add current vocabulary to Избранные (higher priority)
    if (e.altKey && e.shiftKey && e.code === 'Enter') {
      e.preventDefault();
      addCurrentVocabularyToFavorites();
      return;
    }
    // Ctrl+Shift+Enter: start race in qualification mode
    if (e.ctrlKey && e.shiftKey && e.code === 'Enter') {
      e.preventDefault();
      startRaceAction(true);
      return;
    }
    // Shift+Enter: start race in normal mode
    if (e.shiftKey && e.code === 'Enter') {
      startRaceAction();
      return;
    }
    // Alt+Enter: ban current vocabulary
    if (e.altKey && e.code === 'Enter') {
      e.preventDefault();
      banCurrentVocabulary();
      return;
    }
  });

  // Add vocabulary data toggle button
  const vocabularyDataBtn = createElement('span', {
    className: 'latest-games-vocabulary-data control-button',
    innerHTML: icons.vocabularyData
  });

  const updateVocabularyDataTooltip = () => {
    createCustomTooltip(
      vocabularyDataBtn,
      main.showVocabularyData
        ? 'Скрыть содержимое словаря'
        : 'Показать содержимое словаря'
    );
    vocabularyDataBtn.classList.toggle('latest-games-disabled', !main.showVocabularyData);
  };

  updateVocabularyDataTooltip();

  vocabularyDataBtn.addEventListener('click', () => {
    main.showVocabularyData = !main.showVocabularyData;
    main.settingsManager.saveSettings();
    updateVocabularyDataTooltip();
    // Refresh the container to update vocabulary data display
    main.uiManager.refreshContainer();
  });

  // Frequently used buttons that should always be visible
  const alwaysVisible = [playBtn, replayBtn, replayMoreBtn, randomRaceBtn, startRaceBtn, bannedVocabulariesBtn, playedVocabulariesBtn];

  // Rarerly used buttons grouped under 'More' panel
  const moreGroup = [
    main.themeManager.createThemeToggle(),
    main.viewManager.createDisplayModeToggle(),
    refreshBtn, resetButton,
    pinAllBtn, unpinAllBtn, sortBtn, importBtn,
    exportBtn, removeAllBtn, removeUnpinnedBtn,
    dragToggleBtn, descToggleBtn, helpToggleBtn,
    searchBtn, vocabularyDataBtn
  ];

  // Create a dedicated 'More' toggle button for accessibility and stable interaction
  const moreToggleBtn = createElement('span', {
    className: 'latest-games-more-toggle control-button',
    innerHTML: icons.moreHorizontal,
  });
  // Append the frequently visible buttons first, then the More toggle at the end
  alwaysVisible.forEach(btn => visibleButtons.appendChild(btn));
  visibleButtons.appendChild(moreToggleBtn);
  // Use the unified tooltip helper for the More toggle as well
  createCustomTooltip(moreToggleBtn, 'Показать дополнительные кнопки');
  moreGroup.forEach(btn => moreButtons.appendChild(btn));

  // Toggle behavior: click to open/close the more panel; close on outside click
  const openMore = () => {
    moreButtons.classList.add('open');
    moreToggleBtn.classList.add('open');
    // prevent immediate document click from closing
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
    }, 0);
  };
  const closeMore = () => {
    moreButtons.classList.remove('open');
    moreToggleBtn.classList.remove('open');
    document.removeEventListener('click', outsideClickHandler);
  };
  const outsideClickHandler = (e) => {
    if (!controlsButtons.contains(e.target)) closeMore();
  };

  moreToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (moreButtons.classList.contains('open')) closeMore(); else openMore();
  });

  return controlsContainer;
}
