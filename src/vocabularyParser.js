import { getCurrentPage } from "./utils";

// Function to fetch and parse vocabulary content from a URL
export async function fetchVocabularyContent(vocId) {
  try {
    const response = await fetch(`https://klavogonki.ru/vocs/${vocId}/`);
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // Find the <div class="words"> element
    const wordsDiv = doc.querySelector('.words');
    if (!wordsDiv) {
      console.warn(`No element with class "words" found for vocId ${vocId}`);
      return 'Vocabulary content not found';
    }
    
    // Extract all table rows with text content
    const rows = wordsDiv.querySelectorAll('tr');
    if (rows.length === 0) {
      console.warn(`No table rows found for vocId ${vocId}`);
      return 'No words available';
    }
    
    // Build the text, handling both numbered and non-numbered formats
    const vocabularyText = Array.from(rows)
      .map((row, index) => {
        const numElement = row.querySelector('td.num');
        const textElement = row.querySelector('td.text');
        
        // Skip rows without text content
        if (!textElement) {
          return null;
        }
        
        // Convert <br> tags to newlines and get text content
        const textWithBreaks = textElement.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]*>/g, '') // Remove any other HTML tags
          .trim();
        
        // Skip empty rows or placeholder rows
        if (textWithBreaks === '' || textWithBreaks === '…') {
          return null;
        }
        
        // Handle numbered format
        if (numElement) {
          const num = numElement.textContent.trim();
          
          // Skip empty or placeholder numbers
          if (num === '' || num === '…') {
            return null;
          }
          
          return `${num}. ${textWithBreaks}`;
        } else {
          // Handle non-numbered format - add sequential numbering
          return `${index + 1}. ${textWithBreaks}`;
        }
      })
      .filter(item => item !== null)
      .join('\n\n');
    
    return vocabularyText;
  } catch (error) {
    console.error(`Error fetching vocabulary content for vocId ${vocId}:`, error);
    return 'Error loading vocabulary';
  }
}

// Tooltip management
let currentTooltip = null;
let hideTimeout = null;
let showTimeout = null;
let currentAnchor = null;

function createVocabularyTooltip(content) {
  const tooltip = document.createElement('div');
  tooltip.className = 'vocabulary-tooltip-popup';
  
  // Process content to wrap numbers in spans
  const processedContent = content.replace(/^(\d+)\.\s/gm, '<span class="tooltip-number">$1.</span> ');
  tooltip.innerHTML = processedContent;
  
  document.body.appendChild(tooltip);
  return tooltip;
}

export function showTooltip(anchor, content) {
  // Clear any existing timeouts
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }
  
  // If tooltip already exists for same anchor, just keep it visible
  if (currentTooltip && currentAnchor === anchor) {
    return;
  }
  
  // Remove existing tooltip if different anchor
  if (currentTooltip) {
    hideTooltip();
  }
  
  // If no anchor is provided, show immediately and center the tooltip
  if (!anchor) {
    currentAnchor = null;
    currentTooltip = createVocabularyTooltip(content);
    positionTooltip(null, currentTooltip);
    currentTooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });
    currentTooltip.addEventListener('mouseleave', () => {
      startHideTimeout();
    });
    return;
  }

  // Set up delayed show for anchored tooltips
  showTimeout = setTimeout(() => {
    currentAnchor = anchor;
    currentTooltip = createVocabularyTooltip(content);

    // Position and show tooltip
    positionTooltip(anchor, currentTooltip);

    // Add event listeners to tooltip for hover behavior
    currentTooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    currentTooltip.addEventListener('mouseleave', () => {
      startHideTimeout();
    });

    showTimeout = null;
  }, 400); // 400ms delay before showing
}

export function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    currentAnchor = null;
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }
}

export function startHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  // If the tooltip is currently hovered, do not schedule hiding.
  try {
    if (currentTooltip && currentTooltip.matches(':hover')) return;
  } catch (_) {}

  hideTimeout = setTimeout(() => {
    hideTooltip();
  }, 300); // 300ms delay before hiding
}

/**
 * Read transient sessionStorage flag set before navigation and return vocId if present.
 * Returns string ID or null.
 */
