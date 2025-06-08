export function generateRandomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => (b % 36).toString(36))
    .join('');
}

export function hideTooltip() {
  const existingTooltip = document.querySelector('.custom-tooltip-popup');
  // Set display none for existing tooltip to avoid conflicts
  if (existingTooltip) existingTooltip.style.display = 'none';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);

  if (options.className) {
    element.className = options.className;
  }

  if (options.id) {
    element.id = options.id;
  }

  if (options.innerHTML) {
    element.innerHTML = options.innerHTML;
  }

  if (options.textContent) {
    element.textContent = options.textContent;
  }

  if (options.href) {
    element.href = options.href;
  }

  if (options.title) {
    element.title = options.title;
  }

  if (options.src) {
    element.src = options.src;
  }

  if (options.style) {
    Object.assign(element.style, options.style);
  }

  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  return element;
}