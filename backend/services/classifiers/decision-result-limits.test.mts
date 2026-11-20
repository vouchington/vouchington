import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  assertClassifierResultCount,
  CLASSIFIER_DECISION_LIMIT_MAX_VALUES,
  classifierDecisionLimitsConfig,
  getClassifierResultLimit,
} from './decision-result-limits.mts'

describe('classifier decision result limits', () => {
  it.each([
    ['topic', 'topic_candidates'],
    ['story', 'story_candidates'],
    ['community_prompt', 'community_prompt_candidates'],
  ] as const)('rejects results above the configured %s limit', (candidateKind, field) => {
    const restore = overrideDynamicConfigFieldsForTest(classifierDecisionLimitsConfig, {
      [field]: 2,
    })
    try {
      expect(() => assertClassifierResultCount(candidateKind, 2)).not.toThrow()
      expect(() => assertClassifierResultCount(candidateKind, 3)).toThrow(
        'exceeds its result limit (2)',
      )
    } finally {
      restore()
    }
  })

  it('clamps a configured value above the hard maximum', () => {
    const restore = overrideDynamicConfigFieldsForTest(classifierDecisionLimitsConfig, {
      topic_candidates: CLASSIFIER_DECISION_LIMIT_MAX_VALUES.topic_candidates + 5,
    })
    try {
      expect(getClassifierResultLimit('topic')).toBe(
        CLASSIFIER_DECISION_LIMIT_MAX_VALUES.topic_candidates,
      )
    } finally {
      restore()
    }
  })
})
