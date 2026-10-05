import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { checkBloomFilters } from './bloom-filter.mts'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  getHostnamePolicyCandidates,
  getLocalHostnamePolicy,
} from '@services/urls-hostnames/policies'

export { normalizeDomain } from './normalize-domain.mts'

export async function isUrlBlocked(hostname: string, options: QueryOptions = {}): Promise<boolean> {
  const normalizedHostname = hostname.toLowerCase().trim()
  const candidates = getHostnamePolicyCandidates(normalizedHostname)
  if (candidates.length === 0) return false

  // Check feature flag — disabled means bloom filter always passes through to DB
  const enabled = bloomFilterConfig.fields.get('urlBlocklistBloomFilterEnabled') !== false

  const requiresAuthoritativeRead =
    options.client !== undefined || options.query !== undefined || options.readOnly === false
  if (enabled && !requiresAuthoritativeRead) {
    const bloomResults = await checkBloomFilters(candidates)
    if (bloomResults.every(result => result === false)) {
      const localPolicy = await getLocalHostnamePolicy(normalizedHostname, options)
      return localPolicy.is_blocked
    }
  }

  // Bloom filter says "maybe" or is disabled — confirm with DB
  const result = await read(
    sql`/* isUrlBlocked */
    SELECT EXISTS (
      SELECT 1
      FROM url_hostnames
      WHERE hostname = ANY(${candidates}::text[])
        AND is_blocked = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM blocklisted_domains db
      INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
      WHERE db.domain = ANY(${candidates}::text[])
        AND dbs.type = 'url'::domain_blocklist_types
    ) AS is_blocked
  `,
    options,
  )

  return result.rows[0].is_blocked
}
