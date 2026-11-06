import { describe, expect, it } from 'vitest'
import { isEntityRelationPublicationChange } from './vote-stats-publication-change.mts'

describe('isEntityRelationPublicationChange', () => {
  it('skips ranked URL changes when both net scores are non-positive', () => {
    expect(isEntityRelationPublicationChange('relation__post__related__url', 0, -1, 1, 2)).toBe(
      false,
    )
  })

  it('recomputes positive URL rank changes and net eligibility transitions', () => {
    expect(isEntityRelationPublicationChange('relation__post__related__url', 2, 3, 1, 2)).toBe(true)
    expect(isEntityRelationPublicationChange('relation__post__related__url', 1, 0, 1, 1)).toBe(true)
    expect(isEntityRelationPublicationChange('relation__post__category__topic', 0, 1, 1, 1)).toBe(
      true,
    )
  })
})
