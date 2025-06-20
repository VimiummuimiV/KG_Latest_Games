const dragState = {
  draggedElement: null,
  isDragging: false,
  isRightHalf: false,
  dragDirection: 0,
  lastDragDirection: 0,
  lastPanelDragY: 0,
  dragOffset: { x: 0, y: 0 },
  initialX: 0,
  initialY: 0,
  dragThreshold: 1,
  rotationAccumulator: 0,
  rotationDegreeLimit: 5,
  globalEvents: {},

  // Reset method to clean up state
  reset() {
    this.draggedElement = null;
    this.isDragging = false;
    this.isRightHalf = false;
    this.dragDirection = 0;
    this.lastDragDirection = 0;
    this.lastPanelDragY = 0;
    this.dragOffset = { x: 0, y: 0 };
    this.initialX = 0;
    this.initialY = 0;
    this.rotationAccumulator = 0;
    // Clear event references
    this.globalEvents = {};
  },

  // Add cleanup method
  cleanup() {
    if (this.globalEvents.handleDragMove) {
      document.removeEventListener('mousemove', this.globalEvents.handleDragMove);
    }
    if (this.globalEvents.handleDragEnd) {
      document.removeEventListener('mouseup', this.globalEvents.handleDragEnd);
    }
    this.globalEvents = {};
  }
};

function isActuallyDragging(e) {
  return (
    Math.abs(e.clientX - dragState.initialX) > dragState.dragThreshold ||
    Math.abs(e.clientY - dragState.initialY) > dragState.dragThreshold
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

// --- Drop indicator management ---
let dropIndicator = null;
function addDropIndicator() {
  if (!dropIndicator) {
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    dropIndicator.style.position = 'relative';
  }
  return dropIndicator;
}

function removeDropIndicator() {
  if (dropIndicator && dropIndicator.parentNode) {
    dropIndicator.parentNode.removeChild(dropIndicator);
  }
}

// Helper function to handle element positioning in wrap mode
function handleWrapModePositioning(e, gamesList) {
  const bounds = getDragBounds(dragState.draggedElement);

  // Calculate constrained position
  let newLeft = e.clientX - dragState.dragOffset.x - bounds.parent.rect.left;
  let newTop = e.clientY - dragState.dragOffset.y - bounds.parent.rect.top;
  newLeft = Math.max(0, Math.min(newLeft, bounds.parent.width - bounds.element.width));
  newTop = Math.max(0, Math.min(newTop, bounds.parent.height - bounds.element.height));

  dragState.draggedElement.style.left = `${newLeft}px`;
  dragState.draggedElement.style.top = `${newTop}px`;

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

  removeDropIndicator();
  if (closestElement) {
    const rect = closestElement.getBoundingClientRect();
    const isLeftHalf = e.clientX < rect.left + rect.width / 2;
    const indicator = addDropIndicator();
    if (isLeftHalf) {
      gamesList.insertBefore(indicator, closestElement);
      gamesList.insertBefore(dragState.draggedElement, indicator);
    } else {
      gamesList.insertBefore(indicator, closestElement.nextSibling);
      gamesList.insertBefore(dragState.draggedElement, indicator.nextSibling);
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
    gamesList.insertBefore(dragState.draggedElement, insertAfter.nextSibling);
  } else {
    const firstPinned = gamesList.querySelector('.pin-game:not(.dragging)');
    if (firstPinned) gamesList.insertBefore(dragState.draggedElement, firstPinned);
  }
}

export function addDragFunctionality(manager, element) {
  // Clean up any existing listeners first
  dragState.cleanup();

  element.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent native drag from starting
    // Only allow dragging with left mouse button (LMB)
    if (e.button !== 0) return;
    // Prevent dragging if the target is a button (e.g., pin or delete)
    if (e.target.closest('.latest-game-buttons')) return;

    // Clean up any existing listeners before adding new ones
    dragState.cleanup();

    manager.wasDragging = false;
    dragState.initialX = e.clientX;
    dragState.initialY = e.clientY;
    dragState.isDragging = true;
    dragState.draggedElement = element;

    const bounds = getDragBounds(element);
    const clickX = e.clientX - bounds.element.rect.left;
    dragState.isRightHalf = clickX > bounds.element.rect.width / 2;
    dragState.lastPanelDragY = e.clientY;
    // Calculate the offset from the top-left corner of the element
    dragState.dragOffset = {
      x: e.clientX - bounds.element.rect.left,
      y: e.clientY - bounds.element.rect.top
    };

    // Create bound functions and store references
    dragState.globalEvents.handleDragMove = (e) => handleDragMove(e, manager);
    dragState.globalEvents.handleDragEnd = () => handleDragEnd(manager);

    document.addEventListener('mousemove', dragState.globalEvents.handleDragMove);
    document.addEventListener('mouseup', dragState.globalEvents.handleDragEnd);
  });
}

function handleDragMove(e, manager) {
  if (!dragState.isDragging || !dragState.draggedElement) return;

  // Remove 'dragged-game' from all possible elements
  document.querySelectorAll('.dragged-game').forEach(el => el.classList.remove('dragged-game'));

  if (!manager.wasDragging && isActuallyDragging(e)) {
    manager.wasDragging = true;
    dragState.draggedElement.classList.add('dragging');
    if (manager.viewManager.getDisplayMode() === 'wrap') {
      const bounds = getDragBounds(dragState.draggedElement);
      dragState.draggedElement.style.position = 'absolute';
      dragState.draggedElement.style.left = `${bounds.element.rect.left - bounds.parent.rect.left}px`;
      dragState.draggedElement.style.top = `${bounds.element.rect.top - bounds.parent.rect.top}px`;
      dragState.draggedElement.style.width = `${bounds.element.rect.width}px`;
    }
  }

  e.preventDefault();

  const displayMode = manager.viewManager.getDisplayMode();
  const gamesList = document.getElementById('latest-games');

  if (displayMode === 'scroll') {
    handleScrollModePositioning(e, gamesList);
  } else {
    handleWrapModePositioning(e, gamesList);
  }

  // Handle rotation
  const currentY = e.clientY;
  const deltaY = currentY - dragState.lastPanelDragY;
  dragState.lastPanelDragY = currentY;
  if (deltaY !== 0) {
    const sensitivity = 0.2;
    dragState.rotationAccumulator = (dragState.rotationAccumulator || 0) +
      (dragState.isRightHalf ? deltaY : -deltaY) * sensitivity;
    dragState.rotationAccumulator = Math.max(
      -dragState.rotationDegreeLimit,
      Math.min(dragState.rotationDegreeLimit, dragState.rotationAccumulator)
    );
    dragState.draggedElement.style.transform = `rotate(${dragState.rotationAccumulator}deg)`;
  }
}

function handleDragEnd(manager) {
  // Always clean up listeners first, regardless of state
  dragState.cleanup();
  removeDropIndicator();

  if (!dragState.isDragging || !dragState.draggedElement) {
    dragState.reset();
    return;
  }

  dragState.isDragging = false;
  dragState.draggedElement.classList.remove('dragging');
  dragState.draggedElement.classList.add('dragged-game');

  const displayMode = manager.viewManager.getDisplayMode();
  if (displayMode === 'wrap') {
    dragState.draggedElement.style.position = '';
    dragState.draggedElement.style.left = '';
    dragState.draggedElement.style.top = '';
    dragState.draggedElement.style.width = '';
  }
  dragState.draggedElement.style.transform = '';

  manager.gamesManager.updateGameOrderFromDOM();

  // Clean up drag state
  dragState.reset();
}