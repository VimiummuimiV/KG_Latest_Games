import { createPopup } from "./menuPopup.js";
import { createCustomTooltip } from "./tooltip.js";
import { typeMapping } from "./definitions.js";

const vocabularyTypes = Object.entries(typeMapping).map(([russian, english]) => ({ label: russian, key: english }));

// Parse and normalize IDs from localStorage (handles both string and object formats)
const parseIds = (raw) => {
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.map(item => 
    String(typeof item === 'object' && item?.id ? item.id : item)
  ) : [];
};

/**
 * Get vocabulary counts for a specific type
 * @param {object} main - The main manager instance
 * @param {string} typeKey - The type key (e.g., 'words', 'phrases')
 * @returns {object} Object with total, played, and remained counts
 */
function getVocabularyCounts(main, typeKey) {
  try {
    // Remained = vocabularies still available to play (already filtered by SettingsManager)
    const remained = (main.validVocabularies?.[typeKey] || []).length;
    
    // Get played and banned IDs from localStorage
    const playedSet = new Set(parseIds(localStorage.getItem('playedVocabularies')));
    const bannedSet = new Set(parseIds(localStorage.getItem('bannedVocabularies')));
    
    // Get original vocabularies for this type (before filtering)
    const validVocabs = JSON.parse(localStorage.getItem('validVocabularies') || '{}');
    
    // Count played vocabularies for this type (exclude banned)
    const played = (validVocabs[typeKey] || []).filter(id => 
      playedSet.has(String(id)) && !bannedSet.has(String(id))
    ).length;
    
    return { total: played + remained, played, remained };
  } catch (error) {
    console.warn('Error calculating vocabulary counts:', error);
    return { total: 0, played: 0, remained: 0 };
  }
}

/**
 * Get status class based on remained count (only when type is active)
 * @param {number} remained - Number of remaining vocabularies
 * @param {number} total - Total number of vocabularies
 * @param {boolean} isActive - Whether this type is currently active
 * @returns {string} Status class ('danger', 'warning', or empty string)
 */
function getStatusClass(remained, total, isActive) {
  if (!isActive || total === 0) return '';
  if (remained === 0) return ' danger';
  if (remained <= 10) return ' warning';
  return '';
}

/**
 * Toggle the vocabulary type setting and update button classes
 */
function toggleType(button, typeKey, main) {
  if (!(button instanceof HTMLElement)) return;
  
  const currentState = main.randomVocabulariesType[typeKey];
  const newState = !currentState;
  main.randomVocabulariesType[typeKey] = newState;
  
  // Remove all state classes first
  button.classList.remove('active', 'warning', 'danger');
  
  // Add appropriate classes based on new state
  if (newState) {
    button.classList.add('active');
    
    // Get counts to determine status class
    const counts = getVocabularyCounts(main, typeKey);
    const statusClass = getStatusClass(counts.remained, counts.total, true).trim();
    if (statusClass) {
      button.classList.add(statusClass);
    }
  }
  
  main.settingsManager.saveSettings();
}

/**
 * Show a popup to toggle vocabulary types with tooltips showing counts
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {object} main - The main manager instance
 * @returns {HTMLElement} The created popup element
 */
export function showVocabularyTypesPopup(event, main) {
  // Create button configurations with counts for each type
  const buttonConfigs = vocabularyTypes.map(({ label, key }) => {
    const counts = getVocabularyCounts(main, key);
    const isActive = main.randomVocabulariesType[key];
    const statusClass = getStatusClass(counts.remained, counts.total, isActive);
    
    return {
      text: label,
      className: `group-tab${isActive ? ' active' : ''}${statusClass}`,
      onClick: (button) => toggleType(button, key, main),
      counts
    };
  });

  // Create popup with persistent mode
  const popup = createPopup(buttonConfigs, event, 'vocabulary-types-popup', 'Тип', true);
  
  // Add tooltips to each button showing total/played/remained counts
  popup.querySelectorAll('.group-tab').forEach((button, i) => {
    const { total, played, remained } = buttonConfigs[i].counts;
    createCustomTooltip(button, `[Всего:]${total} [Проиграно:]${played} [Осталось:]${remained}`, 'stats');
  });
  
  return popup;
}