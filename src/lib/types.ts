export type DatahubObject = {
  id: string;
  type: string;
  name: string;
  raw: unknown;
};

export type RelationshipEdge = {
  sourceId: string;
  targetId: string;
  type: string;
};

export type PositionedNode = {
  object: DatahubObject;
  x: number;
  y: number;
  role: 'center' | 'parent' | 'dependency' | 'both' | 'previous';
};

export type Neighborhood = {
  centerUrn: string;
  previousUrn: string | null;
  parentUrns: Set<string>;
  dependencyUrns: Set<string>;
  aspectLabelsByUrn: Record<string, string[]>;
  edges: RelationshipEdge[];
};

export type GraphLane = {
  label: string;
  startAngle: number;
  endAngle: number;
  color: string;
};

export type NavigationMode = 'connect' | 'node' | 'breadcrumb';
export type ViewMode = 'graph' | 'structure';

