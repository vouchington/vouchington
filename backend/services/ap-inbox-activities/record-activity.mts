import createHttpError from 'http-errors'
import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Replay-dedup ledger for inbound ActivityPub activities (Phase C2). `activity_id` carries a
// unique constraint (see the `0562-00-00-ap-inbox-activities.sql` migration), so a duplicate
// delivery — the same remote server retrying, or a hostile replay of a captured request — is
// silently absorbed here rather than dispatched twice. Returns `true` when this call is the
// first time the activity id was seen (caller should proceed to dispatch), `false` when it is a
// replay (caller should short-circuit with an idempotent response). A signature date at or below
// the replay floor is rejected; the floor only advances, so the statement snapshot is enough.
export async function recordInboxActivity(
  activityId: string,
  activityType: string,
  actorUri: string,
  options: QueryOptions & { signedAt?: Date } = {},
): Promise<boolean> {
  const run = options.query ?? write
  const signedAt = options.signedAt ?? null
  const { rows } = await run<{
    first_seen: boolean
    retired: boolean
  }>(sql`/* recordInboxActivity */
    WITH replay_floor AS (
      SELECT rejection_floor_at >= ${signedAt}::timestamptz AS retired
      FROM activitypub_replay_rejection_floors LIMIT 1
    ), inserted AS (
      INSERT INTO activitypub_inbox_activities (activity_id, activity_type, actor_uri)
      SELECT ${activityId}, ${activityType}, ${actorUri}
      WHERE NOT COALESCE((SELECT retired FROM replay_floor), FALSE)
      ON CONFLICT (activity_id) DO NOTHING
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS first_seen,
      COALESCE((SELECT retired FROM replay_floor), FALSE) AS retired
  `)
  if (rows[0]?.retired) throw createHttpError(401, 'Activity signature date is retired')
  return rows[0]?.first_seen ?? false
}
