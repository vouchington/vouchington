export function normalizePostPublicationIdentifiers(ids: Iterable<string> | undefined): string[] {
  if (!ids) return []
  const normalized = [...ids]
  if (normalized.some(id => typeof id !== 'string' || id.length === 0))
    throw new TypeError('Post publication identifiers must be non-empty strings')
  return [...new Set(normalized)].toSorted()
}
