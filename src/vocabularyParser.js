// Function to fetch and parse vocabulary content from a URL
async function fetchVocabularyContent(vocId) {
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

function showTooltip(anchor, content) {
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
  
  // Set up delayed show
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

function startHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  hideTimeout = setTimeout(() => {
    hideTooltip();
  }, 300); // 300ms delay before hiding
}

function positionTooltip(anchor, tooltip) {
  const anchorRect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 10;
  
  // Get tooltip dimensions
  const tooltipRect = tooltip.getBoundingClientRect();
  
  let left = anchorRect.left;
  let top = anchorRect.bottom + 5;
  
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
