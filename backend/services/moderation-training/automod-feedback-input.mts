export type AutomodFeedbackOutcome = 'false_positive' | 'true_positive'
export type AutomodFeedbackAction = 'reinstate' | 'keep_removed' | 'label_only'

export type RecordAutomodActionFeedbackInput = {
  communityId: string
  sourceKey: string
  actorUserId: string
  outcome: AutomodFeedbackOutcome
  action: AutomodFeedbackAction
  reasonCode?: string | null
  note?: string | null
}
