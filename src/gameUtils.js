import { createElement } from './utils.js';
import { gameTypes, visibilities, ranks, ranksMap } from './definitions.js';
import { icons } from './icons.js';

export function parseGameParams(span, descText) {
  const gameType = span.className.split('-').pop();
  const vocName = gameType === 'voc' ? span.textContent.replace(/[«»]/g, '') : '';

  let vocId = '';
  if (gameType === 'voc') {
    const vocLink = span.querySelector('a');
    if (vocLink) {
      const match = vocLink.href.match(/vocs\/(\d+)/);
      vocId = match ? parseInt(match[1], 10) : '';
    }
  }

  let type = 'normal';
  if (/одиночный/.test(descText)) {
    type = 'practice';
  } else if (/друзьями/.test(descText)) {
    type = 'private';
  }

  let levelFrom = 1;
  let levelTo = 9;
  const levelMatches = descText.match(/для (\S+)–(\S+),/);
  if (levelMatches) {
    levelFrom = ranksMap[levelMatches[1]] || 1;
    levelTo = ranksMap[levelMatches[2]] || 9;
  }

  const timeoutMatches = descText.match(/таймаут\s(\d+)\s(сек|мин)/);
  const timeout = timeoutMatches
    ? (timeoutMatches[2] === 'сек' ? parseInt(timeoutMatches[1], 10) : parseInt(timeoutMatches[1], 10) * 60)
    : 60;

  const qualification = /квалификация/.test(descText) ? 1 : 0;

  return {
    gametype: gameType,
    vocName,
    vocId,
    type,
    level_from: levelFrom,
    level_to: levelTo,
    timeout,
    qual: qualification,
    premium_abra: 0
  };
}

export function generateGameName(game) {
  const gameType = gameTypes[game.params.gametype];
  const { vocName, timeout, type: visibility, level_from, level_to, qual } = game.params;

  const nameSpan = createElement('span', {
    className: `latest-game-name gametype-${game.params.gametype}`,
    textContent: vocName === '' ? gameType : `«${vocName}»`
  });

  const descSpan = createElement('span', {
    className: 'latest-game-description'
  });

  const qualSpan = createElement('span', {
    className: 'latest-game-qual',
    innerHTML: qual ? icons.qualification : ''
  });

  let levelText = '';
  if (level_from !== 1 || level_to !== 9) {
    const levelFromName = ranks[level_from - 1];
    const levelToName = ranks[level_to - 1];
    levelText = ` ${levelFromName} - ${levelToName}`;
  }

  const levelsSpan = createElement('span', {
    className: 'latest-game-levels',
    textContent: levelText
  });

  descSpan.textContent = `${visibilities[visibility]}, ${timeout} сек.`;
  descSpan.appendChild(qualSpan);
  if (levelText) {
    descSpan.appendChild(levelsSpan);
  }

  const container = createElement('div');
  container.appendChild(nameSpan);
  container.appendChild(descSpan);

  return container.innerHTML;
}

export function generateGameLink(game) {
  const { gametype, vocId, type, level_from, level_to, timeout, qual } = game.params;

  const params = new URLSearchParams({
    gametype,
    type,
    level_from: level_from.toString(),
    level_to: level_to.toString(),
    timeout: timeout.toString(),
    submit: '1'
  });

  if (vocId !== '') {
    params.set('voc', vocId);
  }

  if (qual) {
    params.set('qual', '1');
  }

  return `${location.protocol}//klavogonki.ru/create/?${params.toString()}`;
}