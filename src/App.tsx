import React, { useMemo, useState } from 'react';

type DatahubObject = {
  id: string;
  type: string;
  name: string;
  raw: unknown;
};

type RelationshipEdge = {
  sourceId: string;
  targetId: string;
  type: string;
};

type PositionedNode = {
  object: DatahubObject;
  x: number;
  y: number;
  role: 'center' | 'parent' | 'dependency' | 'both' | 'previous';
};

type Neighborhood = {
  centerUrn: string;
  previousUrn: string | null;
  parentUrns: Set<string>;
  dependencyUrns: Set<string>;
  aspectLabelsByUrn: Record<string, string[]>;
  edges: RelationshipEdge[];
};

type RelationshipsApiResponse = {
  relationships?: Array<Record<string, unknown>>;
  entities?: Array<Record<string, unknown>>;
  value?: Array<Record<string, unknown>>;
  elements?: Array<Record<string, unknown>>;
};

type NavigationMode = 'connect' | 'node' | 'breadcrumb';
type ViewMode = 'graph' | 'structure';
type GraphLane = {
  label: string;
  startAngle: number;
  endAngle: number;
  color: string;
};

const DEFAULT_GMS_BASE = '/gms';
const DEFAULT_DATAHUB_HOST = (import.meta.env.VITE_DATAHUB_HOST as string | undefined) ?? window.location.hostname;
const DEFAULT_DATAHUB_PORT = (import.meta.env.VITE_DATAHUB_PORT as string | undefined) ?? window.location.port;
const DEFAULT_GMS_API_PATH = (import.meta.env.VITE_DATAHUB_GMS_API_PATH as string | undefined) ?? DEFAULT_GMS_BASE;
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

function getRoleColor(role: PositionedNode['role']): string {
  if (role === 'center') return '#1d4ed8';
  if (role === 'previous') return '#7c3aed';
  if (role === 'parent') return '#b45309';
  if (role === 'both') return '#0f766e';
  return '#2563eb';
}

function parseUrnType(urn: string): string {
  const match = urn.match(/^urn:li:([^:]+):/);
  return match ? match[1] : 'entity';
}

function parseUrnName(urn: string): string {
  const hashParts = urn.split('#');
  const beforeHash = hashParts[0];
  const lastParen = beforeHash.lastIndexOf('(');
  const lastClose = beforeHash.lastIndexOf(')');
  if (lastParen >= 0 && lastClose > lastParen) {
    return beforeHash.slice(lastParen + 1, lastClose);
  }
  const urnParts = beforeHash.split(':');
  return urnParts[urnParts.length - 1] ?? urn;
}

function extractUrnsFromJson(value: unknown, results: Set<string> = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith('urn:li:')) {
      results.add(value);
    }
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => extractUrnsFromJson(item, results));
    return results;
  }

  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => extractUrnsFromJson(item, results));
  }

  return results;
}

function extractAspectUrnGroups(raw: unknown): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  if (!raw || typeof raw !== 'object') {
    return groups;
  }

  const record = raw as Record<string, unknown>;
  const aspects = record.aspects;
  if (!aspects) {
    return groups;
  }

  const addAspectGroup = (label: string, value: unknown): void => {
    const urns = extractUrnsFromJson(value);
    if (urns.size > 0) {
      groups.set(label, urns);
    }
  };

  if (Array.isArray(aspects)) {
    aspects.forEach((aspect, index) => {
      if (!aspect || typeof aspect !== 'object') return;
      const aspectRecord = aspect as Record<string, unknown>;
      const label =
        (typeof aspectRecord.label === 'string' && aspectRecord.label) ||
        (typeof aspectRecord.name === 'string' && aspectRecord.name) ||
        (typeof aspectRecord.aspectName === 'string' && aspectRecord.aspectName) ||
        `aspect_${index + 1}`;
      addAspectGroup(label, aspectRecord);
    });
    return groups;
  }

  if (typeof aspects === 'object') {
    Object.entries(aspects as Record<string, unknown>).forEach(([key, value], index) => {
      if (value && typeof value === 'object') {
        const valueRecord = value as Record<string, unknown>;
        const label =
          (typeof valueRecord.label === 'string' && valueRecord.label) ||
          (typeof valueRecord.name === 'string' && valueRecord.name) ||
          key ||
          `aspect_${index + 1}`;
        addAspectGroup(label, valueRecord);
      }
    });
  }

  return groups;
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

