import { describe, expect, it, vi } from 'vitest';
import {
  buildDatahubEntityUrlWithMode,
  encodeDatahubStyleUrnPathSegment,
  normalizeDatahubUiBaseUrl,
  normalizeDatahubUiRouteMode
} from './urls';

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
  it('returns mapped type-based URL in type mode', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    const datasetUrn = 'urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)';
    const corpUserUrn = 'urn:li:corpuser:__datahub_system';
    const dataFlowUrn = 'urn:li:dataFlow:(airflow,my_flow,PROD)';
    expect(buildDatahubEntityUrlWithMode('localhost:9002', datasetUrn, 'type')).toBe(
      `http://localhost:9002/dataset/${datasetUrn}`
    );
    expect(buildDatahubEntityUrlWithMode('localhost:9002', corpUserUrn, 'type')).toBe(
      `http://localhost:9002/user/${corpUserUrn}`
    );
    expect(buildDatahubEntityUrlWithMode('localhost:9002', dataFlowUrn, 'type')).toBe(
      `http://localhost:9002/pipelines/${dataFlowUrn}`
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

  it('falls back to search when type path mapping is unknown', () => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost' }
    });
    const urn = 'urn:li:unknownType:my_entity';
    expect(buildDatahubEntityUrlWithMode('localhost:9002', urn, 'type')).toBe(
      `http://localhost:9002/search?query=${encodeURIComponent(urn)}`
    );
  });
});

describe('encodeDatahubStyleUrnPathSegment', () => {
  it('matches DataHub path encoding behavior', () => {
    const urn = 'urn:li:dataset:(urn:li:dataPlatform:db%2Fs?x#part[abc],table,PROD)';
    expect(encodeDatahubStyleUrnPathSegment(urn)).toBe(
      'urn:li:dataset:(urn:li:dataPlatform:db{{encoded_percent}}2Fs%3Fx%23part%5Babc%5D,table,PROD)'
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
