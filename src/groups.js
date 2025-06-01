import { generateRandomId } from './utils.js';

export function createGroup(title, existingGroups = []) {
  const trimmedTitle = title || generateDefaultGroupTitle(existingGroups);
  return {
    id: generateUniqueGroupId(existingGroups),
    title: trimmedTitle,
    games: []
  };
}

export function renameGroup(groups, groupId, newTitle) {
  const group = groups.find(g => g.id === groupId);
  if (group) group.title = newTitle;
}

export function removeGroup(groups, groupId) {
  const index = groups.findIndex(g => g.id === groupId);
  if (index !== -1) groups.splice(index, 1);
  return groups;
}

export function getGroups(groups) {
  return groups;
}

export function getCurrentGroup(groups, currentGroupId) {
  return groups.find(g => g.id === currentGroupId) || null;
}

function generateDefaultGroupTitle(existingGroups) {
  const existingNumbers = existingGroups
    .map(group => {
      const match = group.title.match(/^Группа-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(num => !isNaN(num));
  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return `Группа-${maxNumber + 1}`;
}

function generateUniqueGroupId(existingGroups) {
  let id;
  do {
    id = generateRandomId();
  } while (existingGroups.some(group => group.id === id));
  return id;
}