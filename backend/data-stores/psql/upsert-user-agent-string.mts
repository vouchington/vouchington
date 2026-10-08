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
  // Rows are never deleted or changed, so a hit is final: one round trip in the common case.
  // The read uses the caller's transaction so it sees rows that transaction already inserted.
  const existing = await write(
    sql`/* upsertUserAgentString */
      SELECT id FROM user_agent_strings WHERE user_agent = ${normalized}`,
    options,
  )
  const existingId = (existing.rows[0] as { id: string } | undefined)?.id
  if (existingId !== undefined) return existingId
  await write(
    sql`/* upsertUserAgentString */
      INSERT INTO user_agent_strings (user_agent)
      VALUES (${normalized})
      ON CONFLICT (user_agent) DO NOTHING`,
    options,
  )
  // A separate statement sees a concurrent inserter after ON CONFLICT waits for it. Do not merge
  // the insert and read into one statement: its snapshot would miss that concurrently committed row.
  const { rows } = await write(
    sql`/* upsertUserAgentString */
      SELECT id FROM user_agent_strings WHERE user_agent = ${normalized}`,
    options,
  )
  return (rows[0] as { id: string } | undefined)?.id ?? null
}
