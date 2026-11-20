import { describe, expect, it } from 'vitest'
import {
  assertClassifierResultCount,
  CLASSIFIER_MAX_RESULTS_BY_KIND,
} from './decision-result-limits.mts'

describe('classifier decision result limits', () => {
  it.each(['topic', 'story', 'community_prompt'] as const)(
    'accepts exactly the ceiling and rejects one more for %s',
    candidateKind => {
      const limit = CLASSIFIER_MAX_RESULTS_BY_KIND[candidateKind]

      expect(() => assertClassifierResultCount(candidateKind, limit)).not.toThrow()
      expect(() => assertClassifierResultCount(candidateKind, limit + 1)).toThrow(
        `exceeds its result limit (${limit})`,
      )
    },
  )
})
