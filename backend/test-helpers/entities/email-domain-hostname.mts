import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Raw fixture primitive; production addresses use the shared service resolver. */
export async function upsertTestEmailDomainHostnameId(
  emailAddress: string,
  options: QueryOptions = {},
): Promise<string> {
  const domain = emailAddress.slice(emailAddress.lastIndexOf('@') + 1).toLowerCase()
  if (!domain) throw new Error('Test email address has no domain')
  return upsertTestHostnameId(domain, options, 'private_email')
}

export async function upsertTestHostnameId(
  hostname: string,
  options: QueryOptions = {},
  provenance: 'public' | 'private_email' = 'public',
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    sql`/* upsertTestHostnameId */
      INSERT INTO url_hostnames (hostname, publicly_introduced_at)
      VALUES (${new URL(`https://${hostname}`).hostname}, CASE WHEN ${provenance === 'public'}::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT (hostname) DO UPDATE SET
        publicly_introduced_at = COALESCE(url_hostnames.publicly_introduced_at, EXCLUDED.publicly_introduced_at)
      RETURNING id
    `,
    options,
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Test email domain hostname upsert returned no ID')
  return id
}

export async function readTestEmailDomainHostname(id: string): Promise<string | null> {
  const { rows } = await read<{ hostname: string }>(sql`/* readTestEmailDomainHostname */
    SELECT hostname FROM url_hostnames WHERE id = ${id}`)
  return rows[0]?.hostname ?? null
}
