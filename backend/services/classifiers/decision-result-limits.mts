import type { ClassifierCandidateKind } from '@voucha/types'

/**
 * Hard ceilings on the candidates one classifier run captures and on the results one decision
 * batch stores. The run lifecycle and the decision writer enforce them, so the readers that
 * replay a run's candidates or a batch's results bound their reads with the same numbers.
 */
export const CLASSIFIER_MAX_TOPIC_CANDIDATES = 20
export const CLASSIFIER_MAX_STORY_CANDIDATES = 20
export const CLASSIFIER_MAX_PROMPT_CANDIDATES = 30

/** The most results one decision batch may store for each candidate kind. */
export const CLASSIFIER_MAX_RESULTS_BY_KIND: Record<ClassifierCandidateKind, number> = {
  topic: CLASSIFIER_MAX_TOPIC_CANDIDATES,
  story: CLASSIFIER_MAX_STORY_CANDIDATES,
  community_prompt: CLASSIFIER_MAX_PROMPT_CANDIDATES,
}

export function assertClassifierResultCount(
  candidateKind: ClassifierCandidateKind,
  count: number,
): void {
  const limit = CLASSIFIER_MAX_RESULTS_BY_KIND[candidateKind]
  if (count > limit) {
    throw new Error(`Classifier ${candidateKind} decision exceeds its result limit (${limit})`)
  }
}
