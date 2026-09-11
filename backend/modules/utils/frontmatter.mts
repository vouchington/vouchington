import { toFrontmatter as serializeFrontmatter } from '@vouchington/frontmatter'

function normalizeScalarValue(value: unknown): unknown {
  if (value instanceof Date) return value
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value
  }
  return String(value)
}

function normalizeArrayItem(value: unknown): unknown {
  if (value == null) return undefined
  if (typeof value === 'object' && !(value instanceof Date)) {
    const entries: [string, unknown][] = []
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryValue == null) continue
      entries.push([key, normalizeScalarValue(entryValue)])
    }
    if (entries.length === 0) return undefined
    return Object.fromEntries(entries)
  }
  return normalizeScalarValue(value)
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const normalizedEntries: [string, unknown][] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      const normalizedItems: unknown[] = []
      for (const item of value) {
        const normalizedItem = normalizeArrayItem(item)
        if (normalizedItem == null) continue
        normalizedItems.push(normalizedItem)
      }
      if (normalizedItems.length === 0) continue
      normalizedEntries.push([key, normalizedItems])
      continue
    }
    normalizedEntries.push([key, normalizeScalarValue(value)])
  }
  return Object.fromEntries(normalizedEntries)
}

export function toFrontmatter(fields: Record<string, unknown>): string {
  return serializeFrontmatter(normalizeFields(fields))
}
