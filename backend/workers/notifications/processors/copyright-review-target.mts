import { recordCopyrightReviewTargetBreach } from '@modules/on-error'
import {
  getCopyrightReviewTargetMinutes,
  readCopyrightReviewTargetBreaches,
} from '@services/copyright-notices'

/**
 * Pages Sentry once per sweep when copyright cases wait for a moderator past
 * `copyright.reviewTargetMinutes` or an open counter-notice deadline was missed. An unset (0)
 * target pages only for missed deadlines.
 */
export async function processCheckCopyrightReviewTarget(
  options: { noticeIds?: readonly string[]; emailIntakeIds?: readonly string[] } = {},
): Promise<{ paged: boolean }> {
  const reviewTargetMinutes = await getCopyrightReviewTargetMinutes()
  const breaches = await readCopyrightReviewTargetBreaches({
    now: new Date(),
    reviewTargetMinutes,
    ...options,
  })
  return { paged: recordCopyrightReviewTargetBreach({ reviewTargetMinutes, ...breaches }) }
}
