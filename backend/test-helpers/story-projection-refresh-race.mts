import { beginTransaction } from '@data-stores/psql'
import { markStoryPostRelatedUrlProjectionsForStories } from '../services/rss-feed-items/story-post-related-url-projections.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

export async function withStoryMemberCommittedDuringProjectionRestartForTest<T>(
  storyId: string,
  itemId: string,
  restart: () => Promise<T>,
): Promise<T> {
  await using holder = await beginTransaction()
  await holder(
    `/* stageStoryMemberForProjectionRestartTest */
      UPDATE rss_feed_items SET story_id = $1 WHERE id = $2`,
    [storyId, itemId],
  )
  if (!(await markStoryPostRelatedUrlProjectionsForStories(holder, [storyId]))) {
    throw new Error('Projection restart race requires an existing story post')
  }
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: '/* markStoryPostRelatedUrlProjection */',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = restart()
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
}
