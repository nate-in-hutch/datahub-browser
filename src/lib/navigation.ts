import type { NavigationMode } from './types';

export function getNextNavigationStack(
  currentStack: string[],
  nextUrn: string,
  mode: NavigationMode,
  breadcrumbIndex?: number
): string[] {
  if (mode === 'connect') {
    return [nextUrn];
  }

  if (mode === 'breadcrumb') {
    if (
      typeof breadcrumbIndex === 'number' &&
      breadcrumbIndex >= 0 &&
      breadcrumbIndex < currentStack.length &&
      currentStack[breadcrumbIndex] === nextUrn
    ) {
      return currentStack.slice(0, breadcrumbIndex + 1);
    }
    const existingIndex = currentStack.lastIndexOf(nextUrn);
    if (existingIndex >= 0) {
      return currentStack.slice(0, existingIndex + 1);
    }
    return [nextUrn];
  }

  if (currentStack.length === 0) {
    return [nextUrn];
  }

  if (currentStack[currentStack.length - 1] === nextUrn) {
    return currentStack;
  }

  const existingIndex = currentStack.lastIndexOf(nextUrn);
  if (existingIndex >= 0) {
    return currentStack.slice(0, existingIndex + 1);
  }

  return [...currentStack, nextUrn];
}

