import { read } from '@data-stores/psql'
import { tagPostWithTopics } from '@services/posts'
import { recordModeratorAction } from '@services/moderator-actions'
import type { PrivateUser } from '@services/users/types'

export async function tagPostWithTopicForModerators(
  currentUser: PrivateUser,
  postId: string,
  topicSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await tagPostWithTopicsForModerators(currentUser, postId, [topicSlug])
  return {
    success: result.success && result.tagged.length > 0,
    error: result.errors[0],
  }
}

export async function tagPostWithTopicsForModerators(
  currentUser: PrivateUser,
  postId: string,
  topicSlugs: string[],
): Promise<{ success: boolean; tagged: string[]; errors: string[] }> {
  const { tagged, errors } = await tagPostWithTopics(currentUser, postId, topicSlugs)
  if (tagged.length > 0) {
    const { rows } = await read<{ community_id: string | null }>(
      `/* tagPostWithTopicsForModerators:communityId */ SELECT community_id FROM posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [postId],
    )
    await recordModeratorAction(currentUser.id, {
      actionType: 'tag',
      postId,
      communityId: rows[0]?.community_id ?? null,
      metadata: { topic_slugs: tagged },
    })
  }
  return { success: errors.length === 0, tagged, errors }
}
