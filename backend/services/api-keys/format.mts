export const BRAND_PREFIX = 'voucha_'
export const API_KEY_TYPES = ['rss', 'mcp'] as const
export type ApiKeyType = (typeof API_KEY_TYPES)[number]

// Format: voucha_<type>_<32 hex random>_<16 hex checksum>
export function formatApiKey(type: ApiKeyType, random: string, checksum: string): string {
  return `${BRAND_PREFIX}${type}_${random}_${checksum}`
}

// Returns null for any structural failure
export function parseApiKey(
  rawKey: string,
): { type: ApiKeyType; random: string; checksum: string } | null {
  if (!rawKey.startsWith(BRAND_PREFIX)) return null
  const withoutBrand = rawKey.slice(BRAND_PREFIX.length) // "rss_<random>_<checksum>"
  const underscoreIdx = withoutBrand.indexOf('_')
  if (underscoreIdx === -1) return null
  const type = withoutBrand.slice(0, underscoreIdx)
  if (!(API_KEY_TYPES as readonly string[]).includes(type)) return null
  const rest = withoutBrand.slice(underscoreIdx + 1) // "<random>_<checksum>"
  const lastUnderscore = rest.lastIndexOf('_')
  if (lastUnderscore === -1) return null
  const random = rest.slice(0, lastUnderscore)
  const checksum = rest.slice(lastUnderscore + 1)
  if (!/^[0-9a-f]{32}$/.test(random)) return null
  if (!/^[0-9a-f]{16}$/.test(checksum)) return null
  return { type: type as ApiKeyType, random, checksum }
}
