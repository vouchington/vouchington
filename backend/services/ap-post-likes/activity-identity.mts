import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

// An Undo-only assertion cannot establish another actor's URI ownership. Both writers
// take this URI fence before their actor/post pair fence.
export async function lockActivityPubLikeIdentity(query: QueryExecutor, activityId: string) {
  await query(sql`/* lockActivityPubLikeIdentity */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'activitypub-like-identity:' || ${activityId}, 0
    ))
  `)
  const { rows } = await query<{ post_id: string; remote_actor_id: string }>(
    sql`/* findConfirmedActivityPubLikeOwner */
      SELECT post_id, remote_actor_id FROM activitypub_post_likes
      WHERE like_activitypub_id = ${activityId} AND confirmed_at IS NOT NULL
      LIMIT 1
    `,
  )
  return rows[0]
}
