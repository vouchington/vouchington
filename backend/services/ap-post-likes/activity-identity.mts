import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Returns the confirmed owner of this activity URI, when one is already visible. */
export async function lockActivityPubLikeIdentity(query: QueryExecutor, activityId: string) {
  const { rows } = await query<{ post_id: string; remote_actor_identity_id: string }>(
    sql`/* lockActivityPubLikeIdentity */
      SELECT post_id, remote_actor_identity_id FROM activitypub_post_like_activities
      WHERE activity_id = ${activityId} AND confirmed_at IS NOT NULL
      LIMIT 1
    `,
  )
  return rows[0]
}
