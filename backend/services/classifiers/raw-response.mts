/** Serializes a provider response with recursively sorted object keys so equal responses compare equal. */
export function serializeClassifierRawResponse(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value))
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Classifier raw response must be JSON serializable')
    return value
  }
  if (Array.isArray(value)) return value.map(normalizeJsonValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJsonValue(child)]),
    )
  }
  throw new Error('Classifier raw response must be JSON serializable')
}
