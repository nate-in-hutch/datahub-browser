export function parseUrnType(urn: string): string {
  const match = urn.match(/^urn:li:([^:]+):/);
  return match ? match[1] : 'entity';
}

export function parseUrnName(urn: string): string {
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

export function extractUrnsFromJson(value: unknown, results: Set<string> = new Set<string>()): Set<string> {
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

export function extractAspectUrnGroups(raw: unknown): Map<string, Set<string>> {
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

