import createHttpError from 'http-errors'
import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

// Replay-dedup ledger for inbound ActivityPub activities (Phase C2). `activity_id` carries a
// unique constraint (see the `0562-00-00-ap-inbox-activities.sql` migration), so a duplicate
// delivery — the same remote server retrying, or a hostile replay of a captured request — is
// silently absorbed here rather than dispatched twice. Returns `true` when this call is the
// first time the activity id was seen (caller should proceed to dispatch), `false` when it is a
// replay (caller should short-circuit with an idempotent response).
export async function recordInboxActivity(
  activityId: string,
  activityType: string,
  actorUri: string,
  options: QueryOptions & { signedAt?: Date } = {},
): Promise<boolean> {
  const run = async (query: TransactionQuery): Promise<boolean> => {
    const { rows } = await query<{
      first_seen: boolean
      retired: boolean
    }>(sql`/* recordInboxActivity */
    WITH replay_floor AS MATERIALIZED (
      SELECT rejection_floor_at FROM activitypub_replay_rejection_floors LIMIT 1
    ), decision AS MATERIALIZED (
      SELECT COALESCE(${options.signedAt ?? null}::timestamptz <= (SELECT rejection_floor_at FROM replay_floor), FALSE) AS retired
    ), inserted AS (
      INSERT INTO activitypub_inbox_activities (activity_id, activity_type, actor_uri)
      SELECT ${activityId}, ${activityType}, ${actorUri} FROM decision WHERE NOT retired
      ON CONFLICT (activity_id) DO NOTHING
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS first_seen, retired FROM decision
  `)
    if (rows[0]?.retired) throw createHttpError(401, 'Activity signature date is retired')
    if (options.signedAt) {
      // The unique insert may have waited for a purge that also advanced the replay floor.
      // Read in a new statement so READ COMMITTED sees that transaction before dispatch.
      const floor = await query<{ retired: boolean }>(sql`/* recheckInboxActivityReplayFloor */
        SELECT COALESCE(${options.signedAt}::timestamptz <=
          (SELECT rejection_floor_at FROM activitypub_replay_rejection_floors LIMIT 1), FALSE) AS retired
      `)
      if (floor.rows[0]?.retired) throw createHttpError(401, 'Activity signature date is retired')
    }
    return rows[0]?.first_seen ?? false
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result
}
