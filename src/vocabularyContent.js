import { getCurrentPage, detectGameType } from "./utils";

// Tooltip management
let currentTooltip = null;
let hideTimeout = null;
let showTimeout = null;
let currentAnchor = null;

// Function to fetch and parse vocabulary data (content + metadata) from a URL
export async function fetchVocabularyData(vocId) {
  try {
    const response = await fetch(`https://klavogonki.ru/vocs/${vocId}/`);
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // Extract content
    let content = 'Данные отсутствуют';
    const wordsDiv = doc.querySelector('.words');
    if (wordsDiv) {
      const rows = wordsDiv.querySelectorAll('tr');
      if (rows.length > 0) {
        content = Array.from(rows)
          .map((row, index) => {
            const numElement = row.querySelector('td.num');
            const textElement = row.querySelector('td.text');
            if (!textElement) return null;
            
            const textWithBreaks = textElement.innerHTML
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .trim();
            
            if (textWithBreaks === '' || textWithBreaks === '…') return null;
            
            if (numElement) {
              const num = numElement.textContent.trim();
              if (num === '' || num === '…') return null;
              return `${num}. ${textWithBreaks}`;
            } else {
              return `${index + 1}. ${textWithBreaks}`;
            }
          })
          .filter(item => item !== null)
          .join('\n\n');
      }
    }
    
    // Extract metadata
    const metadata = {};
    
    // Title
    const titleElement = doc.querySelector('.user-title .title');
    if (titleElement) {
      const titleText = Array.from(titleElement.childNodes)
        .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      metadata.title = titleText ? titleText.textContent.trim() : 'Без названия';
    }
    
    // Rating (out of 10)
    const ratingElement = doc.querySelector('.rating_stars');
    if (ratingElement) {
      const match = ratingElement.className.match(/rating_stars(\d+)/);
      if (match) metadata.rating = parseInt(match[1]);
    }
    
    // Rating count and users count
    const ratingCountElement = doc.querySelector('#rating_cnt');
    if (ratingCountElement) metadata.ratingCount = ratingCountElement.textContent.trim();
    
    const favCountElement = doc.querySelector('#fav_cnt');
    if (favCountElement) metadata.usersCount = favCountElement.textContent.trim();
    
    // Author info
    const authorElement = doc.querySelector('.user-content dl dd[style*="background"]');
    if (authorElement) {
      const authorLink = authorElement.querySelector('a');
      if (authorLink) {
        metadata.authorName = authorLink.textContent.trim();
        const hrefMatch = authorLink.getAttribute('href').match(/\/profile\/(\d+)/);
        if (hrefMatch) metadata.authorId = hrefMatch[1];
      }
      
      // Extract avatar from style or construct from ID
      const styleAttr = authorElement.getAttribute('style');
      if (styleAttr) {
        const avatarMatch = styleAttr.match(/url\s*\(\s*['"&quot;]*([^'")\s]+)['"&quot;]*\s*\)/);
        metadata.authorAvatar = avatarMatch ? avatarMatch[1].replace(/&quot;/g, '') : 
          (metadata.authorId ? `/storage/avatars/${metadata.authorId}_big.png` : null);
      }
    }
    
    // Other metadata
    const userContentDls = doc.querySelectorAll('.user-content dl');
    for (const dl of userContentDls) {
      const dt = dl.querySelector('dt');
      const dd = dl.querySelector('dd');
      if (!dt || !dd) continue;
      
      const dtText = dt.textContent;
      if (dtText.includes('Создан:')) {
        const dateText = Array.from(dd.childNodes)
          .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (dateText) metadata.createdDate = dateText.textContent.trim();
        const versionNote = dd.querySelector('.note');
        if (versionNote) metadata.versionDate = versionNote.textContent.trim();
      } else if (dtText.includes('Тип словаря:')) {
        metadata.vocabularyType = dd.textContent.trim().split('\n')[0].trim();
      } else if (dtText.includes('Описание:')) {
        metadata.description = dd.textContent.trim();
      } else if (dtText.includes('Содержание:')) {
        metadata.contentStats = dd.textContent.trim().split('\n')[0].trim();
      }
    }
    
    return { content, metadata };
  } catch (error) {
    console.error(`Error fetching vocabulary data for vocId ${vocId}:`, error);
    return { content: 'Ошибка загрузки словаря', metadata: null };
  }
}

