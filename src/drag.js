let draggedElement = null;
let isDragging = false;
let isRightHalf = false;
let dragDirection = 0;
let lastDragDirection = 0;
let lastPanelDragY = 0;
let dragOffset = { x: 0, y: 0 };
let initialX = 0;
let initialY = 0;
let dragThreshold = 1;
let rotationAccumulator = 0;
let rotationDegreeLimit = 5;
let globalEvents = {};

function isActuallyDragging(e) {
  return (
    Math.abs(e.clientX - initialX) > dragThreshold ||
    Math.abs(e.clientY - initialY) > dragThreshold
  );
}

function getDragBounds(element) {
  const rect = element.getBoundingClientRect();
  const parentRect = element.parentElement.getBoundingClientRect();
  const parentElement = element.parentElement;

  return {
    element: {
      rect: rect,
      width: element.offsetWidth,
      height: element.offsetHeight
    },
    parent: {
      rect: parentRect,
      width: parentElement.offsetWidth,
      height: parentElement.offsetHeight
    }
  };
}

// Helper function to handle element positioning in wrap mode
function handleWrapModePositioning(e, gamesList) {
  const bounds = getDragBounds(draggedElement);

  // Calculate constrained position
  let newLeft = e.clientX - dragOffset.x - bounds.parent.rect.left;
  let newTop = e.clientY - dragOffset.y - bounds.parent.rect.top;
  newLeft = Math.max(0, Math.min(newLeft, bounds.parent.width - bounds.element.width));
  newTop = Math.max(0, Math.min(newTop, bounds.parent.height - bounds.element.height));

  draggedElement.style.left = `${newLeft}px`;
  draggedElement.style.top = `${newTop}px`;

  // Handle element insertion
  const pinnedGames = Array.from(gamesList.querySelectorAll('.pin-game:not(.dragging)'));
  let closestElement = null;
  let minDistance = Infinity;

  pinnedGames.forEach(game => {
    const rect = game.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    if (distance < minDistance) {
      minDistance = distance;
      closestElement = game;
    }
  });

  if (closestElement) {
    const rect = closestElement.getBoundingClientRect();
    const isLeftHalf = e.clientX < rect.left + rect.width / 2;
    if (isLeftHalf) {
      gamesList.insertBefore(draggedElement, closestElement);
    } else {
      gamesList.insertBefore(draggedElement, closestElement.nextSibling);
    }
  }
}

// Helper function to handle element positioning in scroll mode
function handleScrollModePositioning(e, gamesList) {
  const pinnedGames = Array.from(gamesList.querySelectorAll('.pin-game:not(.dragging)'));
  let insertAfter = null;

  for (const pinnedGame of pinnedGames) {
    const rect = pinnedGame.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    if (e.clientY < middle) break;
    insertAfter = pinnedGame;
  }

  if (insertAfter) {
    gamesList.insertBefore(draggedElement, insertAfter.nextSibling);
  } else {
    const firstPinned = gamesList.querySelector('.pin-game:not(.dragging)');
    if (firstPinned) gamesList.insertBefore(draggedElement, firstPinned);
  }
}

export function addDragFunctionality(manager, element) {
  element.addEventListener('mousedown', (e) => {
    // Only allow dragging with left mouse button (LMB)
    if (e.button !== 0) return;
    // Prevent dragging if the target is a button (e.g., pin or delete)
    if (e.target.closest('.latest-game-buttons')) return;

    manager.wasDragging = false;
    initialX = e.clientX;
    initialY = e.clientY;
    isDragging = true;
    draggedElement = element;

    const bounds = getDragBounds(element);
    const clickX = e.clientX - bounds.element.rect.left;
    isRightHalf = clickX > bounds.element.rect.width / 2;
    lastPanelDragY = e.clientY;
    // Calculate the offset from the top-left corner of the element
    dragOffset = {
      x: e.clientX - bounds.element.rect.left,
      y: e.clientY - bounds.element.rect.top
    };
    this.parentRect = bounds.parent.rect;

    globalEvents.handleDragMove = handleDragMove.bind(this);
    globalEvents.handleDragEnd = handleDragEnd.bind(this);
    document.addEventListener('mousemove', globalEvents.handleDragMove);
    document.addEventListener('mouseup', globalEvents.handleDragEnd);
  });
}

function handleDragMove(e) {
  if (!isDragging || !draggedElement) return;

  if (!this.wasDragging && isActuallyDragging(e)) {
    this.wasDragging = true;
    draggedElement.classList.add('dragging');
    if (this.getDisplayMode() === 'wrap') {
      const bounds = getDragBounds(draggedElement);
      draggedElement.style.position = 'absolute';
      draggedElement.style.left = `${bounds.element.rect.left - bounds.parent.rect.left}px`;
      draggedElement.style.top = `${bounds.element.rect.top - bounds.parent.rect.top}px`;
      draggedElement.style.width = `${bounds.element.rect.width}px`;
    }
  }

  e.preventDefault();

  const displayMode = this.getDisplayMode();
  const gamesList = document.getElementById('latest-games');

  if (displayMode === 'scroll') {
    handleScrollModePositioning(e, gamesList);
  } else {
    handleWrapModePositioning(e, gamesList);
  }

  // Handle rotation
  const currentY = e.clientY;
  const deltaY = currentY - lastPanelDragY;
  lastPanelDragY = currentY;
  if (deltaY !== 0) {
    const sensitivity = 0.2;
    rotationAccumulator = (rotationAccumulator || 0) + (isRightHalf ? deltaY : -deltaY) * sensitivity;
    rotationAccumulator = Math.max(-rotationDegreeLimit, Math.min(rotationDegreeLimit, rotationAccumulator));
    draggedElement.style.transform = `rotate(${rotationAccumulator}deg)`;
  }
}

function handleDragEnd() {
  if (!isDragging || !draggedElement) return;

  isDragging = false;
  draggedElement.classList.remove('dragging');

  const displayMode = this.getDisplayMode();
  if (displayMode === 'wrap') {
    draggedElement.style.position = '';
    draggedElement.style.left = '';
    draggedElement.style.top = '';
    draggedElement.style.width = '';
  }
  draggedElement.style.transform = '';

  this.updateGameOrderFromDOM();

  draggedElement = null;
  dragDirection = 0;
  lastPanelDragY = 0;

  if (globalEvents) {
    document.removeEventListener('mousemove', globalEvents.handleDragMove);
    document.removeEventListener('mouseup', globalEvents.handleDragEnd);
  }
}