async function fetchJson(baseUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`HTTP ${response.status} for ${path}: ${details || response.statusText}`);
  }
  return response.json();
}

function buildGmsBaseUrl(host: string, port: string, gmsApiPath: string): string {
  const normalizedPath = gmsApiPath
    ? gmsApiPath.startsWith('/')
      ? gmsApiPath
      : `/${gmsApiPath}`
    : '';
  return `${window.location.protocol}//${host}${port ? `:${port}` : ''}${normalizedPath}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function describeRingSegmentPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const delta = endAngle - startAngle;
  const largeArcFlag = delta > Math.PI ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    'Z'
  ].join(' ');
}

function formatEdgeLabel(type: string): string | null {
  if (type.startsWith('aspect:')) {
    return null;
  }
  return type;
}

function getNextNavigationStack(
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

function stripQuotedString(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function renderJsonWithUrnLinks(
  jsonText: string,
  onUrnClick: (urn: string) => void,
  isLoading: boolean,
  currentUrn?: string
): React.ReactNode[] {
  const tokenPattern =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\{|\}|\[|\]|,|:)/g;
  const segments = jsonText.split(tokenPattern);

  return segments.map((segment, index) => {
    if (segment === '') {
      return null;
    }

    const isKey = /^"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:$/.test(segment);
    const isString = /^"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"$/.test(segment);
    const isNumber = /^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(segment);
    const isBoolean = segment === 'true' || segment === 'false';
    const isNull = segment === 'null';
    const isPunctuation = segment.length === 1 && '{}[],:'.includes(segment);

    if (isString) {
      const rawValue = stripQuotedString(segment);
      if (rawValue.startsWith('urn:li:') && rawValue !== currentUrn) {
        const quotedUrn = `"${rawValue}"`;
        return (
          <button
            key={`urn-${rawValue}-${index}`}
            type="button"
            disabled={isLoading}
            onClick={() => onUrnClick(rawValue)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#60a5fa',
              textDecoration: 'underline',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: 0,
              margin: 0,
              font: 'inherit'
            }}
          >
            {quotedUrn}
          </button>
        );
      }
    }

    let color = '#d8e1f3';
    if (isKey) color = '#93c5fd';
    else if (isString) color = '#86efac';
    else if (isNumber) color = '#fca5a5';
    else if (isBoolean) color = '#fcd34d';
    else if (isNull) color = '#a5b4fc';
    else if (isPunctuation) color = '#94a3b8';

    return (
      <span key={`tok-${index}`} style={{ color }}>
        {segment}
      </span>
    );
  }).filter(Boolean) as React.ReactNode[];
}

async function fetchEntity(baseUrl: string, urn: string): Promise<DatahubObject> {
  const encodedUrn = encodeURIComponent(urn);

  const parsers: Array<(json: unknown) => { entityUrn: string; raw: unknown }> = [
    (json) => {
      const topLevel = (json ?? {}) as Record<string, unknown>;
      const responses = topLevel.responses as Record<string, unknown> | undefined;
      const responseRecord =
        responses && typeof responses === 'object'
          ? ((Object.values(responses)[0] as Record<string, unknown> | undefined) ?? {})
          : topLevel;
      const entityUrn = typeof responseRecord.urn === 'string' ? responseRecord.urn : urn;
      return { entityUrn, raw: responseRecord };
    },
    (json) => {
      const topLevel = (json ?? {}) as Record<string, unknown>;
      const value = (topLevel.value ?? topLevel) as Record<string, unknown>;
      const entityUrn = typeof value.urn === 'string' ? value.urn : urn;
      return { entityUrn, raw: value };
    }
  ];

  const attempts: Array<{ path: string; parserIndex: number }> = [
    { path: `/openapi/entities/v1/latest?urns=${encodedUrn}&withSystemMetadata=false`, parserIndex: 0 },
    { path: `/openapi/entities/v1/latest?urns=${encodedUrn}`, parserIndex: 0 },
    { path: `/entitiesV2/${encodedUrn}`, parserIndex: 1 }
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const json = await fetchJson(baseUrl, attempt.path);
      const parsed = parsers[attempt.parserIndex](json);
      return {
        id: parsed.entityUrn,
        type: parseUrnType(parsed.entityUrn),
        name: parseUrnName(parsed.entityUrn),
        raw: parsed.raw
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch entity from GMS.');
}

async function fetchRelationships(
  baseUrl: string,
  urn: string,
  direction: 'INCOMING' | 'OUTGOING'
): Promise<Array<{ urn: string; type: string }>> {
  const encodedUrn = encodeURIComponent(urn);
  const encodedTypes = encodeURIComponent(LEGACY_RELATIONSHIP_TYPES);
  const attempts = [
    `/openapi/relationships/v1/?urn=${encodedUrn}&direction=${direction}&start=0&count=100`,
    `/openapi/relationships/v1?urn=${encodedUrn}&direction=${direction}&start=0&count=100`,
    `/relationships?urn=${encodedUrn}&direction=${direction}&types=${encodedTypes}&start=0&count=100`
  ];

  let lastError: unknown;
  for (const path of attempts) {
    try {
      const responseJson = (await fetchJson(baseUrl, path)) as RelationshipsApiResponse;
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

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch relationships from GMS.');
}

export default function App() {
  const [datahubHost] = useState<string>(DEFAULT_DATAHUB_HOST);
  const [datahubPort] = useState<string>(DEFAULT_DATAHUB_PORT);
  const [gmsApiPath] = useState<string>(DEFAULT_GMS_API_PATH);
  const [urnInput, setUrnInput] = useState<string>('');
  const [centerId, setCenterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string>('');
  const [entitiesByUrn, setEntitiesByUrn] = useState<Record<string, DatahubObject>>({});
  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [navStack, setNavStack] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('structure');
  const [structureFilter, setStructureFilter] = useState<string>('');
  const svgWidth = 980;
  const svgHeight = 660;
  const gmsBaseUrl = useMemo(() => buildGmsBaseUrl(datahubHost, datahubPort, gmsApiPath), [datahubHost, datahubPort, gmsApiPath]);

  async function loadNeighborhood(
    urn: string,
    options?: { mode?: NavigationMode; breadcrumbIndex?: number }
  ): Promise<void> {
    const trimmedUrn = urn.trim();
    if (!trimmedUrn) {
      setInputError('Enter a URN to connect.');
      return;
    }

    setIsLoading(true);
    setInputError('');
    try {
      const centerEntity = await fetchEntity(gmsBaseUrl, trimmedUrn);
      const [incoming, outgoing] = await Promise.all([
        fetchRelationships(gmsBaseUrl, centerEntity.id, 'INCOMING'),
        fetchRelationships(gmsBaseUrl, centerEntity.id, 'OUTGOING')
      ]);

      const jsonDependencyUrns = Array.from(extractUrnsFromJson(centerEntity.raw)).filter(
        (candidateUrn) => candidateUrn !== centerEntity.id
      );
      const aspectGroups = extractAspectUrnGroups(centerEntity.raw);
      const aspectLabelsByUrn: Record<string, string[]> = {};
      aspectGroups.forEach((urns, label) => {
        urns.forEach((aspectUrn) => {
          if (aspectUrn === centerEntity.id) return;
          const existingLabels = aspectLabelsByUrn[aspectUrn] ?? [];
          if (!existingLabels.includes(label)) {
            aspectLabelsByUrn[aspectUrn] = [...existingLabels, label];
          }
        });
      });
      const mode = options?.mode ?? 'node';
      const nextNavStack = getNextNavigationStack(navStack, centerEntity.id, mode, options?.breadcrumbIndex);
      const previousUrn = nextNavStack.length > 1 ? nextNavStack[nextNavStack.length - 2] : null;

      const parentUrns = new Set(incoming.map((item) => item.urn));
      const dependencyUrns = new Set([...outgoing.map((item) => item.urn), ...jsonDependencyUrns]);
      const neighborUrns = Array.from(
        new Set([
          ...parentUrns,
          ...dependencyUrns,
          ...(previousUrn && previousUrn !== centerEntity.id ? [previousUrn] : [])
        ])
      );

      const neighborEntities = await Promise.all(
        neighborUrns.map(async (neighborUrn) => {
          try {
            return await fetchEntity(gmsBaseUrl, neighborUrn);
          } catch {
            return {
              id: neighborUrn,
              type: parseUrnType(neighborUrn),
              name: parseUrnName(neighborUrn),
              raw: { urn: neighborUrn, unavailable: true }
            } as DatahubObject;
          }
        })
      );

      const nextEntities: Record<string, DatahubObject> = { ...entitiesByUrn };
      nextEntities[centerEntity.id] = centerEntity;
      neighborEntities.forEach((entity) => {
        nextEntities[entity.id] = entity;
      });

      const incomingEdges: RelationshipEdge[] = incoming.map((item) => ({
        sourceId: item.urn,
        targetId: centerEntity.id,
        type: item.type
      }));
      const outgoingEdges: RelationshipEdge[] = outgoing.map((item) => ({
        sourceId: centerEntity.id,
        targetId: item.urn,
        type: item.type
      }));
      const jsonDependencyEdges: RelationshipEdge[] = jsonDependencyUrns.map((dependencyUrn) => {
        const aspectLabels = aspectLabelsByUrn[dependencyUrn];
        return {
          sourceId: centerEntity.id,
          targetId: dependencyUrn,
          type: aspectLabels && aspectLabels.length > 0 ? `aspect:${aspectLabels.join('|')}` : 'json_reference'
        };
      });

      const dedupedEdgesMap = new Map<string, RelationshipEdge>();
      const relationshipEdges = [...incomingEdges, ...outgoingEdges, ...jsonDependencyEdges];
      const hasExistingPreviousLink = relationshipEdges.some(
        (edge) =>
          (edge.sourceId === previousUrn && edge.targetId === centerEntity.id) ||
          (edge.sourceId === centerEntity.id && edge.targetId === previousUrn)
      );
      const previousEdge: RelationshipEdge[] =
        previousUrn && previousUrn !== centerEntity.id
          ? hasExistingPreviousLink
            ? []
            : [{ sourceId: previousUrn, targetId: centerEntity.id, type: 'previous_selection' }]
          : [];
      [...relationshipEdges, ...previousEdge].forEach((edge) => {
        const key = `${edge.sourceId}|${edge.targetId}|${edge.type}`;
        if (!dedupedEdgesMap.has(key)) {
          dedupedEdgesMap.set(key, edge);
        }
      });

      setEntitiesByUrn(nextEntities);
      setNeighborhood({
        centerUrn: centerEntity.id,
        previousUrn: previousUrn ?? null,
        parentUrns,
        dependencyUrns,
        aspectLabelsByUrn,
        edges: Array.from(dedupedEdgesMap.values())
      });
      setNavStack(nextNavStack);
      setCenterId(centerEntity.id);
      setUrnInput(centerEntity.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch from GMS.';
      setInputError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const graph = useMemo(() => {
    if (!neighborhood || !centerId) {
      return { nodes: [] as PositionedNode[], edges: [] as RelationshipEdge[], lanes: [] as GraphLane[] };
    }
    const centerObject = entitiesByUrn[centerId];
    if (!centerObject) {
      return { nodes: [] as PositionedNode[], edges: [] as RelationshipEdge[], lanes: [] as GraphLane[] };
    }

    const dependencyGroups = new Map<string, string[]>();
    const previousUrn = neighborhood.previousUrn;
    Array.from(neighborhood.dependencyUrns)
      .filter((urn) => Boolean(entitiesByUrn[urn]))
      .filter((urn) => urn !== previousUrn)
      .forEach((urn) => {
        const label = neighborhood.aspectLabelsByUrn[urn]?.[0] ?? 'Uncategorized';
        const current = dependencyGroups.get(label) ?? [];
        dependencyGroups.set(label, [...current, urn]);
      });
    const sortedDependencyGroupLabels = Array.from(dependencyGroups.keys()).sort((left, right) => left.localeCompare(right));
    const groupedDependencies = sortedDependencyGroupLabels.map((label) => ({
      label,
      urns: (dependencyGroups.get(label) ?? []).sort((left, right) => left.localeCompare(right))
    }));
    const aspectOrderedDependencies = groupedDependencies.flatMap((group) => group.urns);
    const parentUrns = Array.from(neighborhood.parentUrns)
      .filter((urn) => Boolean(entitiesByUrn[urn]))
      .filter((urn) => urn !== previousUrn)
      .sort((left, right) => left.localeCompare(right));
    const orderedNeighborUrns = [
      ...(neighborhood.previousUrn && neighborhood.previousUrn !== centerId ? [neighborhood.previousUrn] : []),
      ...parentUrns,
      ...aspectOrderedDependencies
    ];
    const neighborUrns = Array.from(new Set(orderedNeighborUrns));
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const radius = Math.min(svgWidth, svgHeight) * 0.34;

    const nodes: PositionedNode[] = [
      {
        object: centerObject,
        x: centerX,
        y: centerY,
        role: 'center'
      }
    ];

    neighborUrns.forEach((urn, index) => {
      const object = entitiesByUrn[urn];
      const angle = (Math.PI * 2 * index) / Math.max(neighborUrns.length, 1) - Math.PI / 2;
      const isParent = neighborhood.parentUrns.has(urn);
      const isDependency = neighborhood.dependencyUrns.has(urn);
      nodes.push({
        object,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        role:
          neighborhood.previousUrn === urn
            ? 'previous'
            : isParent && isDependency
              ? 'both'
              : isParent
                ? 'parent'
                : 'dependency'
      });
    });

    const lanes: GraphLane[] = [];
    if (neighborUrns.length > 0) {
      const step = (Math.PI * 2) / neighborUrns.length;
      const lanePadding = step * 0.22;
      const laneColorPalette = ['#bfdbfe', '#ddd6fe', '#bae6fd', '#bbf7d0', '#fde68a', '#fecdd3'];

      const indexByUrn = new Map(neighborUrns.map((urn, index) => [urn, index]));

      if (neighborhood.previousUrn && neighborhood.previousUrn !== centerId) {
        const previousIndex = indexByUrn.get(neighborhood.previousUrn);
        if (typeof previousIndex === 'number') {
          lanes.push({
            label: 'Previous',
            startAngle: previousIndex * step - Math.PI / 2 - lanePadding,
            endAngle: previousIndex * step - Math.PI / 2 + lanePadding,
            color: '#c4b5fd'
          });
        }
      }

      if (parentUrns.length > 0) {
        const start = indexByUrn.get(parentUrns[0]);
        const end = indexByUrn.get(parentUrns[parentUrns.length - 1]);
        if (typeof start === 'number' && typeof end === 'number') {
          lanes.push({
            label: 'Parents',
            startAngle: start * step - Math.PI / 2 - lanePadding,
            endAngle: end * step - Math.PI / 2 + lanePadding,
            color: '#fed7aa'
          });
        }
      }

      let laneColorIndex = 0;
      groupedDependencies.forEach((group) => {
        if (group.urns.length === 0) return;
        const start = indexByUrn.get(group.urns[0]);
        const end = indexByUrn.get(group.urns[group.urns.length - 1]);
        if (typeof start !== 'number' || typeof end !== 'number') return;
        lanes.push({
          label: group.label,
          startAngle: start * step - Math.PI / 2 - lanePadding,
          endAngle: end * step - Math.PI / 2 + lanePadding,
          color: laneColorPalette[laneColorIndex % laneColorPalette.length]
        });
        laneColorIndex += 1;
      });
    }

    return { nodes, edges: neighborhood.edges, lanes };
  }, [centerId, entitiesByUrn, neighborhood, svgHeight, svgWidth]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.object.id, node])), [graph.nodes]);
  const selectedObject = centerId ? entitiesByUrn[centerId] : undefined;
  const selectedJsonText = selectedObject ? JSON.stringify(selectedObject.raw, null, 2) : '';
  const structureSections = useMemo(() => {
    if (!neighborhood || !centerId) {
      return [] as Array<{ title: string; items: Array<{ urn: string; aspectLabel?: string }> }>;
    }

    const previousItems =
      neighborhood.previousUrn && neighborhood.previousUrn !== centerId ? [{ urn: neighborhood.previousUrn }] : [];
    const parentItems = Array.from(neighborhood.parentUrns)
      .filter((urn) => urn !== neighborhood.previousUrn)
      .sort((left, right) => left.localeCompare(right))
      .map((urn) => ({ urn }));
    const dependencyGroups = new Map<string, Array<{ urn: string; aspectLabel?: string }>>();
    Array.from(neighborhood.dependencyUrns)
      .filter((urn) => urn !== neighborhood.previousUrn)
      .forEach((urn) => {
        const aspectLabel = neighborhood.aspectLabelsByUrn[urn]?.[0] ?? 'Uncategorized';
        const currentItems = dependencyGroups.get(aspectLabel) ?? [];
        dependencyGroups.set(aspectLabel, [...currentItems, { urn, aspectLabel }]);
      });

    const sections: Array<{ title: string; items: Array<{ urn: string; aspectLabel?: string }> }> = [];
    if (previousItems.length > 0) {
      sections.push({ title: 'Previous', items: previousItems });
    }
    if (parentItems.length > 0) {
      sections.push({ title: `Parents (${parentItems.length})`, items: parentItems });
    }
    Array.from(dependencyGroups.keys())
      .sort((left, right) => left.localeCompare(right))
      .forEach((label) => {
        const items = (dependencyGroups.get(label) ?? []).sort((left, right) => left.urn.localeCompare(right.urn));
        sections.push({ title: `${label} (${items.length})`, items });
      });

    if (structureFilter.trim().length === 0) {
      return sections;
    }

    const query = structureFilter.trim().toLowerCase();
    return sections
      .map((section) => ({
        title: section.title,
        items: section.items.filter((item) => {
          const entity = entitiesByUrn[item.urn];
          return (
            item.urn.toLowerCase().includes(query) ||
            (item.aspectLabel ?? '').toLowerCase().includes(query) ||
            (entity?.name ?? '').toLowerCase().includes(query) ||
            (entity?.type ?? '').toLowerCase().includes(query)
          );
        })
      }))
      .filter((section) => section.items.length > 0);
  }, [centerId, entitiesByUrn, neighborhood, structureFilter]);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        gap: '1rem',
        minHeight: '100vh',
        padding: '1rem',
        boxSizing: 'border-box',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        background: 'linear-gradient(180deg, #f4f8ff 0%, #ffffff 60%)'
      }}
    >
      <aside
        style={{
          order: 2,
          flex: '2 1 700px',
          height: 'calc(100vh - 2rem)',
          minHeight: '520px',
          border: '1px solid #d7dfed',
          borderRadius: '12px',
          background: '#0f1727',
          color: '#d8e1f3',
          overflow: 'auto'
        }}
      >
        <header style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #243049' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Selected Node JSON</h2>
        </header>
        <pre
          style={{
            margin: 0,
            padding: '1rem',
            fontSize: '12px',
            lineHeight: 1.45,
            whiteSpace: 'pre',
            overflow: 'auto',
            height: 'calc(100% - 52px)'
          }}
        >
          {selectedObject
            ? renderJsonWithUrnLinks(selectedJsonText, (urn) => {
                void loadNeighborhood(urn, { mode: 'node' });
              }, isLoading, selectedObject.id)
            : 'No node selected. Connect with a URN first.'}
        </pre>
      </aside>

      <section
        style={{
          order: 1,
          flex: '1 1 420px',
          height: 'calc(100vh - 2rem)',
          minHeight: '520px',
          border: '1px solid #d7dfed',
          borderRadius: '12px',
          background: '#ffffff',
          overflow: 'hidden'
        }}
      >
        <header style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e8eef8' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem' }}>DataHub Object Relationship Viewer</h1>
          <p style={{ margin: '0.3rem 0 0', color: '#44536a', fontSize: '0.9rem' }}>
            Connect to local GMS, enter a URN, and click nodes to recenter on their neighborhood.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <input
              value={urnInput}
              onChange={(event) => setUrnInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isLoading) {
                  event.preventDefault();
                  void loadNeighborhood(urnInput, { mode: 'connect' });
                }
              }}
              placeholder="Enter URN"
              style={{
                minWidth: '260px',
                flex: '2 1 320px',
                border: '1px solid #c7d2e8',
                borderRadius: '8px',
                padding: '0.45rem 0.6rem',
                fontSize: '0.9rem'
              }}
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                void loadNeighborhood(urnInput, { mode: 'connect' });
              }}
              style={{
                border: 'none',
                borderRadius: '8px',
                background: isLoading ? '#9fb6ea' : '#2f6edf',
                color: '#ffffff',
                padding: '0.45rem 0.8rem',
                fontSize: '0.9rem',
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? 'Loading...' : 'Connect'}
            </button>
            <div style={{ display: 'inline-flex', border: '1px solid #c7d2e8', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setViewMode('structure')}
                style={{
                  border: 'none',
                  padding: '0.45rem 0.7rem',
                  background: viewMode === 'structure' ? '#dbeafe' : '#ffffff',
                  color: '#1e3a8a',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Structure
              </button>
              <button
                type="button"
                onClick={() => setViewMode('graph')}
                style={{
                  border: 'none',
                  borderLeft: '1px solid #c7d2e8',
                  padding: '0.45rem 0.7rem',
                  background: viewMode === 'graph' ? '#dbeafe' : '#ffffff',
                  color: '#1e3a8a',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Graph
              </button>
            </div>
          </div>
          {viewMode === 'structure' && (
            <input
              value={structureFilter}
              onChange={(event) => setStructureFilter(event.target.value)}
              placeholder="Filter by urn, type, name, or aspect"
              style={{
                marginTop: '0.55rem',
                width: 'min(420px, 100%)',
                border: '1px solid #c7d2e8',
                borderRadius: '8px',
                padding: '0.45rem 0.6rem',
                fontSize: '0.85rem'
              }}
            />
          )}
          {navStack.length > 0 && (
            <div style={{ marginTop: '0.55rem', fontSize: '0.82rem', color: '#334155', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {navStack.map((urn, index) => {
                const isCurrent = index === navStack.length - 1;
                const label = entitiesByUrn[urn]?.name ?? parseUrnName(urn);
                return (
                  <React.Fragment key={urn}>
                    <button
                      type="button"
                      disabled={isCurrent || isLoading}
                      onClick={() => {
                        void loadNeighborhood(urn, { mode: 'breadcrumb', breadcrumbIndex: index });
                      }}
                      style={{
                        border: 'none',
                        padding: 0,
                        background: 'transparent',
                        color: isCurrent ? '#0f172a' : '#1d4ed8',
                        textDecoration: isCurrent ? 'none' : 'underline',
                        cursor: isCurrent || isLoading ? 'default' : 'pointer',
                        fontSize: '0.82rem'
                      }}
                    >
                      {label}
                    </button>
                    {!isCurrent && <span style={{ color: '#64748b' }}>/</span>}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {inputError && <p style={{ margin: '0.5rem 0 0', color: '#b91c1c', fontSize: '0.85rem' }}>{inputError}</p>}
        </header>
        {!centerId ? (
          <div
            style={{
              height: 'calc(100% - 140px)',
              minHeight: '320px',
              display: 'grid',
              placeItems: 'center',
              color: '#4b5f7f',
              fontSize: '0.95rem'
            }}
          >
            Graph is empty. Enter a URN and click Connect.
          </div>
        ) : viewMode === 'structure' ? (
          <div style={{ height: 'calc(100% - 170px)', overflow: 'auto', padding: '0.9rem' }}>
            {structureSections.length === 0 ? (
              <p style={{ margin: 0, color: '#526581', fontSize: '0.9rem' }}>No matching relationships for this filter.</p>
            ) : (
              structureSections.map((section) => (
                <div key={section.title} style={{ marginBottom: '0.9rem' }}>
                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.86rem', color: '#1f2a44' }}>{section.title}</h3>
                  <div style={{ border: '1px solid #dbe4f4', borderRadius: '8px', overflow: 'hidden' }}>
                    {section.items.map((item, index) => {
                      const entity = entitiesByUrn[item.urn];
                      return (
                        <button
                          key={`${section.title}-${item.urn}`}
                          type="button"
                          onClick={() => {
                            void loadNeighborhood(item.urn, { mode: 'node' });
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            borderTop: index === 0 ? 'none' : '1px solid #e5edf9',
                            background: '#ffffff',
                            padding: '0.55rem 0.65rem',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: 600 }}>
                            {entity?.type ?? parseUrnType(item.urn)}: {entity?.name ?? parseUrnName(item.urn)}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#51617b', marginTop: '0.15rem' }}>{item.urn}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'calc(100% - 140px)' }}>
            {graph.lanes.map((lane) => {
              const centerX = svgWidth / 2;
              const centerY = svgHeight / 2;
              const innerRadius = Math.min(svgWidth, svgHeight) * 0.39;
              const outerRadius = Math.min(svgWidth, svgHeight) * 0.47;
              const midAngle = (lane.startAngle + lane.endAngle) / 2;
              const labelPoint = polarToCartesian(centerX, centerY, outerRadius + 14, midAngle);
              const labelAnchor =
                Math.cos(midAngle) > 0.3 ? 'start' : Math.cos(midAngle) < -0.3 ? 'end' : 'middle';

              return (
                <g key={`lane-${lane.label}-${lane.startAngle}`}>
                  <path
                    d={describeRingSegmentPath(centerX, centerY, innerRadius, outerRadius, lane.startAngle, lane.endAngle)}
                    fill={lane.color}
                    fillOpacity={0.34}
                    stroke={lane.color}
                    strokeOpacity={0.62}
                    strokeWidth={1}
                  />
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor={labelAnchor}
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#1f2a44"
                    fontWeight={700}
                  >
                    {lane.label}
                  </text>
                </g>
              );
            })}
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.sourceId);
              const target = nodeById.get(edge.targetId);
              const edgeLabel = formatEdgeLabel(edge.type);
              if (!source || !target) {
                return null;
              }

              const midX = (source.x + target.x) / 2;
              const midY = (source.y + target.y) / 2;

              return (
                <g key={`${edge.sourceId}->${edge.targetId}:${edge.type}`}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="#4f7ecf"
                    strokeOpacity={0.45}
                    strokeWidth={2}
                  />
                  {edgeLabel && (
                    <text
                      x={midX}
                      y={midY}
                      fontSize="12"
                      fill="#36517f"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {edgeLabel}
                    </text>
                  )}
                </g>
              );
            })}

            {graph.nodes.map((node) => (
              (() => {
                const aspectLabel = neighborhood?.aspectLabelsByUrn[node.object.id]?.[0];
                return (
                  <g
                    key={node.object.id}
                    onClick={() => {
                      void loadNeighborhood(node.object.id, { mode: 'node' });
                    }}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        void loadNeighborhood(node.object.id, { mode: 'node' });
                      }
                    }}
                  >
                    <title>{node.object.id}</title>
                    {node.role === 'previous' && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={60}
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth={3}
                        strokeOpacity={0.35}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.role === 'center' ? 57 : 50}
                      fill={getRoleColor(node.role)}
                      stroke={node.role === 'previous' ? '#4c1d95' : '#153e75'}
                      strokeWidth={node.role === 'center' ? 4 : node.role === 'previous' ? 4 : 2}
                      strokeDasharray={node.role === 'previous' ? '8 5' : undefined}
                    />
                    {node.role === 'previous' && (
                      <text x={node.x} y={node.y - 24} textAnchor="middle" fontSize="10" fill="#ede9fe" fontWeight={700}>
                        PREVIOUS
                      </text>
                    )}
                    <text x={node.x} y={node.y - 8} textAnchor="middle" fontSize="12" fill="#ffffff" fontWeight={700}>
                      {node.object.type}
                    </text>
                    <text x={node.x} y={node.y + 12} textAnchor="middle" fontSize="11" fill="#ffffff">
                      {node.object.name}
                    </text>
                    {aspectLabel && (
                      <text x={node.x} y={node.y + 26} textAnchor="middle" fontSize="9" fill="#bfdbfe">
                        {aspectLabel}
                      </text>
                    )}
                  </g>
                );
              })()
            ))}
          </svg>
        )}
      </section>
    </div>
  );
}
