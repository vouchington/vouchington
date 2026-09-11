export const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

export function addToMapSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>()
  values.add(value)
  map.set(key, values)
}

export function matchNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap(match => (match[1] ? [match[1]] : []))
}

export function sorted(values: Iterable<string>): string[] {
  return [...values].toSorted((a, b) => a.localeCompare(b))
}

export function shouldSkipFile(file: string): boolean {
  return (
    file === 'backend/data-stores/psql/schema-snapshot/schema.json' ||
    file.startsWith('.agents/') ||
    file.includes('/node_modules/') ||
    file === 'pnpm-lock.yaml' ||
    file.includes('.test.') ||
    file.includes('.mock.') ||
    file.includes('.spec.') ||
    file.includes('.fixture.') ||
    file.includes('/__fixtures__/') ||
    file.includes('/fixtures/') ||
    file.endsWith('.lock') ||
    file.endsWith('.png') ||
    file.endsWith('.jpg') ||
    file.endsWith('.jpeg') ||
    file.endsWith('.webp') ||
    file.endsWith('.gif') ||
    file.endsWith('.pdf') ||
    file.endsWith('.zip')
  )
}
