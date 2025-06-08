let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let dragDirection = 0;
let lastDragDirection = 0;
let initialX = 0;
let initialY = 0;
let dragThreshold = 1;

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
  const bounds = this.getDragBounds(this.draggedElement);

  // Calculate constrained position
  let newLeft = e.clientX - this.dragOffset.x - bounds.parent.rect.left;
  let newTop = e.clientY - this.dragOffset.y - bounds.parent.rect.top;
  newLeft = Math.max(0, Math.min(newLeft, bounds.parent.width - bounds.element.width));
  newTop = Math.max(0, Math.min(newTop, bounds.parent.height - bounds.element.height));

  this.draggedElement.style.left = `${newLeft}px`;
  this.draggedElement.style.top = `${newTop}px`;

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
      gamesList.insertBefore(this.draggedElement, closestElement);
    } else {
      gamesList.insertBefore(this.draggedElement, closestElement.nextSibling);
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
    gamesList.insertBefore(this.draggedElement, insertAfter.nextSibling);
  } else {
    const firstPinned = gamesList.querySelector('.pin-game:not(.dragging)');
    if (firstPinned) gamesList.insertBefore(this.draggedElement, firstPinned);
  }
}

function addDragFunctionality(element) {
  element.addEventListener('mousedown', (e) => {
    // Only allow dragging with left mouse button (LMB)
    if (e.button !== 0) return;
    // Prevent dragging if the target is a button (e.g., pin or delete)
    if (e.target.closest('.latest-game-buttons')) return;

    this.wasDragging = false;
    this.initialX = e.clientX;
    this.initialY = e.clientY;
    this.isDragging = true;
    this.draggedElement = element;

    const bounds = this.getDragBounds(element);
    const clickX = e.clientX - bounds.element.rect.left;
    this.isRightHalf = clickX > bounds.element.rect.width / 2;
    this.lastPanelDragY = e.clientY;
    // Calculate the offset from the top-left corner of the element
    this.dragOffset = {
      x: e.clientX - bounds.element.rect.left,
      y: e.clientY - bounds.element.rect.top
    };
    this.parentRect = bounds.parent.rect;

    this.globalEvents.handleDragMove = this.handleDragMove.bind(this);
    this.globalEvents.handleDragEnd = this.handleDragEnd.bind(this);
    document.addEventListener('mousemove', this.globalEvents.handleDragMove);
    document.addEventListener('mouseup', this.globalEvents.handleDragEnd);
  });
}

function handleDragMove(e) {
  if (!this.isDragging || !this.draggedElement) return;

  if (!this.wasDragging && this.isActuallyDragging(e)) {
    this.wasDragging = true;
    this.draggedElement.classList.add('dragging');
    if (this.getDisplayMode() === 'wrap') {
      const bounds = this.getDragBounds(this.draggedElement);
      this.draggedElement.style.position = 'absolute';
      this.draggedElement.style.left = `${bounds.element.rect.left - bounds.parent.rect.left}px`;
      this.draggedElement.style.top = `${bounds.element.rect.top - bounds.parent.rect.top}px`;
      this.draggedElement.style.width = `${bounds.element.rect.width}px`;
    }
  }

  e.preventDefault();

  const displayMode = this.getDisplayMode();
  const gamesList = document.getElementById('latest-games');

  if (displayMode === 'scroll') {
    this.handleScrollModePositioning(e, gamesList);
  } else {
    this.handleWrapModePositioning(e, gamesList);
  }

  // Handle rotation
  const currentY = e.clientY;
  const deltaY = currentY - this.lastPanelDragY;
  this.lastPanelDragY = currentY;
  if (deltaY !== 0) {
    const sensitivity = 0.2;
    this.rotationAccumulator = (this.rotationAccumulator || 0) + (this.isRightHalf ? deltaY : -deltaY) * sensitivity;
    this.rotationAccumulator = Math.max(-this.rotationDegreeLimit, Math.min(this.rotationDegreeLimit, this.rotationAccumulator));
    this.draggedElement.style.transform = `rotate(${this.rotationAccumulator}deg)`;
  }
}

function handleDragEnd() {
  if (!this.isDragging || !this.draggedElement) return;

  this.isDragging = false;
  this.draggedElement.classList.remove('dragging');

  const displayMode = this.getDisplayMode();
  if (displayMode === 'wrap') {
    this.draggedElement.style.position = '';
    this.draggedElement.style.left = '';
    this.draggedElement.style.top = '';
    this.draggedElement.style.width = '';
  }
  this.draggedElement.style.transform = '';

  this.updateGameOrderFromDOM();

  this.draggedElement = null;
  this.dragDirection = 0;
  this.lastPanelDragY = 0;

  if (this.globalEvents) {
    document.removeEventListener('mousemove', this.globalEvents.handleDragMove);
    document.removeEventListener('mouseup', this.globalEvents.handleDragEnd);
  }
}