import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/aside-preferences/README.md`.
 */
export async function getDismissedAsides(userId: string): Promise<Set<string>> {
  const { rows } = await read(sql`/* getDismissedAsides */
    SELECT aside_key
    FROM user_aside_preferences
    WHERE user_id = ${userId}
  `)

  const result = new Set<string>()
  for (const row of rows) {
    result.add(row.aside_key as string)
  }
  return result
}
