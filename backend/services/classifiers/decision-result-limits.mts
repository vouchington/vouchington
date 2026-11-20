import { DynamicConfig } from '@data-stores/valkey'
import type { ClassifierCandidateKind } from '@voucha/types'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/**
 * Hard maximums for the candidates one classifier run captures and the results one decision
 * batch stores. They are the `maxValue` of the dynamic fields below and bind every read-side
 * LIMIT, so lowering a field never truncates rows written under a higher value.
 */
export const CLASSIFIER_MAX_TOPIC_CANDIDATES = 20
export const CLASSIFIER_MAX_STORY_CANDIDATES = 20
export const CLASSIFIER_MAX_PROMPT_CANDIDATES = 30

export const CLASSIFIER_DECISION_LIMITS_CONFIG_KEY = 'classifier-decision-limits'

export type ClassifierDecisionLimitsField =
  | 'topic_candidates'
  | 'story_candidates'
  | 'community_prompt_candidates'

/** The hard maximum of each field; the registry and every read-side LIMIT bind these. */
export const CLASSIFIER_DECISION_LIMIT_MAX_VALUES: Record<ClassifierDecisionLimitsField, number> = {
  topic_candidates: CLASSIFIER_MAX_TOPIC_CANDIDATES,
  story_candidates: CLASSIFIER_MAX_STORY_CANDIDATES,
  community_prompt_candidates: CLASSIFIER_MAX_PROMPT_CANDIDATES,
}

export const classifierDecisionLimitsConfig = new DynamicConfig({
  key: CLASSIFIER_DECISION_LIMITS_CONFIG_KEY,
  fieldTypes: {
    topic_candidates: 'number',
    story_candidates: 'number',
    community_prompt_candidates: 'number',
  },
  defaultFields: CLASSIFIER_DECISION_LIMIT_MAX_VALUES,
})

const FIELD_BY_KIND: Record<ClassifierCandidateKind, ClassifierDecisionLimitsField> = {
  topic: 'topic_candidates',
  story: 'story_candidates',
  community_prompt: 'community_prompt_candidates',
}

/** The most candidates or results a classifier run may currently store for one kind. */
export function getClassifierResultLimit(candidateKind: ClassifierCandidateKind): number {
  const field = FIELD_BY_KIND[candidateKind]
  return getBoundedPositiveIntegerField(classifierDecisionLimitsConfig, field, {
    defaultValue: CLASSIFIER_DECISION_LIMIT_MAX_VALUES[field],
    maxValue: CLASSIFIER_DECISION_LIMIT_MAX_VALUES[field],
  })
}

export function assertClassifierResultCount(
  candidateKind: ClassifierCandidateKind,
  count: number,
): void {
  const limit = getClassifierResultLimit(candidateKind)
  if (count > limit) {
    throw new Error(`Classifier ${candidateKind} decision exceeds its result limit (${limit})`)
  }
}
