import { createPopup } from "./menuPopup.js";
import { typeMapping } from "./definitions.js";

// Invert typeMapping to get English keys from Russian labels for button text
const vocabularyTypes = Object.entries(typeMapping).map(([russian, english]) => ({ label: russian, key: english }));

/**
 * Toggle the vocabulary type setting and update button class
 * @param {HTMLElement} button - The button element
 * @param {string} typeKey - The English key for the type (e.g., 'words')
 * @param {object} main - The main manager instance
 */
function toggleType(button, typeKey, main) {
  if (!(button instanceof HTMLElement)) {
    console.error('toggleType: button is not an HTMLElement', button);
    return;
  }
  const currentState = main.randomVocabulariesType[typeKey];
  main.randomVocabulariesType[typeKey] = !currentState;
  button.classList.toggle('active', !currentState);
  main.settingsManager.saveSettings();
}

/**
 * Show a popup to toggle vocabulary types.
 * @param {MouseEvent} event - The mouse event for positioning
 * @param {object} main - The main manager instance
 * @returns {HTMLElement} The created popup element
 */
export function showVocabularyTypesPopup(event, main) {
  // Create button configurations for each vocabulary type
  const buttonConfigs = vocabularyTypes.map(({ label, key }) => {
    const isActive = main.randomVocabulariesType[key];
    return {
      text: label,
      className: `group-tab${isActive ? ' active' : ''}`,
      onClick: (button) => {
        // Pass the button element explicitly to toggleType
        toggleType(button, key, main);
      }
    };
  });

  // Create and return the popup with header "Тип" and persistent option
  return createPopup(buttonConfigs, event, 'vocabulary-types-popup', 'Тип', true);
}