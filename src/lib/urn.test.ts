import { describe, expect, it } from 'vitest';
import { extractAspectUrnGroups, extractUrnsFromJson, parseUrnName, parseUrnType } from './urn';

describe('urn helpers', () => {
  it('parses type and name from dataset urn', () => {
    const urn = 'urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)';
    expect(parseUrnType(urn)).toBe('dataset');
    expect(parseUrnName(urn)).toBe('urn:li:dataPlatform:hive,fct_users_created,PROD');
  });

  it('extracts urn references recursively', () => {
    const refs = extractUrnsFromJson({
      a: 'urn:li:corpuser:jdoe',
      b: ['x', { c: 'urn:li:dataset:(urn:li:dataPlatform:hive,table,PROD)' }]
    });
    expect(Array.from(refs).sort()).toEqual([
      'urn:li:corpuser:jdoe',
      'urn:li:dataset:(urn:li:dataPlatform:hive,table,PROD)'
    ]);
  });

  it('groups aspect urns by label', () => {
    const groups = extractAspectUrnGroups({
      aspects: [
        { label: 'ownership', owner: 'urn:li:corpuser:jdoe' },
        { label: 'datasetKey', platform: 'urn:li:dataPlatform:hive' }
      ]
    });
    expect(Array.from(groups.keys()).sort()).toEqual(['datasetKey', 'ownership']);
    expect(Array.from(groups.get('ownership') ?? [])).toEqual(['urn:li:corpuser:jdoe']);
  });
});

