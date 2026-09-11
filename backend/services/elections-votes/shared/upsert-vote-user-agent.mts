import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Upserts a user agent string into the vote_user_agents lookup table and returns its UUID.
 * Trims and truncates to satisfy CHECK constraints (trimmed, length <= 1024).
 * Returns null if the input is empty or whitespace-only.
 */
export async function upsertVoteUserAgent(
  userAgent: string | null | undefined,
  options: QueryOptions = {},
): Promise<string | null> {
  const normalized = userAgent?.trim().substring(0, 1024) || null
  if (!normalized) return null

  const result = await write(
    sql`/* upsertVoteUserAgent */
    WITH ins AS (
      INSERT INTO vote_user_agents (user_agent)
      VALUES (${normalized})
      ON CONFLICT (user_agent) DO NOTHING
      RETURNING id
    )
    SELECT COALESCE(
      (SELECT id FROM ins),
      (SELECT id FROM vote_user_agents WHERE user_agent = ${normalized})
    ) AS id
  `,
    options,
  )
  return (result.rows[0] as { id: string } | undefined)?.id ?? null
}
