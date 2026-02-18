import { describe, expect, it } from 'vitest';
import { getNextNavigationStack } from './navigation';

describe('navigation stack', () => {
  it('resets stack on connect', () => {
    expect(getNextNavigationStack(['a', 'b'], 'root', 'connect')).toEqual(['root']);
  });

  it('appends new node when drilling in', () => {
    expect(getNextNavigationStack(['a'], 'b', 'node')).toEqual(['a', 'b']);
  });

  it('pops stack when clicking existing breadcrumb', () => {
    expect(getNextNavigationStack(['a', 'b', 'c'], 'a', 'breadcrumb', 0)).toEqual(['a']);
  });

  it('keeps stack unchanged if clicking current node', () => {
    expect(getNextNavigationStack(['a', 'b'], 'b', 'node')).toEqual(['a', 'b']);
  });
});

