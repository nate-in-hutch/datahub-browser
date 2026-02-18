import React, { useMemo, useState } from 'react';
import { GraphPanel } from './components/GraphPanel';
import { JsonPanel } from './components/JsonPanel';
import { StructurePanel } from './components/StructurePanel';
import { fetchEntity, fetchRelationships, DatahubApiError } from './lib/datahubClient';
import { getNextNavigationStack } from './lib/navigation';
import { extractAspectUrnGroups, extractUrnsFromJson, parseUrnName, parseUrnType } from './lib/urn';
import { normalizeDatahubUiBaseUrl, normalizeDatahubUiRouteMode } from './lib/urls';
import type { DatahubObject, DatahubUiRouteMode, GraphLane, NavigationMode, Neighborhood, PositionedNode, RelationshipEdge, ViewMode } from './lib/types';

const DEFAULT_GMS_BASE = '/gms';
const DEFAULT_DATAHUB_HOST = (import.meta.env.VITE_DATAHUB_HOST as string | undefined) ?? window.location.hostname;
const DEFAULT_DATAHUB_PORT = (import.meta.env.VITE_DATAHUB_PORT as string | undefined) ?? window.location.port;
const DEFAULT_GMS_API_PATH = (import.meta.env.VITE_DATAHUB_GMS_API_PATH as string | undefined) ?? DEFAULT_GMS_BASE;
const DEFAULT_DATAHUB_UI_BASE_URL = normalizeDatahubUiBaseUrl(
  (import.meta.env.VITE_DATAHUB_UI_BASE_URL as string | undefined) ??
    `${window.location.protocol}//${window.location.hostname}:9002`
);
const DEFAULT_DATAHUB_UI_ROUTE_MODE = normalizeDatahubUiRouteMode(
  (import.meta.env.VITE_DATAHUB_UI_ROUTE_MODE as string | undefined) ?? 'type'
);
const DEFAULT_DATAHUB_TOKEN = (import.meta.env.VITE_DATAHUB_TOKEN as string | undefined) ?? '';

function buildGmsBaseUrl(host: string, port: string, gmsApiPath: string): string {
  const normalizedPath = gmsApiPath
    ? gmsApiPath.startsWith('/')
      ? gmsApiPath
      : `/${gmsApiPath}`
    : '';
  return `${window.location.protocol}//${host}${port ? `:${port}` : ''}${normalizedPath}`;
}

