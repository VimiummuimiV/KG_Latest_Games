import { createElement } from '../../utils.js';
import { createCustomTooltip } from '../../tooltip.js';
import { icons } from '../../icons.js';
import { toggleSearchBox } from './search.js';

export function createControls(main) {
  const controlsContainer = createElement('div', { className: 'latest-games-controls' });

  const controlsLimiter = createElement('div', { className: 'controls-limiter' });
  const controlsButtons = createElement('div', { className: 'controls-buttons' });
  controlsContainer.append(controlsLimiter, controlsButtons);

  // Create the options section with buttons to adjust game count
  const options = createElement('span', { id: 'latest-games-options' });
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
  const updateTooltip = (button, isEnabled, enabledText, disabledText, delay, delayText) => {
    createCustomTooltip(button, `
      [Клик] ${isEnabled ? enabledText : disabledText}
      [Shift + Клик] ${delayText + (delay ? ` (${delay} мс)` : '')}
    `);
  };

  const setupControlButton = (button, context, property, delayProperty, texts) => {
    const { enabledText, disabledText, delayText, delayPromptText, delayErrorText } = texts;
    const isInitiallyEnabled = context[property];
    button.classList.toggle('latest-games-disabled', !isInitiallyEnabled);
    updateTooltip(button, isInitiallyEnabled, enabledText, disabledText, context[delayProperty], delayText);

    button.onclick = (e) => {
      if (e.shiftKey) {
        const newDelay = prompt(delayPromptText, "");
        if (newDelay !== null) {
          const delayValue = parseInt(newDelay, 10);
          if (!isNaN(delayValue) && delayValue >= 0) {
            context[delayProperty] = delayValue;
            main.settingsManager.saveSettings();
            updateTooltip(button, context[property], enabledText, disabledText, delayValue, delayText);
          } else {
            alert(delayErrorText);
          }
        }
      } else {
        context[property] = !context[property];
        main.settingsManager.saveSettings();
        button.classList.toggle('latest-games-disabled', !context[property]);
        updateTooltip(button, context[property], enabledText, disabledText, context[delayProperty], delayText);
      }
    };
  };

  const playBtn = createElement('span', {
    className: 'latest-games-play control-button',
    innerHTML: icons.play
  });
  setupControlButton(playBtn, main, 'shouldStart', 'startDelay', {
    enabledText: 'Отключить автозапуск игры',
    disabledText: 'Включить автозапуск игры',
    delayText: 'Изменить задержку запуска в миллисекундах',
    delayPromptText: 'Введите задержку запуска в миллисекундах:',
    delayErrorText: 'Пожалуйста, введите корректное значение задержки запуска.'
  });

  const replayBtn = createElement('span', {
    className: 'latest-games-replay control-button',
    innerHTML: icons.replay
  });
  setupControlButton(replayBtn, main, 'shouldReplay', 'replayDelay', {
    enabledText: 'Отключить автоповтор игры',
    disabledText: 'Включить автоповтор игры',
    delayText: 'Изменить задержку автоповтора в миллисекундах',
    delayPromptText: 'Введите задержку автоповтора в миллисекундах:',
    delayErrorText: 'Пожалуйста, введите корректное значение задержки автоповтора.'
  });

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

  const sortBtn = createElement('span', {
    className: 'latest-games-sort control-button',
    innerHTML: icons.sort
  });
  createCustomTooltip(sortBtn, 'Сортировать игры в текущей группе по алфавиту');
  sortBtn.addEventListener('click', () => main.groupsManager.sortActiveGroupGames());

  const importBtn = createElement('span', {
    className: 'latest-games-import control-button',
    innerHTML: icons.import
  });
  createCustomTooltip(importBtn, 'Импортировать настройки из JSON файла');
  importBtn.onclick = () => main.settingsManager.importSettings(main);

  const exportBtn = createElement('span', {
    className: 'latest-games-export control-button',
    innerHTML: icons.export
  });
  createCustomTooltip(exportBtn, 'Экспортировать все настройки в JSON файл');
  exportBtn.onclick = () => main.settingsManager.exportSettings(main);

  const removeAllBtn = createElement('span', {
    className: 'latest-games-removeall control-button',
    innerHTML: icons.trashNothing
  });
  createCustomTooltip(removeAllBtn, 'Удалить все настройки');
  removeAllBtn.onclick = () => main.settingsManager.removeAllSettings(main);

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

  // Toggle for button descriptions
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

  controlsLimiter.appendChild(options);
  controlsButtons.append(
    main.themeManager.createThemeToggle(),
    main.viewManager.createDisplayModeToggle(),
    playBtn, replayBtn, pinAllBtn, unpinAllBtn, sortBtn, importBtn, exportBtn, removeAllBtn, removeUnpinnedBtn, dragToggleBtn, descToggleBtn
  );

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
  controlsButtons.appendChild(searchBtn);

  return controlsContainer;
}