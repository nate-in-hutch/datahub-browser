import { parseUrnName, parseUrnType } from './urn';
import type { DatahubObject } from './types';

type RelationshipsApiResponse = {
  relationships?: Array<Record<string, unknown>>;
  entities?: Array<Record<string, unknown>>;
  value?: Array<Record<string, unknown>>;
  elements?: Array<Record<string, unknown>>;
};

type RequestOptions = {
  token?: string;
};

export class DatahubApiError extends Error {
  status?: number;
  endpoint?: string;
  attemptedEndpoints?: string[];
  details?: string;

  constructor(message: string, options?: { status?: number; endpoint?: string; attemptedEndpoints?: string[]; details?: string }) {
    super(message);
    this.name = 'DatahubApiError';
    this.status = options?.status;
    this.endpoint = options?.endpoint;
    this.attemptedEndpoints = options?.attemptedEndpoints;
    this.details = options?.details;
  }
}

const LEGACY_RELATIONSHIP_TYPES = [
  'DownstreamOf',
  'UpstreamOf',
  'Consumes',
  'Produces',
  'DependsOn',
  'Contains',
  'OwnedBy',
  'ParentOf',
  'IsPartOf',
  'HasPart',
  'SchemaFieldOf',
  'InputFields',
  'OutputFields'
].join(',');

function buildHeaders(token?: string): HeadersInit {
  if (token && token.trim().length > 0) {
    return {
      Authorization: `Bearer ${token.trim()}`
    };
  }
  return {};
}

async function fetchJson(baseUrl: string, path: string, options: RequestOptions): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: buildHeaders(options.token)
  });
  if (!response.ok) {
    const details = await response.text();
    throw new DatahubApiError(`HTTP ${response.status} for ${path}`, {
      status: response.status,
      endpoint: path,
      details: details || response.statusText
    });
  }
  return response.json();
}

function extractRelatedUrn(item: Record<string, unknown>): string | null {
  const candidateKeys = ['entity', 'urn', 'entityUrn', 'relatedUrn'];
  for (const key of candidateKeys) {
    const value = item[key];
    if (typeof value === 'string' && value.startsWith('urn:li:')) {
      return value;
    }
  }
  return null;
}

function extractRelationshipType(item: Record<string, unknown>): string {
  const rawType = item.relationshipType ?? item.type ?? item.relationship;
  return typeof rawType === 'string' ? rawType : 'related_to';
}

function extractRelationshipItems(response: RelationshipsApiResponse): Array<Record<string, unknown>> {
  if (Array.isArray(response.relationships)) return response.relationships;
  if (Array.isArray(response.entities)) return response.entities;
  if (Array.isArray(response.value)) return response.value;
  if (Array.isArray(response.elements)) return response.elements;
  return [];
}

export async function fetchEntity(baseUrl: string, urn: string, options: RequestOptions = {}): Promise<DatahubObject> {
  const encodedUrn = encodeURIComponent(urn);
  const attempts = [
    `/openapi/entities/v1/latest?urns=${encodedUrn}&withSystemMetadata=false`,
    `/openapi/entities/v1/latest?urns=${encodedUrn}`,
    `/entitiesV2/${encodedUrn}`
  ];

  let lastError: unknown;
  for (const endpoint of attempts) {
    try {
      const json = await fetchJson(baseUrl, endpoint, options);
      const topLevel = (json ?? {}) as Record<string, unknown>;
      const responses = topLevel.responses as Record<string, unknown> | undefined;
      const responseRecord =
        responses && typeof responses === 'object'
          ? ((Object.values(responses)[0] as Record<string, unknown> | undefined) ?? {})
          : ((topLevel.value ?? topLevel) as Record<string, unknown>);
      const entityUrn = typeof responseRecord.urn === 'string' ? responseRecord.urn : urn;
      return {
        id: entityUrn,
        type: parseUrnType(entityUrn),
        name: parseUrnName(entityUrn),
        raw: responseRecord
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof DatahubApiError) {
    throw new DatahubApiError('Failed to fetch entity from GMS.', {
      status: lastError.status,
      endpoint: lastError.endpoint,
      details: lastError.details,
      attemptedEndpoints: attempts
    });
  }
  throw new DatahubApiError('Failed to fetch entity from GMS.', {
    attemptedEndpoints: attempts
  });
}

export async function fetchRelationships(
  baseUrl: string,
  urn: string,
  direction: 'INCOMING' | 'OUTGOING',
  options: RequestOptions = {}
): Promise<Array<{ urn: string; type: string }>> {
  const encodedUrn = encodeURIComponent(urn);
  const encodedTypes = encodeURIComponent(LEGACY_RELATIONSHIP_TYPES);
  const attempts = [
    `/openapi/relationships/v1/?urn=${encodedUrn}&direction=${direction}&start=0&count=100`,
    `/openapi/relationships/v1?urn=${encodedUrn}&direction=${direction}&start=0&count=100`,
    `/relationships?urn=${encodedUrn}&direction=${direction}&types=${encodedTypes}&start=0&count=100`
  ];

  let lastError: unknown;
  for (const endpoint of attempts) {
    try {
      const responseJson = (await fetchJson(baseUrl, endpoint, options)) as RelationshipsApiResponse;
      return extractRelationshipItems(responseJson)
        .map((item) => {
          const relatedUrn = extractRelatedUrn(item);
          if (!relatedUrn) return null;
          return {
            urn: relatedUrn,
            type: extractRelationshipType(item)
          };
        })
        .filter((item): item is { urn: string; type: string } => item !== null);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof DatahubApiError) {
    throw new DatahubApiError('Failed to fetch relationships from GMS.', {
      status: lastError.status,
      endpoint: lastError.endpoint,
      details: lastError.details,
      attemptedEndpoints: attempts
    });
  }
  throw new DatahubApiError('Failed to fetch relationships from GMS.', {
    attemptedEndpoints: attempts
  });
}

