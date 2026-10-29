import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestApPostLikesTally = {
  activitypub_likes_score: number
  activitypub_likes_count: number
}

export async function getTestApPostLikesTally(
  postId: string,
): Promise<TestApPostLikesTally | null> {
  const { rows } = await read<TestApPostLikesTally>(sql`/* getTestApPostLikesTally */
    SELECT activitypub_likes_score, activitypub_likes_count
    FROM post_activitypub_like_tallies
    WHERE post_id = ${postId}
  `)
  return rows[0] ?? null
}

export async function getTestActiveApPostLikeActivityId(
  postId: string,
  remoteActorId: string,
): Promise<string | null> {
  const { rows } = await read<{ activity_id: string }>(sql`/* getTestActiveApPostLikeActivityId */
    SELECT activity.activity_id
    FROM activitypub_post_likes likes
    JOIN activitypub_post_like_activities activity ON activity.id = likes.id
    WHERE likes.post_id = ${postId} AND likes.remote_actor_id = ${remoteActorId}
      AND likes.deleted_at IS NULL
  `)
  return rows[0]?.activity_id ?? null
}
