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
 * Toggle the vocabulary type setting and update button class
 */
function toggleType(button, typeKey, main) {
  if (!(button instanceof HTMLElement)) return;
  const currentState = main.randomVocabulariesType[typeKey];
  main.randomVocabulariesType[typeKey] = !currentState;
  button.classList.toggle('active', !currentState);
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
    const hasNoRemaining = counts.remained === 0 && counts.total > 0;
    
    return {
      text: label,
      className: `group-tab${main.randomVocabulariesType[key] ? ' active' : ''}${hasNoRemaining ? ' no-remaining' : ''}`,
      onClick: (button) => toggleType(button, key, main),
      counts
    };
  });

  // Create popup with persistent mode
  const popup = createPopup(buttonConfigs, event, 'vocabulary-types-popup', 'Тип', true);
  
  // Add tooltips to each button showing total/played/remained counts
  popup.querySelectorAll('.group-tab').forEach((button, i) => {
    const { total, played, remained } = buttonConfigs[i].counts;
    createCustomTooltip(button, `[Total:]${total} [Played:]${played} [Remained:]${remained}`, 'stats');
  });
  
  return popup;
}