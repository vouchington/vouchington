import type { ModerationTrainingLabel } from './types.mts'

export function getPromptTestTrainingLabel(
  expectedFlagged: boolean,
  actualFlagged: boolean,
): ModerationTrainingLabel {
  if (expectedFlagged) return actualFlagged ? 'true_positive' : 'false_negative_candidate'
  return actualFlagged ? 'false_positive' : 'true_negative'
}
