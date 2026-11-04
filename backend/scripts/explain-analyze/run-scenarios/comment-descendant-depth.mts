import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runCommentDescendantDepthScenario(): Promise<void> {
  registerScenarioContract('comment-descendants-depth-bound', {
    expectations: [{ kind: 'custom', name: 'commentDescendantDepthBound' }],
    crossPartition: {
      posts: 'A comment thread may contain replies from later UUIDv7 post partitions.',
    },
  })
  const rootId = seedUuid(0, '05')
  await runAndCapture(
    'comment-descendants-depth-bound',
    () => getVisibleCommentDescendantIdsPage(seedUser, rootId, rootId, { limit: 100 }),
    undefined,
    'getVisibleCommentDescendantIdsPage',
  )
}
