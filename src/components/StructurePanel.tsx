import React, { useState } from 'react';
import { parseUrnName, parseUrnType } from '../lib/urn';
import type { DatahubObject, DatahubUiRouteMode } from '../lib/types';
import { buildDatahubEntityUrlWithMode } from '../lib/urls';

type StructureSection = {
  title: string;
  items: Array<{ urn: string; aspectLabel?: string }>;
};

type StructurePanelProps = {
  sections: StructureSection[];
  entitiesByUrn: Record<string, DatahubObject>;
  onNavigate: (urn: string) => void;
  onCopyUrn: (urn: string) => void;
  datahubUiBaseUrl: string;
  datahubUiRouteMode: DatahubUiRouteMode;
};

function SectionList({
  items,
  entitiesByUrn,
  onNavigate,
  onCopyUrn,
  datahubUiBaseUrl,
  datahubUiRouteMode
}: {
  items: Array<{ urn: string; aspectLabel?: string }>;
  entitiesByUrn: Record<string, DatahubObject>;
  onNavigate: (urn: string) => void;
  onCopyUrn: (urn: string) => void;
  datahubUiBaseUrl: string;
  datahubUiRouteMode: DatahubUiRouteMode;
}) {
  const [pageSize, setPageSize] = useState(100);
  const visibleItems = items.slice(0, pageSize);

  return (
    <div>
      <div
        style={{
          border: '1px solid #dbe4f4',
          borderRadius: '8px',
          background: '#ffffff'
        }}
      >
        <div>
          {visibleItems.map((item, index) => {
            const entity = entitiesByUrn[item.urn];
            const openEntityUrl = buildDatahubEntityUrlWithMode(datahubUiBaseUrl, item.urn, datahubUiRouteMode);
            return (
              <div
                key={item.urn}
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid #e5edf9',
                  padding: '0.55rem 0.65rem'
                }}
              >
                <button
                  type="button"
                  onClick={() => onNavigate(item.urn)}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                >
                  <div style={{ fontSize: '0.84rem', color: '#0f172a', fontWeight: 600 }}>
                    {entity?.type ?? parseUrnType(item.urn)}: {entity?.name ?? parseUrnName(item.urn)}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#51617b', marginTop: '0.15rem' }}>{item.urn}</div>
                </button>
                <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onCopyUrn(item.urn)} style={{ border: '1px solid #d1d9e8', borderRadius: '5px', fontSize: '0.68rem', background: '#f8fbff', padding: '0.1rem 0.35rem', cursor: 'pointer' }}>
                    Copy
                  </button>
                  <a href={openEntityUrl} target="_blank" rel="noreferrer" style={{ border: '1px solid #d1d9e8', borderRadius: '5px', fontSize: '0.68rem', background: '#f8fbff', padding: '0.1rem 0.35rem', color: '#1e3a8a', textDecoration: 'none' }}>
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pageSize < items.length && (
        <button
          type="button"
          onClick={() => setPageSize((value) => value + 100)}
          style={{
            marginTop: '0.45rem',
            border: '1px solid #cdd9ef',
            borderRadius: '6px',
            background: '#f8fbff',
            color: '#1f2a44',
            fontSize: '0.77rem',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer'
          }}
        >
          Load more ({items.length - pageSize} remaining)
        </button>
      )}
    </div>
  );
}

export function StructurePanel({ sections, entitiesByUrn, onNavigate, onCopyUrn, datahubUiBaseUrl, datahubUiRouteMode }: StructurePanelProps) {
  if (sections.length === 0) {
    return <p style={{ margin: 0, color: '#526581', fontSize: '0.9rem' }}>No matching relationships for this filter.</p>;
  }

  return (
    <>
      {sections.map((section) => (
        <div key={section.title} style={{ marginBottom: '0.9rem' }}>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.86rem', color: '#1f2a44' }}>{section.title}</h3>
          <SectionList
            items={section.items}
            entitiesByUrn={entitiesByUrn}
            onNavigate={onNavigate}
            onCopyUrn={onCopyUrn}
            datahubUiBaseUrl={datahubUiBaseUrl}
            datahubUiRouteMode={datahubUiRouteMode}
          />
        </div>
      ))}
    </>
  );
}
