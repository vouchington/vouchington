import { expect } from 'vitest'
import type { BasicUser } from '@services/users/types'
import { getPostIds } from './get-ids.mts'

// Category relations require votes_score_net > 0. upsertEntityRelation casts the
// election vote in-process, then fire-and-forgets vote-stats recompute. Poll the
// uncached search read instead of importing workers from services.
export async function waitForPostMatchingRelatedTopicIds(
  currentUser: BasicUser | undefined,
  postId: string,
  topicIds: string[],
  limit = 100,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const result = await getPostIds(currentUser, {
          related_topic_ids: topicIds,
          limit,
        })
        return result.results.some(row => row.id === postId)
      },
      { timeout: 10_000, interval: 100 },
    )
    .toBe(true)
}
