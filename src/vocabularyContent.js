import { getCurrentPage, detectGameType, isVocabularyRemoved } from "./utils";

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
    if (isVocabularyRemoved(response, htmlText)) {
      return { removed: true, content: 'Словарь не найден', metadata: null };
    }
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
    
    // Author info — find the <dl> whose <dt> is 'Автор:' using direct children,
    // then extract the profile link from its <dd> regardless of whether an avatar is present.
    for (const dl of doc.querySelectorAll('.user-content dl')) {
      const dt = dl.children[0]?.tagName === 'DT' ? dl.children[0] : null;
      const dd = Array.from(dl.children).find(el => el.tagName === 'DD') ?? null;
      if (!dt || !dd) continue;
      if (dt.textContent.trim() !== 'Автор:') continue;

      const authorLink = dd.querySelector('a[href^="/profile/"]');
      if (authorLink) {
        metadata.authorName = authorLink.textContent.trim();
        const hrefMatch = authorLink.getAttribute('href').match(/\/profile\/(\d+)/);
        if (hrefMatch) metadata.authorId = hrefMatch[1];
      }

      // Avatar: only set when explicitly present as a background-image on the <dd>.
      const styleAttr = dd.getAttribute('style') || '';
      const avatarMatch = styleAttr.match(/url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
      metadata.authorAvatar = avatarMatch ? avatarMatch[1].replace(/&quot;/g, '') : null;
      break;
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
      } else if (dtText.includes('Публичный:')) {
        metadata.isPublic = dd.textContent.trim();
      } else if (dtText.includes('Описание:')) {
        metadata.description = dd.textContent.trim();
      } else if (dtText.includes('Содержание:')) {
        metadata.contentStats = dd.textContent.trim().split('\n')[0].trim();
      }
    }
    
    metadata.vocId = vocId;

    // Sanitize a single DOM node to safe HTML, preserving images, links and formatting
    const INLINE_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'U', 'S']);
    const sanitizeNode = n => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent;
      if (n.nodeName === 'BR') return '<br>';
      if (n.nodeName === 'IMG') return `<img src="${n.getAttribute('src') || ''}" class="tooltip-comment-img">`;
      if (n.nodeName === 'A') {
        const href = n.getAttribute('href') || '';
        return `<a href="${href}" target="_blank" rel="noopener">${n.textContent}</a>`;
      }
      if (INLINE_TAGS.has(n.nodeName)) {
        const tag = n.nodeName.toLowerCase();
        return `<${tag}>${Array.from(n.childNodes).map(sanitizeNode).join('')}</${tag}>`;
      }
      if (n.classList?.contains('hidemain')) {
        const cont = n.querySelector('.hidecont');
        const inner = cont ? Array.from(cont.childNodes).map(sanitizeNode).join('') : '';
        return `<details class="tooltip-spoiler"><summary>Скрытый текст</summary><div class="tooltip-spoiler-body">${inner}</div></details>`;
      }
      if (n.classList?.contains('hidetop')) return '';
      if (n.classList?.contains('quotetop')) {
        return `<div class="tooltip-quote-label">${n.textContent.trim()}</div>`;
      }
      if (n.classList?.contains('quotemain')) {
        return `<div class="tooltip-quote">${Array.from(n.childNodes).map(sanitizeNode).join('')}</div>`;
      }
      return Array.from(n.childNodes).map(sanitizeNode).join('');
    };

    // Extract comments
    metadata.comments = Array.from(doc.querySelectorAll('.comment')).reduce((acc, el) => {
      const infoEl = el.querySelector('.info');
      const authorEl = infoEl?.querySelector('.author .name');
      const text = Array.from(el.childNodes)
        .filter(n => n !== infoEl)
        .map(sanitizeNode)
        .join('')
        .replace(/(<br>\s*){2,}/gi, '<br>')
        .trim();
      if (!text) return acc;
      const avatarMatch = (infoEl?.getAttribute('style') || '').match(/url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
      acc.push({
        author:   authorEl?.textContent.trim() ?? null,
        authorId: authorEl?.getAttribute('href')?.match(/\/profile\/(\d+)/)?.[1] ?? null,
        avatar:   avatarMatch ? avatarMatch[1].replace(/&quot;/g, '') : null,
        date:     infoEl?.querySelector('.date')?.textContent.trim() ?? null,
        text,
      });
      return acc;
    }, []);

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
  
  const s = str => str.replace(/>\s+</g, '><').trim();

  const comments = actualMetadata?.comments ?? [];

  const headerBody = actualMetadata ? s(
    (actualMetadata.authorName
      ? `<div class="tooltip-author">` +
        (actualMetadata.authorAvatar ? `<img src="${actualMetadata.authorAvatar}" class="tooltip-avatar">` : '') +
        (actualMetadata.authorId
          ? `<a class="tooltip-author-name" href="/profile/${actualMetadata.authorId}" target="_blank" rel="noopener">${actualMetadata.authorName}</a>`
          : `<span class="tooltip-author-name">${actualMetadata.authorName}</span>`) +
        `</div>`
      : '') +
    (actualMetadata.title
      ? `<div class="tooltip-title">${actualMetadata.title}</div>`
      : '') +
    (actualMetadata.rating !== undefined
      ? `<div class="tooltip-rating">` +
        `<div class="stars-container">` +
        `<div class="stars-bg">⭐️⭐️⭐️⭐️⭐️</div>` +
        `<div class="stars-filled" style="width: ${(actualMetadata.rating / 2 / 5) * 100}%">⭐️⭐️⭐️⭐️⭐️</div>` +
        `</div>` +
        (actualMetadata.ratingCount ? `<span class="rating-count">(${actualMetadata.ratingCount})</span>` : '') +
        `</div>`
      : '') +
    (actualMetadata.usersCount
      ? `<div class="tooltip-users">Использует ${actualMetadata.usersCount} ${getPersonForm(parseInt(actualMetadata.usersCount))}</div>`
      : '') +
    (actualMetadata.vocabularyType
      ? `<div class="tooltip-meta tooltip-type">Тип: ${actualMetadata.vocabularyType}</div>`
      : '') +
    (actualMetadata.isPublic !== undefined
      ? `<div class="tooltip-meta tooltip-public">Публичный: ${actualMetadata.isPublic}</div>`
      : '') +
    (actualMetadata.createdDate
      ? `<div class="tooltip-meta tooltip-created">Создан: ${actualMetadata.createdDate}` +
        (actualMetadata.versionDate ? `<span class="tooltip-version">${actualMetadata.versionDate}</span>` : '') +
        `</div>`
      : '') +
    (actualMetadata.description
      ? `<div class="tooltip-description">${actualMetadata.description}</div>`
      : '')
  ) : '';

  const contentBody = s(
    (headerBody ? `<div class="tooltip-header">${headerBody}</div><div class="tooltip-divider"></div>` : '') +
    `<div class="tooltip-content">` +
    actualContent.replace(/^(\d+)\.\s/gm, '<span class="tooltip-number">$1.</span> ') +
    `</div>`
  );

  if (!comments.length) {
    tooltip.innerHTML = contentBody;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  const commentsBody = comments.map(c => s(
    `<div class="tooltip-comment">` +
    `<div class="tooltip-comment-meta">` +
    (c.avatar ? `<img src="${c.avatar}" class="tooltip-avatar tooltip-comment-avatar">` : '') +
    (c.author ? `<a class="tooltip-comment-author" href="/profile/${c.authorId ?? ''}" target="_blank">${c.author}</a>` : '') +
    (c.date   ? `<span class="tooltip-comment-date">${c.date}</span>` : '') +
    `</div>` +
    `<div class="tooltip-comment-text">${c.text}</div>` +
    `</div>`
  )).join('');

  const allCommentsLink = actualMetadata?.vocId
    ? `<a class="tooltip-comments-all" href="https://klavogonki.ru/vocs/${actualMetadata.vocId}/comments/" target="_blank">Все комментарии</a>`
    : '';

  tooltip.innerHTML = s(
    `<div class="tooltip-tabs">` +
    `<button class="tooltip-tab active" data-tab="content">Содержание</button>` +
    `<button class="tooltip-tab" data-tab="comments">Комментарии${comments.length ? `<span class="tooltip-tab-count">${comments.length}</span>` : ''}</button>` +
    `</div>` +
    `<div class="tooltip-body">` +
    `<div class="tooltip-pane tooltip-pane--content">${contentBody}</div>` +
    `<div class="tooltip-pane tooltip-pane--comments">` +
    `<div class="tooltip-comments-list">${commentsBody}</div>` +
    allCommentsLink +
    `</div></div>`
  );

  tooltip.querySelectorAll('.tooltip-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tooltip.querySelectorAll('.tooltip-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tooltip.dataset.activeTab = btn.dataset.tab;
    });
  });

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
  // Fetch settings directly from localStorage
  const storedSettings = localStorage.getItem('latestGamesSettings');
  const settings = storedSettings ? JSON.parse(storedSettings) : {};
  
  if (!settings.showVocabularyData) return;
  
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