function createVocabularyTooltip(content, metadata) {
  const tooltip = document.createElement('div');
  tooltip.className = 'vocabulary-tooltip-popup';
  
  // Handle case where content might be an object
  let actualContent = content;
  let actualMetadata = metadata;
  
  if (content && typeof content === 'object' && 'content' in content) {
    actualContent = content.content;
    actualMetadata = content.metadata || metadata;
  }
  
  actualContent = String(actualContent || 'Данные отсутствуют');
  
  // Helper function for Russian plural form of "человек"
  const getPersonForm = (number) => {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return 'человек';
    if (n1 > 1 && n1 < 5) return 'человека';
    return 'человек';
  };
  
  let html = '';
  
  if (actualMetadata) {
    html += '<div class="tooltip-header">';
    
    // Author with avatar
    if (actualMetadata.authorAvatar && actualMetadata.authorName) {
      html += `<div class="tooltip-author">
        <img src="${actualMetadata.authorAvatar}" alt="${actualMetadata.authorName}" class="tooltip-avatar">
        <span class="tooltip-author-name">${actualMetadata.authorName}</span>
      </div>`;
    }
    
    // Title
    if (actualMetadata.title) {
      html += `<div class="tooltip-title">${actualMetadata.title}</div>`;
    }
    
    // Rating (convert from 10-point to 5-star scale)
    if (actualMetadata.rating !== undefined) {
      const rating = actualMetadata.rating / 2;
      const percentage = (rating / 5) * 100;
      
      html += `<div class="tooltip-rating">
        <div class="stars-container">
          <div class="stars-bg">⭐️⭐️⭐️⭐️⭐️</div>
          <div class="stars-filled" style="width: ${percentage}%">⭐️⭐️⭐️⭐️⭐️</div>
        </div>`;
      if (actualMetadata.ratingCount) html += ` <span class="rating-count">(${actualMetadata.ratingCount})</span>`;
      html += '</div>';
    }
    
    // Users count with correct plural form
    if (actualMetadata.usersCount) {
      const count = parseInt(actualMetadata.usersCount);
      const personForm = getPersonForm(count);
      html += `<div class="tooltip-users">Использует ${actualMetadata.usersCount} ${personForm}</div>`;
    }
    
    // Type and description
    if (actualMetadata.vocabularyType) {
      html += `<div class="tooltip-type"><strong>Тип:</strong> ${actualMetadata.vocabularyType}</div>`;
    }
    if (actualMetadata.description) {
      html += `<div class="tooltip-description">${actualMetadata.description}</div>`;
    }
    
    html += '</div><div class="tooltip-divider"></div>';
  }
  
  // Content with numbered lines
  html += '<div class="tooltip-content">';
  html += actualContent.replace(/^(\d+)\.\s/gm, '<span class="tooltip-number">$1.</span> ');
  html += '</div>';
  
  tooltip.innerHTML = html;
  document.body.appendChild(tooltip);
  return tooltip;
}

export function showTooltip(anchor, content, metadata = null) {
  if (hideTimeout) clearTimeout(hideTimeout);
  if (showTimeout) clearTimeout(showTimeout);
  
  if (currentTooltip && currentAnchor === anchor) return;
  if (currentTooltip) hideTooltip();
  
  // Center tooltip if no anchor
  if (!anchor) {
    currentAnchor = null;
    currentTooltip = createVocabularyTooltip(content, metadata);
    positionTooltip(null, currentTooltip);
    currentTooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    });
    currentTooltip.addEventListener('mouseleave', startHideTimeout);
    return;
  }

  // Delayed show for anchored tooltips
  showTimeout = setTimeout(() => {
    currentAnchor = anchor;
    currentTooltip = createVocabularyTooltip(content, metadata);
    positionTooltip(anchor, currentTooltip);
    
    currentTooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) clearTimeout(hideTimeout);
    });
    currentTooltip.addEventListener('mouseleave', startHideTimeout);
  }, 400);
}

