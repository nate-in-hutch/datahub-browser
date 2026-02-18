import { parseUrnType } from './urn';
import type { DatahubUiRouteMode } from './types';

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
  const urnType = parseUrnType(urn);
  return `${baseUrl}/${urnType}/${urn}`;
}
