import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

export type CopyrightReviewTargetBreachBucket = {
  count: number
  noticeIds: readonly string[]
}

export type CopyrightReviewTargetBreachContext = {
  // null while the operator has not set `copyright.reviewTargetMinutes`.
  reviewTargetMinutes: number | null
  waitingPastTarget: CopyrightReviewTargetBreachBucket
  missedEscalation: CopyrightReviewTargetBreachBucket
  missedRestorationDeadline: CopyrightReviewTargetBreachBucket
}

/**
 * Sends one tagged Sentry warning when copyright cases wait for a moderator past the review target
 * or an open counter-notice deadline passed `escalation_at` or `restoration_deadline_at`. Nothing is
 * sent when every count is zero. The event carries counts and notice ids only, copied field by field
 * so no claimant or poster data can ride along. The five-minute sweep already bounds the rate, so
 * there is no in-process throttle. Returns whether a warning was sent.
 */
export function recordCopyrightReviewTargetBreach(
  context: CopyrightReviewTargetBreachContext,
): boolean {
  const { waitingPastTarget, missedEscalation, missedRestorationDeadline } = context
  if (waitingPastTarget.count + missedEscalation.count + missedRestorationDeadline.count === 0) {
    return false
  }
  const extra = {
    reviewTargetMinutes: context.reviewTargetMinutes,
    waitingPastTargetCount: waitingPastTarget.count,
    waitingPastTargetNoticeIds: [...waitingPastTarget.noticeIds],
    missedEscalationCount: missedEscalation.count,
    missedEscalationNoticeIds: [...missedEscalation.noticeIds],
    missedRestorationDeadlineCount: missedRestorationDeadline.count,
    missedRestorationDeadlineNoticeIds: [...missedRestorationDeadline.noticeIds],
  }
  if (shouldLogToConsole()) {
    console.warn('[copyright] review target breached', extra)
  }
  Sentry.captureMessage('copyright_review_target_breach', {
    level: 'warning',
    tags: {
      reason: 'copyright_review_target_breach',
      waiting_past_target: String(waitingPastTarget.count > 0),
      missed_escalation: String(missedEscalation.count > 0),
      missed_restoration_deadline: String(missedRestorationDeadline.count > 0),
    },
    extra,
  })
  return true
}
