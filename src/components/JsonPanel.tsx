import React from 'react';
import type { DatahubObject } from '../lib/types';

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

  return segments
    .map((segment, index) => {
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
    })
    .filter(Boolean) as React.ReactNode[];
}

type JsonPanelProps = {
  selectedObject?: DatahubObject;
  isLoading: boolean;
  onUrnNavigate: (urn: string) => void;
  onCopyUrn: (urn: string) => void;
  datahubUiBaseUrl: string;
};

export function JsonPanel({ selectedObject, isLoading, onUrnNavigate, onCopyUrn, datahubUiBaseUrl }: JsonPanelProps) {
  const selectedJsonText = selectedObject ? JSON.stringify(selectedObject.raw, null, 2) : '';
  const openEntityUrl = selectedObject ? `${datahubUiBaseUrl.replace(/\/$/, '')}/entity/${encodeURIComponent(selectedObject.id)}` : '';

  return (
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
      <header style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #243049', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Selected Node JSON</h2>
        {selectedObject && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => onCopyUrn(selectedObject.id)}
              style={{ border: '1px solid #334155', borderRadius: '6px', background: '#111f37', color: '#cfe0ff', fontSize: '0.75rem', padding: '0.25rem 0.45rem', cursor: 'pointer' }}
            >
              Copy URN
            </button>
            <a
              href={openEntityUrl}
              target="_blank"
              rel="noreferrer"
              style={{ border: '1px solid #334155', borderRadius: '6px', background: '#111f37', color: '#cfe0ff', fontSize: '0.75rem', padding: '0.25rem 0.45rem', textDecoration: 'none' }}
            >
              Open in DataHub
            </a>
          </div>
        )}
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
          ? renderJsonWithUrnLinks(
              selectedJsonText,
              (urn) => {
                onUrnNavigate(urn);
              },
              isLoading,
              selectedObject.id
            )
          : 'No node selected. Connect with a URN first.'}
      </pre>
    </aside>
  );
}

