import { beginTransaction } from '@data-stores/psql'
import { listReviewSuccessionGroupPage } from '@services/posts/review-successions/groups'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import {
  seedReviewSuccessionHistory,
  reviewSuccessionHistoryPostId,
} from '../seed-data/review-succession-history.mts'
import { reconcileReviewSuccessionsForPostPage } from '@services/posts/review-successions/index'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runReviewSuccessionScenarios(): Promise<void> {
  registerScenarioContract('review-succession-candidates', {
    expectations: [{ kind: 'custom', name: 'reviewSuccession' }],
  })
  await seedReviewSuccessionHistory()
  await runAndCapture(
    'review-succession-candidates',
    async () => {
      await using query = await beginTransaction()
      const page = await listReviewSuccessionGroupPage(
        query,
        reviewSuccessionHistoryPostId,
        null,
        getPostsWorkLimit('review_succession_candidate_page_size'),
      )
      if (!page.nextCursor || page.groups.length !== 1)
        throw new Error('History fixture did not exercise a full raw page')
      await query.commit()
      await reconcileReviewSuccessionsForPostPage(seedUuid(1, '05'))
    },
    undefined,
    ['listReviewSuccessionHistoryPage', 'listLockedReviewSuccessionCandidates'],
  )
}
