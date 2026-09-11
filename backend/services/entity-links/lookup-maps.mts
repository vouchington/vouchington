export function createLookupMap<T>(identifiers: string[], results: Array<T | null>) {
  const map = new Map<string, T | null>()
  for (let i = 0; i < identifiers.length; i++) {
    map.set(identifiers[i], results[i] ?? null)
  }
  return map
}
