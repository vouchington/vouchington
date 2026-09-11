import { describe, expect, it } from 'vitest'
import { getTopicTypeSlugPlural } from '@voucha/types/entities/topic'

describe('getTopicTypeSlugPlural', () => {
  it('returns configured plural slugs', () => {
    expect(getTopicTypeSlugPlural('topic')).toBe('topics')
    expect(getTopicTypeSlugPlural('card')).toBe('cards')
    expect(getTopicTypeSlugPlural('rewards_program')).toBe('rewards-programs')
  })

  it('falls back to naive pluralization for unknown types', () => {
    expect(getTopicTypeSlugPlural('unknown_type')).toBe('unknown_types')
  })
})
