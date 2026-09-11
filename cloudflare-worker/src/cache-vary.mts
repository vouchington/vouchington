export const INTERNAL_CACHE_VARY_HEADER = 'x-voucha-cache-vary'

const SAFE_CACHE_VARY_TOKENS = new Map(
  [
    'Cookie',
    'Authorization',
    'Accept-Encoding',
    'Accept-Language',
    'RSC',
    'Next-Router-State-Tree',
    'Next-Router-Prefetch',
    'Next-Router-Segment-Prefetch',
    'Next-Url',
  ].map(token => [token.toLowerCase(), token]),
)

/** Returns canonical safe tokens, or null when the Vary value must not enter Workers Cache. */
export function parseSafeCacheVary(value: string | null): string[] | null {
  if (value === null) return []

  const tokens: string[] = []
  const seen = new Set<string>()
  for (const rawToken of value.split(',')) {
    const key = rawToken.trim().toLowerCase()
    if (!key) continue
    const canonical = SAFE_CACHE_VARY_TOKENS.get(key)
    if (!canonical) return null
    if (seen.has(key)) continue
    seen.add(key)
    tokens.push(canonical)
  }
  return tokens
}

/** Merges additions into a client-facing Vary value without changing existing token spelling. */
export function mergeClientVary(
  existing: string | null,
  additions: readonly string[],
): string | null {
  const existingTokens = existing?.split(',').map(token => token.trim()) ?? []
  if (existingTokens.some(token => token === '*')) return '*'

  const merged = existingTokens.filter(Boolean)
  const seen = new Set(merged.map(token => token.toLowerCase()))
  for (const token of additions) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(token)
  }
  return merged.length > 0 ? merged.join(', ') : null
}
