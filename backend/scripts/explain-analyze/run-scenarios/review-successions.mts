import { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runReviewSuccessionScenarios(): Promise<void> {
  registerScenarioContract('review-succession-candidates', {
    expectations: [{ kind: 'custom', name: 'reviewSuccession' }],
  })
  await runAndCapture(
    'review-succession-candidates',
    () => reconcileReviewSuccessionsForPostIds([seedUuid(1, '05')]),
    undefined,
    'listLockedReviewSuccessionCandidates',
  )
}
