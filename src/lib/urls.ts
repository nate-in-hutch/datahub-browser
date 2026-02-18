import { parseUrnType } from './urn';
import type { DatahubUiRouteMode } from './types';

const DATAHUB_ENTITY_PATH_BY_URN_TYPE: Record<string, string> = {
  application: 'application',
  businessattribute: 'business-attribute',
  chart: 'chart',
  container: 'container',
  corpgroup: 'group',
  corpuser: 'user',
  datacontract: 'dataContracts',
  dataflow: 'pipelines',
  datajob: 'tasks',
  dataplatform: 'platform',
  dataplatforminstance: 'dataPlatformInstance',
  dataprocessinstance: 'dataProcessInstance',
  dataproduct: 'dataProduct',
  dashboard: 'dashboard',
  dataset: 'dataset',
  document: 'document',
  domain: 'domain',
  ermodelrelationship: 'erModelRelationship',
  glossarynode: 'glossaryNode',
  glossaryterm: 'glossaryTerm',
  mlfeature: 'features',
  mlfeaturetable: 'featureTables',
  mlmodel: 'mlModels',
  mlmodelgroup: 'mlModelGroup',
  mlprimarykey: 'mlPrimaryKeys',
  query: 'query',
  restricted: 'restricted',
  role: 'role',
  schemafield: 'schemaField',
  structuredproperty: 'structuredProperty',
  tag: 'tag'
};

export function normalizeDatahubUiBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return `${window.location.protocol}//${window.location.hostname}:9002`;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = normalized.startsWith('//')
      ? `${window.location.protocol}${normalized}`
      : `${window.location.protocol}//${normalized}`;
  }

  normalized = normalized.replace(/\/+$/, '');
  normalized = normalized.replace(/\/gms$/i, '');
  return normalized;
}

export function buildDatahubEntityUrl(datahubUiBaseUrl: string, urn: string): string {
  return buildDatahubEntityUrlWithMode(datahubUiBaseUrl, urn, 'type');
}

export function normalizeDatahubUiRouteMode(value: string): DatahubUiRouteMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'entity' || normalized === 'search') {
    return normalized;
  }
  return 'type';
}

export function buildDatahubEntityUrlWithMode(
  datahubUiBaseUrl: string,
  urn: string,
  routeMode: DatahubUiRouteMode
): string {
  const baseUrl = normalizeDatahubUiBaseUrl(datahubUiBaseUrl);
  const encodedUrn = encodeURIComponent(urn);
  if (routeMode === 'entity') {
    return `${baseUrl}/entity/${encodedUrn}`;
  }
  if (routeMode === 'search') {
    return `${baseUrl}/search?query=${encodedUrn}`;
  }
  const urnType = parseUrnType(urn).toLowerCase();
  const pathName = DATAHUB_ENTITY_PATH_BY_URN_TYPE[urnType];
  if (!pathName) {
    return `${baseUrl}/search?query=${encodedUrn}`;
  }
  return `${baseUrl}/${pathName}/${encodeDatahubStyleUrnPathSegment(urn)}`;
}

export function encodeDatahubStyleUrnPathSegment(urn: string): string {
  return urn
    .replace(/%/g, '{{encoded_percent}}')
    .replace(/\//g, '%2F')
    .replace(/\?/g, '%3F')
    .replace(/#/g, '%23')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
}
