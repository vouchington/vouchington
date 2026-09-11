import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { checkBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'

export async function checkDomainBlacklisted(domain: string): Promise<boolean> {
  const normalizedDomain = domain.toLowerCase().trim()

  // Fast path: bloom filter says definitely not in domain_blacklists
  // Skip the domain_blacklists query entirely; only check url_hostnames flags (separate state)
  const bloomResult = await checkBloomFilter(normalizedDomain)
  if (bloomResult === false) {
    const { rows } = await read(sql`/* checkDomainBlacklisted */
      SELECT 1 FROM url_hostnames
      WHERE hostname = ${normalizedDomain}
        AND (crawlable = FALSE OR blocked = TRUE)
      LIMIT 1
    `)
    return rows.length > 0
  }

  // Bloom filter says "maybe" or unavailable — run full query including domain_blacklists
  const { rows } = await read(sql`/* checkDomainBlacklisted */
    SELECT 1
    WHERE EXISTS (
      SELECT 1 FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE db.domain = ${normalizedDomain} AND dbs.type = 'url'::domain_blacklist_types
    ) OR EXISTS (
      SELECT 1 FROM url_hostnames
      WHERE hostname = ${normalizedDomain}
        AND (crawlable = FALSE OR blocked = TRUE)
    )
    LIMIT 1
  `)

  return rows.length > 0
}
