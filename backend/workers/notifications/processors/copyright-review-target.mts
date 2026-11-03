import { recordCopyrightReviewTargetBreach } from '@modules/on-error'
import {
  getCopyrightReviewTargetMinutes,
  readCopyrightReviewTargetBreaches,
} from '@services/copyright-notices'

/**
 * Pages Sentry once per sweep when copyright cases wait for a moderator past
 * `copyright.reviewTargetMinutes` or an open counter-notice deadline was missed. An unset (0)
 * target pages only for missed deadlines.
 * The job data is always `{}`, so the first argument only carries the injected breach read: the
 * production read is an unscoped sweep of the shared table, which a test cannot bound to its own
 * rows.
 */
export async function processCheckCopyrightReviewTarget(
  dependencyOverrides: { readBreaches?: typeof readCopyrightReviewTargetBreaches } = {},
): Promise<{ paged: boolean }> {
  const readBreaches = dependencyOverrides.readBreaches ?? readCopyrightReviewTargetBreaches
  const reviewTargetMinutes = await getCopyrightReviewTargetMinutes()
  const breaches = await readBreaches({ now: new Date(), reviewTargetMinutes })
  return { paged: recordCopyrightReviewTargetBreach({ reviewTargetMinutes, ...breaches }) }
}
