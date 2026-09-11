export const APPEAL_REASONS = [
  {
    value: 'incorrect_facts',
    label: 'The facts cited are incorrect',
    messageKey: 'extracted.appeals.appealForm.theFactsCitedAreIncorrect_347260e4',
  },
  {
    value: 'wrong_rule',
    label: 'The rule applied does not cover my content',
    messageKey: 'extracted.appeals.appealForm.theRuleAppliedDoesNotCover_d46f8694',
  },
  {
    value: 'context_missing',
    label: 'Important context was not considered',
    messageKey: 'extracted.appeals.appealForm.importantContextWasNotConsidered_238ad55a',
  },
  {
    value: 'disproportionate',
    label: 'The penalty is disproportionate',
    messageKey: 'extracted.appeals.appealForm.thePenaltyIsDisproportionate_3df198f8',
  },
  { value: 'other', label: 'Other', messageKey: 'extracted.appeals.appealForm.other_f97e9da0' },
] as const

export type AppealReason = (typeof APPEAL_REASONS)[number]['value']