export function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    currentAnchor = null;
  }
  if (hideTimeout) clearTimeout(hideTimeout);
  if (showTimeout) clearTimeout(showTimeout);
}

export function startHideTimeout() {
  if (hideTimeout) clearTimeout(hideTimeout);
  try {
    if (currentTooltip && currentTooltip.matches(':hover')) return;
  } catch (_) {}

  hideTimeout = setTimeout(hideTooltip, 300);
}

export function getSessionVocId() {
  try {
    const anchor = document.querySelector('#status #gamedesc a, #status a[href*="/vocs/"]');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const m = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (m && m[1]) return String(m[1]);
    }

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
  const tooltipRect = tooltip.getBoundingClientRect();

  let left, top;

  if (!anchor) {
    left = Math.max(margin, Math.floor((viewportWidth - tooltipRect.width) / 2));
    top = Math.max(margin, Math.floor((viewportHeight - tooltipRect.height) / 2));
  } else {
    const anchorRect = anchor.getBoundingClientRect();
    left = anchorRect.left;
    top = anchorRect.bottom + 5;
    
    if (left + tooltipRect.width > viewportWidth - margin) {
      left = viewportWidth - tooltipRect.width - margin;
    }
    if (left < margin) left = margin;
    
    if (top + tooltipRect.height > viewportHeight - margin) {
      const topAbove = anchorRect.top - tooltipRect.height - 5;
      top = topAbove >= margin ? topAbove : margin;
    }
    if (top < margin) top = margin;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function attachVocabularyParser() {
  const selectors = ['.columns.voclist', '#gamelist', '#gamedesc'];
  const containers = selectors.map(sel => document.querySelector(sel)).filter(c => c);

  if (containers.length === 0) {
    console.warn('No supported containers found.');
    return;
  }

  const mouseenterHandler = async (e) => {
    if (!e.shiftKey) return;
    const anchor = e.target.closest('a[href*="/vocs/"]');
    if (anchor) {
      const href = anchor.getAttribute('href');
      const match = href.match(/\/vocs\/(\d+)(?:\/|$)/);
      if (!match) {
        console.warn(`Invalid vocabulary href: ${href}`);
        return;
      }
      
      const vocId = match[1];
      
      if (!anchor._tooltipData) {
        const data = await fetchVocabularyData(vocId);
        anchor._tooltipData = data;
        showTooltip(anchor, data.content, data.metadata);
      } else {
        showTooltip(anchor, anchor._tooltipData.content, anchor._tooltipData.metadata);
      }
    }
  };

  const mouseleaveHandler = (e) => {
    const anchor = e.target.closest('a[href*="/vocs/"]');
    if (anchor && currentAnchor === anchor) startHideTimeout();
    if (showTimeout) clearTimeout(showTimeout);
  };

  containers.forEach(container => {
    container.addEventListener('mouseenter', mouseenterHandler, { capture: true });
    container.addEventListener('mouseleave', mouseleaveHandler, { capture: true });
  });
}

async function showSessionTooltip() {
  await new Promise(resolve => setTimeout(resolve, 500));
  if (getCurrentPage() !== 'game') return;
  try {
    const vocId = getSessionVocId();
    if (!vocId) return;
    if (detectGameType().category !== 'vocabulary') return;
    
    const data = await fetchVocabularyData(vocId);
    showTooltip(null, data.content, data.metadata);
    setTimeout(() => { try { startHideTimeout(); } catch (_) {} }, 5000);
  } catch (_) {}
} 
showSessionTooltip();