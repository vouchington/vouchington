import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { resolveBlocklist } from '@services/urls-domains-blacklist/blocklist-lookup'

/** Blocked for crawling: not crawlable, flagged blocked, or in a URL-type blocklist source. */
export async function checkDomainBlacklisted(domain: string): Promise<boolean> {
  const key = domain.toLowerCase().trim()
  const groups = [{ key, candidates: [key] }]
  const result = await resolveBlocklist({
    groups,
    readLocal: async () => {
      const { rows } = await read(sql`/* checkDomainBlacklisted */
        SELECT EXISTS (
          SELECT 1 FROM url_hostnames
          WHERE hostname = ${key}
            AND (NOT is_crawlable OR is_blocked)
        ) AS is_blocked
      `)
      return new Map([[key, { is_blocked: rows[0].is_blocked === true }]])
    },
    readFull: async () => {
      const { rows } = await read(sql`/* checkDomainBlacklisted */
        SELECT EXISTS (
          SELECT 1 FROM url_hostnames
          WHERE hostname = ${key}
            AND (NOT is_crawlable OR is_blocked)
        ) OR EXISTS (
          SELECT 1 FROM blocklisted_domains db
          INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
          WHERE db.domain = ${key} AND dbs.type = 'url'::domain_blocklist_types
        ) AS is_blocked
      `)
      return new Map([[key, { is_blocked: rows[0].is_blocked === true }]])
    },
  })
  return result.get(key)?.is_blocked === true
}
