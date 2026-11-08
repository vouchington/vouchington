import { describe, expect, it } from 'vitest'
import { humanizePostType } from './format.mts'

describe('humanizePostType', () => {
  it('returns labels for known post types', () => {
    expect(humanizePostType('discussion')).toBe('Discussion')
    expect(humanizePostType('review')).toBe('Review')
    expect(humanizePostType('data_point')).toBe('Data Point')
    expect(humanizePostType('comment')).toBe('Comment')
    expect(humanizePostType('story')).toBe('Story')
  })

  it('falls back to the raw post type for unknown values', () => {
    expect(humanizePostType('custom_type')).toBe('custom_type')
  })
})