export default function App() {
  const [datahubHost] = useState<string>(DEFAULT_DATAHUB_HOST);
  const [datahubPort] = useState<string>(DEFAULT_DATAHUB_PORT);
  const [gmsApiPath] = useState<string>(DEFAULT_GMS_API_PATH);
  const [datahubUiBaseUrl, setDatahubUiBaseUrl] = useState<string>(DEFAULT_DATAHUB_UI_BASE_URL);
  const [datahubUiRouteMode, setDatahubUiRouteMode] = useState<DatahubUiRouteMode>(DEFAULT_DATAHUB_UI_ROUTE_MODE);
  const [token, setToken] = useState<string>(DEFAULT_DATAHUB_TOKEN);
  const [urnInput, setUrnInput] = useState<string>('');
  const [centerId, setCenterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string>('');
  const [entitiesByUrn, setEntitiesByUrn] = useState<Record<string, DatahubObject>>({});
  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [navStack, setNavStack] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('structure');
  const [structureFilter, setStructureFilter] = useState<string>('');
  const [showAuth, setShowAuth] = useState<boolean>(false);
  const svgWidth = 980;
  const svgHeight = 660;
  const gmsBaseUrl = useMemo(() => buildGmsBaseUrl(datahubHost, datahubPort, gmsApiPath), [datahubHost, datahubPort, gmsApiPath]);

  async function copyUrn(urn: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(urn);
    } catch {
      // no-op fallback for blocked clipboard APIs
    }
  }

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
      const centerEntity = await fetchEntity(gmsBaseUrl, trimmedUrn, { token });
      const [incoming, outgoing] = await Promise.all([
        fetchRelationships(gmsBaseUrl, centerEntity.id, 'INCOMING', { token }),
        fetchRelationships(gmsBaseUrl, centerEntity.id, 'OUTGOING', { token })
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
            return await fetchEntity(gmsBaseUrl, neighborUrn, { token });
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
      if (error instanceof DatahubApiError) {
        const attempts = error.attemptedEndpoints?.join(', ') ?? error.endpoint ?? 'unknown endpoint';
        const details = error.details ? ` Details: ${error.details}` : '';
        setInputError(`${error.message} Attempted: ${attempts}.${details}`);
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch from GMS.';
        setInputError(message);
      }
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

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.object.id, node])), [graph.nodes]);
  const selectedObject = centerId ? entitiesByUrn[centerId] : undefined;

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
      <JsonPanel
        selectedObject={selectedObject}
        isLoading={isLoading}
        onUrnNavigate={(urn) => {
          void loadNeighborhood(urn, { mode: 'node' });
        }}
        onCopyUrn={(urn) => {
          void copyUrn(urn);
        }}
        datahubUiBaseUrl={datahubUiBaseUrl}
        datahubUiRouteMode={datahubUiRouteMode}
      />

      <section
        style={{
          order: 1,
          flex: '1 1 420px',
          height: 'calc(100vh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
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
                minWidth: '220px',
                flex: '2 1 280px',
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
            <button
              type="button"
              onClick={() => setShowAuth((value) => !value)}
              style={{
                border: '1px solid #c7d2e8',
                borderRadius: '8px',
                background: showAuth ? '#dbeafe' : '#ffffff',
                color: '#1e3a8a',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '0.45rem 0.7rem'
              }}
            >
              {showAuth ? 'Hide Auth' : 'Auth'}
            </button>
          </div>
          {showAuth && (
            <div style={{ marginTop: '0.55rem', display: 'grid', gap: '0.45rem' }}>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Optional bearer token for GMS"
                style={{
                  width: 'min(420px, 100%)',
                  border: '1px solid #c7d2e8',
                  borderRadius: '8px',
                  padding: '0.45rem 0.6rem',
                  fontSize: '0.82rem'
                }}
              />
              <input
                value={datahubUiBaseUrl}
                onChange={(event) => setDatahubUiBaseUrl(event.target.value)}
                placeholder="DataHub UI base URL"
                style={{
                  width: 'min(420px, 100%)',
                  border: '1px solid #c7d2e8',
                  borderRadius: '8px',
                  padding: '0.45rem 0.6rem',
                  fontSize: '0.82rem'
                }}
              />
              <label style={{ display: 'grid', gap: '0.25rem', width: 'min(420px, 100%)', color: '#334155', fontSize: '0.78rem' }}>
                DataHub UI route mode
                <select
                  value={datahubUiRouteMode}
                  onChange={(event) => setDatahubUiRouteMode(normalizeDatahubUiRouteMode(event.target.value))}
                  style={{
                    border: '1px solid #c7d2e8',
                    borderRadius: '8px',
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.82rem',
                    background: '#ffffff'
                  }}
                >
                  <option value="type">type (e.g. /dataset/&lt;urn&gt;)</option>
                  <option value="entity">entity (e.g. /entity/&lt;urn&gt;)</option>
                  <option value="search">search (e.g. /search?query=&lt;urn&gt;)</option>
                </select>
              </label>
            </div>
          )}
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
              flex: 1,
              minHeight: 0,
              display: 'grid',
              placeItems: 'center',
              color: '#4b5f7f',
              fontSize: '0.95rem'
            }}
          >
            Graph is empty. Enter a URN and click Connect.
          </div>
        ) : viewMode === 'structure' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0.9rem' }}>
            <StructurePanel
              sections={structureSections}
              entitiesByUrn={entitiesByUrn}
              onNavigate={(urn) => {
                void loadNeighborhood(urn, { mode: 'node' });
              }}
              onCopyUrn={(urn) => {
                void copyUrn(urn);
              }}
              datahubUiBaseUrl={datahubUiBaseUrl}
              datahubUiRouteMode={datahubUiRouteMode}
            />
          </div>
        ) : (
          <GraphPanel
            svgWidth={svgWidth}
            svgHeight={svgHeight}
            graph={graph}
            nodeById={nodeById}
            neighborhood={neighborhood}
            onNodeNavigate={(urn) => {
              void loadNeighborhood(urn, { mode: 'node' });
            }}
          />
        )}
      </section>
    </div>
  );
}