export function getSessionVocId() {
  try {
    // First, prefer the currently-visible vocabulary link in the page status area.
  const anchor = document.querySelector('#status #gamedesc a, #status a[href*="/vocs/"]');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const m = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (m && m[1]) {
        // Always prefer the anchor's id when present on the page.
        return String(m[1]);
      }
    }

    // Fallback: read transient sessionStorage flag set before navigation
    const raw = sessionStorage.getItem('latestGames_showVocTooltip');
    if (!raw) return null;
    const parsed = JSON.parse(raw) || {};
    return parsed.vocId || null;
  } catch (err) {
    console.warn('Could not determine session voc id:', err);
    return null;
  }
}

function positionTooltip(anchor, tooltip) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 10;

  // Get tooltip dimensions
  const tooltipRect = tooltip.getBoundingClientRect();

  let left, top;

  // If anchor is not provided, center the tooltip
  if (!anchor) {
    left = Math.max(margin, Math.floor((viewportWidth - tooltipRect.width) / 2));
    top = Math.max(margin, Math.floor((viewportHeight - tooltipRect.height) / 2));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  left = anchorRect.left;
  top = anchorRect.bottom + 5;
  
  // Adjust horizontal position to stay within viewport
  if (left + tooltipRect.width > viewportWidth - margin) {
    left = viewportWidth - tooltipRect.width - margin;
  }
  if (left < margin) {
    left = margin;
  }
  
  // Adjust vertical position to stay within viewport
  if (top + tooltipRect.height > viewportHeight - margin) {
    // Try positioning above the anchor
    const topAbove = anchorRect.top - tooltipRect.height - 5;
    if (topAbove >= margin) {
      top = topAbove;
    } else {
      // If it doesn't fit above either, position at top of viewport
      top = margin;
    }
  }
  
  // Ensure tooltip doesn't go above viewport
  if (top < margin) {
    top = margin;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Function to attach the delegated event listener
export function attachVocabularyParser() {
  const voclist = document.querySelector('.columns.voclist');
  if (!voclist) {
    console.warn('Element with class "columns voclist" not found.');
    return;
  }
  
  voclist.addEventListener('mouseenter', async (e) => {
    if (!e.shiftKey) return; // Only trigger on Shift + mouseenter
    const anchor = e.target.closest('a.name[href*="/vocs/"]');
    if (anchor) {
      // Extract vocId from href (e.g., /vocs/1885/)
      const href = anchor.getAttribute('href');
      const match = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (!match) {
        console.warn(`Invalid vocabulary href: ${href}`);
        return;
      }
      
      const vocId = match[1];
      
      // Check if tooltip content is already cached
      if (!anchor._tooltipContent) {
        // First parse the text, then display
        fetchVocabularyContent(vocId).then(content => {
          // Cache the content
          anchor._tooltipContent = content;
          // Show tooltip with parsed content
          showTooltip(anchor, content);
        });
      } else {
        // Use cached content
        showTooltip(anchor, anchor._tooltipContent);
      }
    }
  }, { capture: true });
  
  voclist.addEventListener('mouseleave', (e) => {
    const anchor = e.target.closest('a.name[href*="/vocs/"]');
    if (anchor && currentAnchor === anchor) {
      startHideTimeout();
    }
    // Also cancel show timeout if mouse leaves before tooltip appears
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
  }, { capture: true });
}

// If a transient sessionStorage flag was set before navigation, show the
// parsed vocabulary centered and auto-hide after 5 seconds.
async function showSessionTooltip() {
  // Read randomGameId from localStorage (for logging/context)
  let randomGameId;
  try {
    const settings = JSON.parse(localStorage.getItem('latestGamesSettings') || '{}');
    randomGameId = settings.randomGameId;
  } catch (error) {
    console.warn('Could not read randomGameId from localStorage:', error);
    randomGameId = undefined;
  }

  // Show vocabulary preview (tooltip) on game page for any played vocab (global or local)
  if (getCurrentPage() !== 'game') return;

  try {
    const vocId = getSessionVocId();
    if (!vocId) return;

    // Ensure there's an anchor with /vocs/ in #gamedesc (voc game only)
    const gameDescAnchor = document.querySelector('#gamedesc a[href*="/vocs/"]');
    if (!gameDescAnchor) {
      console.log('Skipping tooltip: No vocabulary anchor found in #gamedesc');
      return; // Not a voc game, skip
    }

    const content = await fetchVocabularyContent(vocId);
    try {
      showTooltip(null, content);
      // After 5s, trigger the regular hide logic (which will respect hover).
      setTimeout(() => { try { startHideTimeout(); } catch (_) {} }, 5000);
    } catch (_) {}
  } catch (_) {}
} showSessionTooltip();
