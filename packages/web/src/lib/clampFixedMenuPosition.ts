const DEFAULT_PADDING = 8;

export function clampFixedMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  padding = DEFAULT_PADDING
): { x: number; y: number } {
  const maxX = Math.max(padding, window.innerWidth - menuWidth - padding);
  const maxY = Math.max(padding, window.innerHeight - menuHeight - padding);

  return {
    x: Math.min(Math.max(x, padding), maxX),
    y: Math.min(Math.max(y, padding), maxY)
  };
}

export function applyFixedMenuPosition(
  element: HTMLElement,
  x: number,
  y: number,
  padding = DEFAULT_PADDING
): void {
  const rect = element.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : element.offsetWidth;
  const height = rect.height > 0 ? rect.height : element.offsetHeight;
  const { x: clampedX, y: clampedY } = clampFixedMenuPosition(x, y, width, height, padding);

  element.style.left = `${clampedX}px`;
  element.style.top = `${clampedY}px`;
}
