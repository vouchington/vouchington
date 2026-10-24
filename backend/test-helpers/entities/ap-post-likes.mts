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
