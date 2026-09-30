import { recordCopyrightReviewTargetBreach } from '@modules/on-error'
import {
  getCopyrightReviewTargetMinutes,
  readCopyrightReviewTargetBreaches,
} from '@services/copyright-notices'

export type CheckCopyrightReviewTargetDeps = {
  getReviewTargetMinutes: typeof getCopyrightReviewTargetMinutes
  readBreaches: typeof readCopyrightReviewTargetBreaches
  recordBreach: typeof recordCopyrightReviewTargetBreach
}

const defaultDeps: CheckCopyrightReviewTargetDeps = {
  getReviewTargetMinutes: getCopyrightReviewTargetMinutes,
  readBreaches: readCopyrightReviewTargetBreaches,
  recordBreach: recordCopyrightReviewTargetBreach,
}

/**
 * Pages Sentry once per sweep when copyright cases wait for a moderator past
 * `copyright.reviewTargetMinutes` or an open counter-notice deadline was missed. An unset (0)
 * target pages only for missed deadlines. The job data is always `{}`, so the first argument only
 * carries test overrides.
 */
export async function processCheckCopyrightReviewTarget(
  dependencyOverrides: Partial<CheckCopyrightReviewTargetDeps> = {},
): Promise<{ paged: boolean }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const reviewTargetMinutes = await deps.getReviewTargetMinutes()
  const breaches = await deps.readBreaches({ now: new Date(), reviewTargetMinutes })
  return { paged: deps.recordBreach({ reviewTargetMinutes, ...breaches }) }
}
