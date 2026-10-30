import Sentry from './sentry.mts'

/** Daily retention execution warns until an operator records an actual policy review. */
export function recordCopyrightReplayPolicyReviewDue(): void {
  Sentry.captureMessage('copyright_replay_policy_review_due', {
    level: 'warning',
    tags: { reason: 'copyright_replay_policy_review_due' },
  })
}
