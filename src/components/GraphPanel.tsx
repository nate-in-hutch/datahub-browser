import React from 'react';
import type { GraphLane, Neighborhood, PositionedNode, RelationshipEdge } from '../lib/types';

function getRoleColor(role: PositionedNode['role']): string {
  if (role === 'center') return '#1d4ed8';
  if (role === 'previous') return '#7c3aed';
  if (role === 'parent') return '#b45309';
  if (role === 'both') return '#0f766e';
  return '#2563eb';
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

type GraphPanelProps = {
  svgWidth: number;
  svgHeight: number;
  graph: {
    nodes: PositionedNode[];
    edges: RelationshipEdge[];
    lanes: GraphLane[];
  };
  nodeById: Map<string, PositionedNode>;
  neighborhood: Neighborhood | null;
  onNodeNavigate: (urn: string) => void;
};

export function GraphPanel({ svgWidth, svgHeight, graph, nodeById, neighborhood, onNodeNavigate }: GraphPanelProps) {
  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'calc(100% - 140px)' }}>
      {graph.lanes.map((lane) => {
        const centerX = svgWidth / 2;
        const centerY = svgHeight / 2;
        const innerRadius = Math.min(svgWidth, svgHeight) * 0.39;
        const outerRadius = Math.min(svgWidth, svgHeight) * 0.47;
        const midAngle = (lane.startAngle + lane.endAngle) / 2;
        const labelPoint = polarToCartesian(centerX, centerY, outerRadius + 14, midAngle);
        const labelAnchor = Math.cos(midAngle) > 0.3 ? 'start' : Math.cos(midAngle) < -0.3 ? 'end' : 'middle';

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
            <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#4f7ecf" strokeOpacity={0.45} strokeWidth={2} />
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

      {graph.nodes.map((node) => {
        const aspectLabel = neighborhood?.aspectLabelsByUrn[node.object.id]?.[0];
        return (
          <g
            key={node.object.id}
            onClick={() => {
              onNodeNavigate(node.object.id);
            }}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onNodeNavigate(node.object.id);
              }
            }}
          >
            <title>{node.object.id}</title>
            {node.role === 'previous' && <circle cx={node.x} cy={node.y} r={60} fill="none" stroke="#7c3aed" strokeWidth={3} strokeOpacity={0.35} />}
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
      })}
    </svg>
  );
}

