import { icons } from '../icons.js';
import { createElement, generateUniqueId } from '../utils.js';
import { createCustomTooltip } from '../tooltip.js';

export class GroupsManager {
  constructor(main) {
    this.main = main;
    this.groups = [];
    this.currentGroupId = null;
    this.groupViewMode = 'tabs';
  }

  createGroup(title) {
    let groupTitle;
    if (title && title.trim()) {
      groupTitle = title.trim();
    } else {
      let counter = 1;
      let candidate;
      do {
        candidate = `Группа-${counter++}`;
      } while (this.groups.some(g => g.title === candidate));
      groupTitle = candidate;
    }
    return {
      id: generateUniqueId(this.groups),
      title: groupTitle,
      games: []
    };
  }

  // Rename group by ID (replaces renameGroup from groups.js)
  renameGroup(groupId, newTitle) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) group.title = newTitle;
  }

  // Remove group by ID (replaces removeGroup from groups.js)
  removeGroup(groupId) {
    const index = this.groups.findIndex(g => g.id === groupId);
    if (index !== -1) this.groups.splice(index, 1);
    return this.groups;
  }

  // Initialize groups data (uses createGroup for default group)
  initializeGroups() {
    if (this.groups.length === 0) {
      const defaultGroup = this.createGroup();
      this.groups = [defaultGroup];
      this.currentGroupId = defaultGroup.id;
    } else if (!this.currentGroupId || !this.groups.some(g => g.id === this.currentGroupId)) {
      this.currentGroupId = this.groups[0].id;
    }
  }

  getCurrentGroup() {
    return this.groups.find(g => g.id === this.currentGroupId) || null;
  }

  // Set groups data
  setGroups(groups, currentGroupId) {
    this.groups = groups;
    this.currentGroupId = currentGroupId;
  }

  // Set group view mode
  setGroupViewMode(mode) {
    this.groupViewMode = mode;
  }

  // Get group view mode
  getGroupViewMode() {
    return this.groupViewMode;
  }

  // Create group view toggle button
  createGroupViewToggle() {
    const toggleButton = createElement('div', {
      className: 'group-view-toggle control-button'
    });
    toggleButton.innerHTML = this.groupViewMode === 'tabs' ? icons.wrap : icons.scroll;
    createCustomTooltip(toggleButton, this.groupViewMode === 'tabs'
      ? 'Переключить в единый вид со всеми играми'
      : 'Переключить в режим вкладок по группам');

    toggleButton.addEventListener('click', () => {
      this.groupViewMode = this.groupViewMode === 'tabs' ? 'unified' : 'tabs';
      this.main.settingsManager.saveSettings();
      this.updateGroupViewToggle(toggleButton);
      this.main.uiManager.refreshContainer();
    });
    return toggleButton;
  }

  // Update group view toggle button
  updateGroupViewToggle(toggleButton) {
    toggleButton.innerHTML = this.groupViewMode === 'tabs' ? icons.wrap : icons.scroll;
    createCustomTooltip(toggleButton, this.groupViewMode === 'tabs'
      ? 'Переключить в единый вид со всеми играми'
      : 'Переключить в режим вкладок по группам');
  }

  // Move group in specified direction
  moveGroup(direction) {
    const currentIndex = this.groups.findIndex(group => group.id === this.currentGroupId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= this.groups.length) return;

    const temp = this.groups[currentIndex];
    this.groups[currentIndex] = this.groups[newIndex];
    this.groups[newIndex] = temp;

    this.main.gamesManager.saveGameData();
    this.main.uiManager.refreshContainer();
  }

  // Update group control states (enable/disable move buttons)
  updateGroupControlStates() {
    const moveLeftButton = document.querySelector('.move-group-left');
    const moveRightButton = document.querySelector('.move-group-right');
    if (moveLeftButton && moveRightButton) {
      const currentIndex = this.groups.findIndex(group => group.id === this.currentGroupId);
      const isFirst = currentIndex === 0;
      const isLast = currentIndex === this.groups.length - 1;
      moveLeftButton.classList.toggle('latest-games-disabled', isFirst);
      moveRightButton.classList.toggle('latest-games-disabled', isLast);
    }
  }

  // Create group header (used in unified view)
  createGroupHeader(group) {
    const header = createElement('div', {
      className: this.getGroupClass(group, 'group-header'),
      textContent: group.title,
      dataset: { groupId: group.id }
    });
    header.addEventListener('click', () => this.selectGroup(group.id));
    return header;
  }

  // Helper to create a group tab element
  createGroupTab(group) {
    const tab = createElement('span', {
      className: this.getGroupClass(group, 'group-tab'),
      textContent: group.title,
      dataset: { groupId: group.id }
    });
    tab.addEventListener('click', () => this.selectGroup(group.id));
    return tab;
  }

  // Helper to get group class string for tab/header
  getGroupClass(group, baseClass = '') {
    const isActive = group.id === this.currentGroupId;
    const previousGameId = this.main.gamesManager.latestGamesData?.previousGameId;
    const hasPreviousGame = group.games.some(game => game.id === previousGameId);
    return `${baseClass}${isActive ? ' active' : ''}${hasPreviousGame && !isActive ? ' previous-game-group' : ''}`.trim();
  }

  // Create the entire groups container with controls and tabs
  createGroupsContainer() {
    const groupsContainer = createElement('div', { id: 'latest-games-groups' });

    // Create group controls (persistent across both view modes)
    const groupControls = createElement('div', {
      className: 'group-controls' + (this.groupViewMode === 'unified' ? ' unified-controls' : '')
    });

    const addButton = createElement('span', {
      className: 'add-group control-button',
      innerHTML: icons.addGroup
    });
    createCustomTooltip(addButton, 'Добавить группу');
    addButton.addEventListener('click', () => this.addGroup());

    const renameButton = createElement('span', {
      className: 'rename-group control-button',
      innerHTML: icons.renameGroup
    });
    createCustomTooltip(renameButton, 'Переименовать группу');
    renameButton.addEventListener('click', () => this.renameActiveGroup());

    const removeButton = createElement('span', {
      className: 'remove-group control-button',
      innerHTML: icons.trashNothing
    });
    createCustomTooltip(removeButton, `
      [Клик] Удалить группу и сделать предыдущую активной
      [Shift + Клик] Удалить группу и сделать следующую активной
    `);
    removeButton.addEventListener('click', (e) => this.removeActiveGroup(e));

    const groupViewToggle = this.createGroupViewToggle();

    const moveLeftButton = createElement('span', {
      className: 'move-group-left control-button',
      innerHTML: icons.decrease
    });
    createCustomTooltip(moveLeftButton, 'Переместить вкладку назад');
    moveLeftButton.addEventListener('click', () => {
      if (!moveLeftButton.classList.contains('latest-games-disabled')) {
        this.moveGroup(-1);
      }
    });

    const moveRightButton = createElement('span', {
      className: 'move-group-right control-button',
      innerHTML: icons.increase
    });
    createCustomTooltip(moveRightButton, 'Переместить вкладку вперёд');
    moveRightButton.addEventListener('click', () => {
      if (!moveRightButton.classList.contains('latest-games-disabled')) {
        this.moveGroup(1);
      }
    });

    groupControls.append(addButton, renameButton, removeButton, groupViewToggle, moveLeftButton, moveRightButton);

    groupsContainer.appendChild(groupControls);

    // Create tabs-container for group tabs only
    const tabsContainer = createElement('div', { className: 'tabs-container' });
    this.groups.forEach(group => {
      const tab = this.createGroupTab(group);
      tabsContainer.appendChild(tab);
    });

    // Hide tabs-container in unified view
    if (this.groupViewMode === 'unified') {
      tabsContainer.classList.add('latest-games-hidden');
    }

    groupsContainer.appendChild(tabsContainer);
    return groupsContainer;
  }

  // Select a group by ID
  selectGroup(id) {
    if (this.groups.some(group => group.id === id)) {
      this.currentGroupId = id;
      this.main.gamesManager.saveGameData();
      this.updateActiveGroup();
      this.main.uiManager.refreshContainer();
    }
  }

  // Update active group visual states
  updateActiveGroup() {
    // Update group headers (only present in unified mode)
    document.querySelectorAll('.group-header').forEach(header =>
      header.classList.toggle('active', header.dataset.groupId === this.currentGroupId)
    );
    // Update tabs (present in both modes, but hidden in unified)
    document.querySelectorAll('.group-tab').forEach(tab =>
      tab.classList.toggle('active', tab.dataset.groupId === this.currentGroupId)
    );
  }

  // Add a new group
  addGroup() {
    const title = prompt('Введите название группы:');
    if (title === null) return; // User cancelled prompt
    const newGroup = this.createGroup(title?.trim() || null);
    this.groups.push(newGroup);
    this.currentGroupId = newGroup.id;
    this.main.gamesManager.saveGameData();
    this.main.uiManager.refreshContainer();
  }

  // Rename the active group
  renameActiveGroup() {
    const activeGroup = this.getCurrentGroup();
    const newTitle = prompt('Введите новое название группы:', activeGroup?.title)?.trim();
    if (newTitle) {
      this.renameGroup(this.currentGroupId, newTitle);
      this.main.gamesManager.saveGameData();
      this.main.uiManager.refreshContainer();
    }
  }

  // Remove the active group
  removeActiveGroup(event) {
    if (this.groups.length <= 1) {
      alert('Нельзя удалить последнюю группу.');
      return;
    }
    const currentIdx = this.groups.findIndex(g => g.id === this.currentGroupId);
    this.removeGroup(this.currentGroupId);
    let newIdx;
    // Make next group active
    if (event && event.shiftKey) {
      newIdx = currentIdx >= this.groups.length ? this.groups.length - 1 : currentIdx;
      // make previous group active
    } else {
      newIdx = currentIdx - 1;
      if (newIdx < 0) newIdx = 0;
    }
    this.currentGroupId = this.groups[newIdx].id;
    this.main.gamesManager.saveGameData();
    this.main.uiManager.refreshContainer();
  }

  // Refresh groups container in the DOM
  refreshGroupsContainer() {
    const groupsContainer = document.getElementById('latest-games-groups');
    if (groupsContainer) {
      // Update groupControls class based on view mode
      const groupControls = groupsContainer.querySelector('.group-controls');
      if (groupControls) {
        groupControls.className = 'group-controls' + (this.groupViewMode === 'unified' ? ' unified-controls' : '');
      }

      // Update tabs-container
      const tabsContainer = groupsContainer.querySelector('.tabs-container');
      if (tabsContainer) {
        tabsContainer.innerHTML = ''; // Clear existing tabs
        if (this.groupViewMode === 'tabs') {
          // Populate tabs and show tabs-container
          this.groups.forEach(group => {
            const tab = this.createGroupTab(group);
            tabsContainer.appendChild(tab);
          });
          tabsContainer.classList.remove('latest-games-hidden');
        } else {
          // Hide tabs-container in unified mode
          tabsContainer.classList.add('latest-games-hidden');
        }
      }
    }
    this.updateGroupControlStates();
  }

  isCyrillic(char) {
    const code = char.charCodeAt(0);
    return (code >= 1040 && code <= 1103) || code === 1025 || code === 1105;
  }

  compareGameNames(a, b) {
    const nameA = this.main.gamesManager.generateGameName(a).toLowerCase();
    const nameB = this.main.gamesManager.generateGameName(b).toLowerCase();
    const isCyrillicA = this.isCyrillic(nameA[0]);
    const isCyrillicB = this.isCyrillic(nameB[0]);
    if (isCyrillicA && !isCyrillicB) return -1;
    if (!isCyrillicA && isCyrillicB) return 1;
    return nameA.localeCompare(nameB, 'ru');
  }

  // Sort games in active group alphabetically
  sortActiveGroupGames() {
    const activeGroup = this.getCurrentGroup();
    if (!activeGroup) return;
    const pinnedGames = activeGroup.games.filter(game => game.pin);
    const unpinnedGames = activeGroup.games.filter(game => !game.pin);
    pinnedGames.sort((a, b) => this.compareGameNames(a, b));
    unpinnedGames.sort((a, b) => this.compareGameNames(a, b));
    activeGroup.games = [...pinnedGames, ...unpinnedGames];
    this.main.gamesManager.saveGameData();
    this.main.uiManager.refreshContainer();
  }

  // Get pinned game count for active group
  getPinnedGameCount() {
    const activeGroup = this.getCurrentGroup();
    return activeGroup ? activeGroup.games.filter(game => game.pin).length : 0;
  }
}