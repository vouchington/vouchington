import { mapClassifierProbabilityToTopicVoteScore } from '@services/classifiers/topic-vote-mapper'
import type { ClassifierThresholds } from '@voucha/types'

/**
 * Whether a community rule flags a post: the model's probability is above the classifier's upper
 * threshold. One definition for the production run's effects and the moderator dry runs, so a
 * preview can never judge by a different line than the action it previews.
 */
export function isCommunityPromptFlagged(
  probability: number,
  thresholds: ClassifierThresholds,
): boolean {
  return mapClassifierProbabilityToTopicVoteScore(probability, thresholds) === 1
}
