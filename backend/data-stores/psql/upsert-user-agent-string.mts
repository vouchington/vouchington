import sql from 'sql-template-strings'
import { write } from './clients.mts'
import type { QueryOptions } from './types.mts'

/** Explicit empty strings represent unknown session agents; null inputs have no row. */
export async function upsertUserAgentString(
  userAgent: string | null | undefined,
  options: QueryOptions = {},
): Promise<string | null> {
  if (userAgent === null || userAgent === undefined) return null
  const normalized = userAgent.trim().slice(0, 1024).trim()
  await write(
    sql`/* upsertUserAgentString */
      INSERT INTO user_agent_strings (user_agent)
      VALUES (${normalized})
      ON CONFLICT (user_agent) DO NOTHING`,
    options,
  )
  // A separate statement sees a concurrent inserter after ON CONFLICT waits for it.
  const { rows } = await write(
    sql`/* upsertUserAgentString */
      SELECT id FROM user_agent_strings WHERE user_agent = ${normalized}`,
    options,
  )
  return (rows[0] as { id: string } | undefined)?.id ?? null
}
