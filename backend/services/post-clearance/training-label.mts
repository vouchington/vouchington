import type { ClearanceStatus } from './types.mts'

type PreviousClearanceState =
  | {
      rejected_at: Date | null
      in_review_at: Date | null
      openai_omni_moderation_flagged: boolean | null
      spam_detection_flagged: boolean | null
      agent_moderation_flagged: boolean
    }
  | undefined

export function getClearanceTrainingLabel(
  status: ClearanceStatus,
  previousState: PreviousClearanceState,
) {
  if (status === 'rejected') return 'true_positive'
  if (status !== 'approved') return 'not_applicable'
  const hadAutomodSignal =
    previousState?.openai_omni_moderation_flagged === true ||
    previousState?.spam_detection_flagged === true ||
    previousState?.agent_moderation_flagged === true
  const wasRemovedOrInReview = Boolean(previousState?.rejected_at || previousState?.in_review_at)
  return hadAutomodSignal && wasRemovedOrInReview ? 'false_positive' : 'true_negative'
}
