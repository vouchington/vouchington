import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { COMMENT_DESCENDANT_DEPTH_ROOT_ID } from '../seed-data/comment-descendant-depth.mts'

export async function runCommentDescendantDepthScenario(): Promise<void> {
  registerScenarioContract('comment-descendants-depth-bound', {
    expectations: [{ kind: 'custom', name: 'commentDescendantDepthBound' }],
    crossPartition: {
      posts: 'A comment thread may contain replies from later UUIDv7 post partitions.',
    },
  })
  await runAndCapture(
    'comment-descendants-depth-bound',
    () =>
      getVisibleCommentDescendantIdsPage(
        seedUser,
        COMMENT_DESCENDANT_DEPTH_ROOT_ID,
        COMMENT_DESCENDANT_DEPTH_ROOT_ID,
        { limit: 100 },
      ),
    undefined,
    'getVisibleCommentDescendantIdsPage',
  )
}
