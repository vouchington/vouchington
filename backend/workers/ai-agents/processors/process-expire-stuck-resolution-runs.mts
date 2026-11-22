import { getMinUuidv7ForDate } from '@modules/utils'
import { runBoundedBatches } from '@services/data-retention/run-bounded-batches'
import { expireStuckAppealResolutionRunPage } from '@services/moderation-appeals/expire-stuck-runs'
import {
  getStuckRunExpiryLimits,
  type StuckRunExpiryLimits,
} from '@services/moderation-ai-config/stuck-run-expiry'
import { expireStuckReportJudgementRunPage } from '@services/moderation-reports/expire-stuck-runs'
import { expireStuckReviewDisputeResolutionRunPage } from '@services/review-disputes/expire-stuck-runs'

const HOUR_MS = 60 * 60 * 1000

/** Test parameters: a clock, smaller limits, and the run ids a test owns in the shared database. */
type SweepOverrides = {
  now?: Date
  limits?: Partial<StuckRunExpiryLimits>
  runIds?: readonly string[]
}

/** The age bound is computed once per run and bound as a UUIDv7 parameter, never `now()` in SQL. */
function runSweep(
  stage: 'report' | 'appeal' | 'dispute',
  expirePage: (cutoffId: string, batchSize: number, runIds?: readonly string[]) => Promise<number>,
  overrides: SweepOverrides,
) {
  const limits = { ...getStuckRunExpiryLimits(stage), ...overrides.limits }
  const cutoffId = getMinUuidv7ForDate(
    new Date((overrides.now ?? new Date()).getTime() - limits.ageHours * HOUR_MS),
  )
  return runBoundedBatches(limits, batchSize => expirePage(cutoffId, batchSize, overrides.runIds))
}

export function processExpireStuckReportJudgementRuns(overrides: SweepOverrides = {}) {
  return runSweep('report', expireStuckReportJudgementRunPage, overrides)
}

export function processExpireStuckAppealResolutionRuns(overrides: SweepOverrides = {}) {
  return runSweep('appeal', expireStuckAppealResolutionRunPage, overrides)
}

export function processExpireStuckDisputeResolutionRuns(overrides: SweepOverrides = {}) {
  return runSweep('dispute', expireStuckReviewDisputeResolutionRunPage, overrides)
}
