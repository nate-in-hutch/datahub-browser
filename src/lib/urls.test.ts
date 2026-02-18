import { describe, expect, it, vi } from 'vitest';
import { buildDatahubEntityUrlWithMode, normalizeDatahubUiBaseUrl, normalizeDatahubUiRouteMode } from './urls';

describe('normalizeDatahubUiBaseUrl', () => {
  it('adds protocol when missing and strips /gms', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    expect(normalizeDatahubUiBaseUrl('localhost:9002/gms')).toBe('http://localhost:9002');
  });

  it('uses default localhost:9002 when empty', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    expect(normalizeDatahubUiBaseUrl('')).toBe('http://localhost:9002');
  });
});

describe('buildDatahubEntityUrl', () => {
  it('returns type-based url by default mode', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    const urn = 'urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)';
    expect(buildDatahubEntityUrlWithMode('localhost:9002', urn, 'type')).toBe(
      `http://localhost:9002/dataset/${urn}`
    );
  });

  it('supports entity and search route modes', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    const urn = 'urn:li:corpuser:__datahub_system';
    expect(buildDatahubEntityUrlWithMode('localhost:9002', urn, 'entity')).toBe(
      `http://localhost:9002/entity/${encodeURIComponent(urn)}`
    );
    expect(buildDatahubEntityUrlWithMode('localhost:9002', urn, 'search')).toBe(
      `http://localhost:9002/search?query=${encodeURIComponent(urn)}`
    );
  });
});

describe('normalizeDatahubUiRouteMode', () => {
  it('normalizes invalid values to type', () => {
    expect(normalizeDatahubUiRouteMode('')).toBe('type');
    expect(normalizeDatahubUiRouteMode('abc')).toBe('type');
    expect(normalizeDatahubUiRouteMode('ENTITY')).toBe('entity');
  });
});
