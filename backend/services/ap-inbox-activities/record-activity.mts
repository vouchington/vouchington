import { write, type QueryOptions } from '@data-stores/psql'
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
  options: QueryOptions = {},
): Promise<boolean> {
  const run = options.query ?? write
  const { rows } = await run(sql`/* recordInboxActivity */
    INSERT INTO ap_inbox_activities (activity_id, activity_type, actor_uri)
    VALUES (${activityId}, ${activityType}, ${actorUri})
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING id
  `)
  return rows.length > 0
}
