import { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runReviewSuccessionScenarios(): Promise<void> {
  await runAndCapture(
    'review-succession-candidates',
    () => reconcileReviewSuccessionsForPostIds([seedUuid(1, '05')]),
    undefined,
    'listLockedReviewSuccessionCandidates',
  )
}
