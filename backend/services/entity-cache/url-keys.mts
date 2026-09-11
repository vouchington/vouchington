import { read } from '@data-stores/psql'
import { isUUID, normalizeUrlForUrlTable } from '@modules/utils'
import { isHostname } from '@ts-shared/utils/urls'
import { normalizeKey } from '@ts-shared/utils/strings'
import { getCacheKeys } from './keys.mts'

// Split out of keys.mts (concern: URL/hostname key resolution) to keep keys.mts under the
// scc-complexity budget; re-exported from keys.mts so `@services/entity-cache/keys` consumers
// resolve unchanged.
export const getUrlCacheKeys = (...keys: unknown[]): Promise<string[]> => {
  // UUID keys are used by the urls entity cache (keyed by entity ID).
  const { ids } = getCacheKeys(keys)
  return Promise.resolve([...ids])
}

export const getUrlLookupKeys = (...keys: unknown[]): Promise<string[]> => {
  // urls_lookup is keyed by URL string (not UUID), so only URL strings are valid keys.
  // Extracts: bare URL strings and the `url` field from URL entity objects.
  // Apply URL-table normalization so fragment-bearing inputs evict the same cache key
  // as their stored base URL.
  const urlStrings: string[] = (keys.flat(Infinity) as unknown[]).flatMap((x: unknown) => {
    let raw: string | null = null
    if (typeof x === 'string') raw = x.trim()
    else if (typeof x === 'object' && x !== null) {
      const url = (x as Record<string, unknown>).url
      if (typeof url === 'string') raw = url.trim()
    }
    if (!raw) return []
    try {
      return [normalizeUrlForUrlTable(raw).toString()]
    } catch {
      return []
    }
  })
  return Promise.resolve([...new Set(urlStrings)])
}

// Some callers (e.g. topics/update.mts) only have the hostname UUID at invalidation time.
// Resolves both id and hostname forms (mirroring getUserCacheKeys/getTopicCacheKeys). Normalizes
// before classifying, since isHostname's charset excludes uppercase.
export const getUrlHostnameCacheKeys = async (...keys: unknown[]): Promise<string[]> => {
  const inputs = (keys.flat(Infinity) as unknown[]).flatMap((x: unknown) => {
    if (typeof x === 'string') return x !== '' ? [normalizeKey(x)] : []
    if (typeof x !== 'object' || x === null) return []
    const obj = x as Record<string, unknown>
    return [obj.id, obj.hostname].flatMap(v =>
      typeof v === 'string' && v !== '' ? [normalizeKey(v)] : [],
    )
  })
  const ids = new Set(inputs.filter(isUUID))
  const hostnames = new Set(inputs.filter(k => !isUUID(k) && isHostname(k) && k.includes('.')))
  if (!(ids.size > 0 || hostnames.size > 0)) return []
  const filters = []
  const values = []
  if (ids.size > 0) filters.push(`id = ANY($${values.push([...ids])})`)
  if (hostnames.size > 0) filters.push(`LOWER(hostname) = ANY($${values.push([...hostnames])})`)
  const { rows } = await read(
    `/* getUrlHostnameCacheKeys */
    SELECT id, hostname
    FROM url_hostnames
    WHERE ${filters.join(' OR ')}
  `,
    values,
  )
  for (const row of rows) {
    ids.add(normalizeKey(row.id))
    if (row.hostname) hostnames.add(normalizeKey(row.hostname))
  }

  return [...ids, ...hostnames]
}
