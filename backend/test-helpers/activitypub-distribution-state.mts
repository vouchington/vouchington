import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Construct a committed domain event with no Valkey admission to exercise the recovery window.
export async function insertUndispatchedTestUserFollow(
  sourceUserId: string,
  targetUserId: string,
): Promise<string> {
  const { rows } = await write<{ outbound_activitypub_follow_activity_id: string }>(sql`
    /* insertUndispatchedTestUserFollow */
    INSERT INTO relation__user__follow__user (subject_id, object_id)
    VALUES (${sourceUserId}, ${targetUserId})
    RETURNING outbound_activitypub_follow_activity_id
  `)
  const activityId = rows[0]?.outbound_activitypub_follow_activity_id
  if (!activityId) throw new Error('Expected committed Follow identity')
  return activityId
}
