import type { ClassifierThresholds } from '@voucha/types'
import type { ElectionVoteScore } from '@voucha/types/entities/election'

export function mapClassifierProbabilityToTopicVoteScore(
  probability: number,
  thresholds: ClassifierThresholds,
): ElectionVoteScore {
  assertFiniteProbability(probability)
  assertEffectiveThresholds(thresholds)
  if (probability < thresholds.lower) return -1
  if (probability > thresholds.upper) return 1
  return 0
}

export function assertEffectiveThresholds(thresholds: ClassifierThresholds): void {
  if (
    !Number.isFinite(thresholds.lower) ||
    !Number.isFinite(thresholds.upper) ||
    thresholds.lower < 0 ||
    thresholds.upper > 1 ||
    thresholds.lower >= thresholds.upper
  ) {
    throw new Error(
      'Classifier effective thresholds must be finite and strictly ordered in zero to one',
    )
  }
}

function assertFiniteProbability(probability: number): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error('Classifier probability must be finite and between zero and one')
  }
}
