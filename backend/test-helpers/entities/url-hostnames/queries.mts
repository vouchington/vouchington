import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getCrawlableHostnames(hostnameIds: string[]): Promise<Array<{ id: string }>> {
  if (hostnameIds.length === 0) return []
  const result = await read(sql`
    SELECT id
    FROM url_hostnames
    WHERE crawlable = true
      AND blocked = false
      AND id = ANY(${hostnameIds})
  `)
  return result.rows
}

export async function isHostnameDispatchable(hostname: string): Promise<boolean> {
  const result = await read(sql`
    SELECT 1 FROM url_hostnames uh
    WHERE uh.hostname = ${hostname}
      AND uh.crawlable = true
      AND uh.blocked = false
      AND NOT EXISTS (
        SELECT 1 FROM domain_blacklists db
        JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
        WHERE db.domain = uh.hostname AND dbs.type = 'url'::domain_blacklist_types
      )
    LIMIT 1
  `)
  return result.rows.length > 0
}

export async function getUrlHostnameTopicId(hostnameId: string): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT topic_id
    FROM url_hostnames
    WHERE id = ${hostnameId}
  `)
  return (rows[0]?.topic_id as string | null | undefined) ?? null
}

export type TestUrlHostnameRow = {
  id: string
  hostname: string
  blocked: boolean
  blocked_at: Date | null
  blocked_by_id: string | null
}

export async function getTestHostnameRow(
  hostnameId: string,
): Promise<TestUrlHostnameRow | undefined> {
  const { rows } = await read(sql`/* getTestHostnameRow */
    SELECT
      uh.id,
      uh.hostname,
      uh.blocked,
      uhb.created_at AS blocked_at,
      uhb.blocked_by_id
    FROM url_hostnames uh
    LEFT JOIN LATERAL (
      SELECT created_at, blocked_by_id
      FROM url_hostname_blocks
      WHERE url_hostname_id = uh.id
        AND lifted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    ) uhb ON true
    WHERE uh.id = ${hostnameId}
  `)
  return rows[0] as TestUrlHostnameRow | undefined
}
