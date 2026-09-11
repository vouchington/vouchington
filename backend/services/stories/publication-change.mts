import type { TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'

export async function recordStoryPostPublicationChanges(
  query: TransactionQuery,
  storyId: string,
  impactedTopicIds: readonly string[] = [],
): Promise<void> {
  const { rows: posts } = await query<{ post_id: string }>(
    `/* recordStoryPostPublicationChanges */
    SELECT post_id FROM post__stories WHERE story_id = $1`,
    [storyId],
  )
  await Promise.all(
    posts.map(post =>
      recordPostPublicationChange(query, {
        scope: { type: 'post', postId: post.post_id },
        reason: 'post_updated',
        impactedTopicIds,
      }),
    ),
  )
}
