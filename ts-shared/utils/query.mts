import {
  parseBooleanish,
  parseNumberParam as parseGenericNumberParam,
  parseStringArray as parseGenericStringArray,
} from '@vouchington/utils/query'

export { parseBooleanish }

export function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : parseGenericStringArray(value)
}

export function parseNumberParam(query: Record<string, unknown>, key: string): number | undefined {
  const input = query[key]
  if (input === undefined) return undefined
  if (input === null || (typeof input === 'string' && input.trim() === '')) {
    return Number(input)
  }
  return parseGenericNumberParam(query, key)
}

export function parseNumberParams(
  query: Record<string, unknown>,
  keys: string[],
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const key of keys) {
    const value = parseNumberParam(query, key)
    if (value !== undefined) result[key] = value
  }
  return result
}
