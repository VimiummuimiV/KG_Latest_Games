import { icons } from '../icons.js';
import { createElement } from '../utils.js';
import { createGroup, renameGroup, removeGroup, getCurrentGroup } from '../groups.js';
import { createCustomTooltip } from '../tooltip.js';

export class GroupsManager {
  constructor(main) {
    this.main = main;
    this.groups = [];
    this.currentGroupId = null;
    this.groupViewMode = 'tabs';
  }

  // Initialize groups data
  initializeGroups() {
    if (this.groups.length === 0) {
      const defaultGroup = createGroup('Группа-1');
      this.groups = [defaultGroup];
      this.currentGroupId = defaultGroup.id;
    } else if (!this.currentGroupId || !this.groups.some(g => g.id === this.currentGroupId)) {
      this.currentGroupId = this.groups[0].id;
    }
  }

  // Get current group
  getCurrentGroup() {
    return getCurrentGroup(this.groups, this.currentGroupId);
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
      this.main.refreshContainer();
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

    this.main.saveGameData();
    this.main.refreshContainer();
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
      className: `group-header ${group.id === this.currentGroupId ? 'active' : ''}`,
      textContent: group.title,
      dataset: { groupId: group.id }
    });
    header.addEventListener('click', () => {
      this.selectGroup(group.id);
    });
    return header;
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
    renameButton.addEventListener('click', () => this.renameCurrentGroup());

    const removeButton = createElement('span', {
      className: 'remove-group control-button',
      innerHTML: icons.trashNothing
    });
    createCustomTooltip(removeButton, 'Удалить группу');
    removeButton.addEventListener('click', () => this.removeCurrentGroup());

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
      const tab = createElement('span', {
        className: `group-tab ${group.id === this.currentGroupId ? 'active' : ''}`,
        textContent: group.title,
        dataset: { groupId: group.id }
      });
      tab.addEventListener('click', () => {
        this.selectGroup(group.id);
      });
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
      this.main.saveGameData();
      this.updateActiveGroup();
      this.main.refreshContainer();
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
    const title = prompt('Введите название группы:')?.trim() || null;
    const newGroup = createGroup(title, this.groups);
    this.groups.push(newGroup);
    this.currentGroupId = newGroup.id;
    this.main.saveGameData();
    this.main.refreshContainer();
  }

  // Rename the current group
  renameCurrentGroup() {
    const currentGroup = this.getCurrentGroup();
    const newTitle = prompt('Введите новое название группы:', currentGroup?.title)?.trim();
    if (newTitle) {
      renameGroup(this.groups, this.currentGroupId, newTitle);
      this.main.saveGameData();
      this.main.refreshContainer();
    }
  }

  // Remove the current group
  removeCurrentGroup() {
    if (this.groups.length <= 1) {
      alert('Нельзя удалить последнюю группу.');
      return;
    }
    this.groups = removeGroup(this.groups, this.currentGroupId);
    this.currentGroupId = this.groups[0].id;
    this.main.saveGameData();
    this.main.refreshContainer();
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
            const tab = createElement('span', {
              className: `group-tab ${group.id === this.currentGroupId ? 'active' : ''}`,
              textContent: group.title,
              dataset: { groupId: group.id }
            });
            tab.addEventListener('click', () => this.selectGroup(group.id));
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
    const nameA = generateGameName(a).toLowerCase();
    const nameB = generateGameName(b).toLowerCase();
    const isCyrillicA = this.isCyrillic(nameA[0]);
    const isCyrillicB = this.isCyrillic(nameB[0]);
    if (isCyrillicA && !isCyrillicB) return -1;
    if (!isCyrillicA && isCyrillicB) return 1;
    return nameA.localeCompare(nameB, 'ru');
  }

  // Sort games in current group alphabetically
  sortCurrentGroupGames() {
    const currentGroup = this.getCurrentGroup();
    if (!currentGroup) return;
    const pinnedGames = currentGroup.games.filter(game => game.pin);
    const unpinnedGames = currentGroup.games.filter(game => !game.pin);
    pinnedGames.sort((a, b) => compareGameNames(a, b));
    unpinnedGames.sort((a, b) => compareGameNames(a, b));
    currentGroup.games = [...pinnedGames, ...unpinnedGames];
    this.main.saveGameData();
    this.main.refreshContainer();
  }

  // Get pinned game count for current group
  getPinnedGameCount() {
    const currentGroup = this.getCurrentGroup();
    return currentGroup ? currentGroup.games.filter(game => game.pin).length : 0;
  }

  // Update remove icons based on data
  updateRemoveIcons() {
    // Update the remove group icon inside group controls:
    const currentGroup = this.getCurrentGroup();
    const removeGroupBtn = document.querySelector('.group-controls .remove-group.control-button');
    if (removeGroupBtn) {
      removeGroupBtn.innerHTML =
        currentGroup && currentGroup.games && currentGroup.games.length > 0
          ? icons.trashSomething
          : icons.trashNothing;
    }
  }
}