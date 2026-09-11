import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { checkBloomFilter } from './bloom-filter.mts'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  getHostnamePolicyCandidates,
  getLocalHostnamePolicy,
} from '@services/urls-hostnames/policies'

// Simple domain validation regex - checks for basic domain format
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

export function normalizeDomain(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Skip comments (lines starting with #)
  if (trimmed.startsWith('#')) return null

  const domain = trimmed.toLowerCase()

  // Basic domain format validation
  if (!DOMAIN_REGEX.test(domain)) return null

  return domain
}

export async function isUrlBlocked(hostname: string, options: QueryOptions = {}): Promise<boolean> {
  const normalizedHostname = hostname.toLowerCase().trim()
  const candidates = getHostnamePolicyCandidates(normalizedHostname)
  if (candidates.length === 0) return false

  // Check feature flag — disabled means bloom filter always passes through to DB
  const enabled = bloomFilterConfig.fields.get('urlBlocklistBloomFilterEnabled') !== false

  const requiresAuthoritativeRead =
    options.client !== undefined || options.query !== undefined || options.readOnly === false
  if (enabled && !requiresAuthoritativeRead) {
    // Fast path: bloom filter says definitely not in blocklist
    const bloomResults = await Promise.all(candidates.map(candidate => checkBloomFilter(candidate)))
    if (bloomResults.every(result => result === false)) {
      const localPolicy = await getLocalHostnamePolicy(normalizedHostname, options)
      return localPolicy.blocked
    }
  }

  // Bloom filter says "maybe" or is disabled — confirm with DB
  const result = await read(
    sql`/* isUrlBlocked */
    SELECT EXISTS (
      SELECT 1
      FROM url_hostnames
      WHERE hostname = ANY(${candidates}::text[])
        AND blocked = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE db.domain = ANY(${candidates}::text[])
        AND dbs.type = 'url'::domain_blacklist_types
    ) AS is_blocked
  `,
    options,
  )

  return result.rows[0].is_blocked
}
