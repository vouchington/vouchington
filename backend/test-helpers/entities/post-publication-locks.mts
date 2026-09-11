import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestPostPublicationScope =
  | { type: 'post'; id: string }
  | { type: 'rss_feed'; id: string }
  | { type: 'topic_alias'; id: string }

/** Returns whether a transaction currently holds this exact publication advisory lock. */
export async function isTestPostPublicationScopeLockHeld(
  scope: TestPostPublicationScope,
): Promise<boolean> {
  const lockKey = `${scope.type}:${scope.id}`
  const { rows } = await read<{ held: boolean }>(sql`
    /* isTestPostPublicationScopeLockHeld */
    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted
        AND classid::bigint = ((hashtextextended(${lockKey}, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended(${lockKey}, 0) & 4294967295)
    ) AS held
  `)
  return rows[0]?.held ?? false
}
