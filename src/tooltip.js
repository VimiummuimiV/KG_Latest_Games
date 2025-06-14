let tooltipEl = null, tooltipHideTimer = null, tooltipShowTimer = null;
let tooltipIsVisible = false, tooltipIsShown = false, tooltipCurrentTarget = null;

const positionTooltip = (clientX, clientY) => {
  if (!tooltipEl) return;
  let leftPos = clientX + 10;
  const tooltipWidth = tooltipEl.offsetWidth;
  const screenWidth = window.innerWidth;

  // Adjust position if overflowing
  leftPos = Math.min(Math.max(leftPos, 10), screenWidth - tooltipWidth - 10);

  tooltipEl.style.left = `${leftPos}px`;
  tooltipEl.style.top = `${clientY + 18}px`;
};

const tooltipTrackMouse = e => tooltipEl && positionTooltip(e.clientX, e.clientY);

export function hideTooltipElement() {
  tooltipIsVisible = false;
  tooltipCurrentTarget = null;
  clearTimeout(tooltipShowTimer);
  clearTimeout(tooltipHideTimer);

  tooltipHideTimer = setTimeout(() => {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = '0';
    tooltipIsShown = false;

    setTimeout(() => {
      if (!tooltipIsVisible && tooltipEl) {
        tooltipEl.style.display = 'none';
        tooltipEl.textContent = ''; // Clear tooltip content
        document.removeEventListener('mousemove', tooltipTrackMouse);
      }
    }, 50);
  }, 100);
}

new MutationObserver(() => {
  if (tooltipCurrentTarget && !document.contains(tooltipCurrentTarget)) hideTooltipElement();
}).observe(document, { childList: true, subtree: true });

export function createCustomTooltip(element, tooltipContent) {
  if (tooltipContent == null) return; // Skip if content is null/undefined

  // Always update the tooltip content stored on the element.
  element._tooltipContent = tooltipContent;

  if (!element._tooltipInitialized) {
    element._tooltipInitialized = true;

    tooltipEl ||= (() => {
      const tooltipDiv = document.createElement('div');
      tooltipDiv.classList.add("custom-tooltip-popup");
      tooltipDiv.style.display = 'none';
      tooltipDiv.style.opacity = '0';
      document.body.appendChild(tooltipDiv);
      return tooltipDiv;
    })();

    element.addEventListener('mouseenter', e => {
      tooltipIsVisible = true;
      tooltipCurrentTarget = element;
      clearTimeout(tooltipHideTimer);
      clearTimeout(tooltipShowTimer);

      // Highlight [Action]Message pairs and headers in the tooltip content
      tooltipEl.innerHTML = highlightTooltipActions(element._tooltipContent);
      tooltipEl.style.display = 'flex';
      tooltipEl.style.opacity = '0';
      tooltipEl.offsetHeight;
      positionTooltip(e.clientX, e.clientY);
      document.addEventListener('mousemove', tooltipTrackMouse);

      tooltipShowTimer = setTimeout(() => {
        tooltipEl.style.opacity = '1';
        tooltipIsShown = true;
      }, 600);
    });

    element.addEventListener('mouseleave', () => {
      hideTooltipElement();
      document.removeEventListener('mousemove', tooltipTrackMouse);
    });
    element.addEventListener('click', hideTooltipElement);
  }
}

/**
 * Update tooltip content for an existing element
 * @param {HTMLElement} element - The element with tooltip
 * @param {string} newContent - New tooltip content
 */
export function updateTooltipContent(element, newContent) {
  if (!element._tooltipInitialized) {
    // If tooltip wasn't initialized, create it
    createCustomTooltip(element, newContent);
    return;
  }
  
  // Update the stored content
  element._tooltipContent = newContent;
  
  // If this element is currently being hovered (even if tooltip isn't fully shown yet)
  if (tooltipCurrentTarget === element && tooltipIsVisible && tooltipEl) {
    tooltipEl.innerHTML = highlightTooltipActions(newContent);
    
    // If tooltip is not yet shown, show it immediately
    if (!tooltipIsShown) {
      clearTimeout(tooltipShowTimer);
      tooltipEl.style.opacity = '1';
      tooltipIsShown = true;
    }
    
    // Reposition tooltip in case content size changed
    const rect = element.getBoundingClientRect();
    positionTooltip(rect.left + rect.width / 2, rect.bottom);
  }
}

function highlightTooltipActions(str) {
  let result = '';
  const headerRegex = /(## [^[]*)/g;          // Matches headers like "## Header"
  const actionRegex = /\[([^\]]+)\]([^\[]*)/g; // Matches [Action]Message pairs

  // Split on headers, keep headers in the array
  const parts = str.split(headerRegex);

  parts.forEach(part => {
    if (part.startsWith('## ')) {
      // Header
      const header = part.slice(3).trim();
      result += `<div class="tooltip-header">${header}</div>`;
    } else {
      // Try to pull out any [Action]Message pairs
      actionRegex.lastIndex = 0;
      const matches = [...part.matchAll(actionRegex)];

      if (matches.length) {
        // Emit each pair
        matches.forEach(match => {
          const action = match[1];
          const message = match[2].trim();
          result += `
            <div class="tooltip-item">
              <span class="tooltip-action">${action}&nbsp;</span>
              <span class="tooltip-message">${message}</span>
            </div>`;
        });
      } else if (part.trim()) {
        // No pairs: emit the raw text as a single message
        result += `
          <div class="tooltip-item">
            <span class="tooltip-message">${part.trim()}</span>
          </div>`;
      }
    }
  });

  return result;
}


