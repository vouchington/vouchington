import type { ClearanceStatus } from './types.mts'

type PreviousClearanceState =
  | {
      rejected_at: Date | null
      in_review_at: Date | null
      automated_moderation_signal: boolean
    }
  | undefined

export function getClearanceTrainingLabel(
  status: ClearanceStatus,
  previousState: PreviousClearanceState,
) {
  if (status === 'rejected') return 'true_positive'
  if (status !== 'approved') return 'not_applicable'
  const hadAutomodSignal = previousState?.automated_moderation_signal === true
  const wasRemovedOrInReview = Boolean(previousState?.rejected_at || previousState?.in_review_at)
  return hadAutomodSignal && wasRemovedOrInReview ? 'false_positive' : 'true_negative'
}
