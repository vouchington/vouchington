export function asIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Post revision ${field} must be an array of ids`)
  }
  return value
}

export function asText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`Post revision ${field} must be text or null`)
}

export function asEnum(value: unknown, field: string, allowed: Set<string>): string | null {
  if (value === null) return null
  if (typeof value === 'string' && allowed.has(value)) return value
  throw new Error(`Post revision ${field} has an unknown value`)
}

export function asBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  throw new Error(`Post revision ${field} must be boolean or null`)
}

export function asTimestamp(
  value: unknown,
  field: string,
): { at: Date | null; sentinel: string | null } {
  if (value === null) return { at: null, sentinel: null }
  if (value === 'now') return { at: null, sentinel: 'now' }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { at: value, sentinel: null }
  throw new Error(`Post revision ${field} must be a timestamp, now, or null`)
}
