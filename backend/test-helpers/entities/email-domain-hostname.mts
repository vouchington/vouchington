import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Raw fixture primitive; production addresses use the shared service resolver. */
export async function upsertTestEmailDomainHostnameId(
  emailAddress: string,
  options: QueryOptions = {},
): Promise<string> {
  const domain = emailAddress.split('@', 2)[1]?.toLowerCase()
  if (!domain) throw new Error('Test email address has no domain')
  return upsertTestHostnameId(domain, options)
}

export async function upsertTestHostnameId(
  hostname: string,
  options: QueryOptions = {},
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    sql`/* upsertTestHostnameId */
      INSERT INTO url_hostnames (hostname)
      VALUES (${new URL(`https://${hostname}`).hostname})
      ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
      RETURNING id
    `,
    options,
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Test email domain hostname upsert returned no ID')
  return id
}
