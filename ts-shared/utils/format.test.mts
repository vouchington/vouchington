import { describe, expect, it } from 'vitest'
import { humanizePostType, humanizeTopicType } from './format.mts'

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

describe('humanizeTopicType', () => {
  it('returns labels for known topic types', () => {
    expect(humanizeTopicType('topic')).toBe('Topic')
    expect(humanizeTopicType('rewards_program')).toBe('Rewards Program')
    expect(humanizeTopicType('card')).toBe('Card')
    expect(humanizeTopicType('person')).toBe('Person')
    expect(humanizeTopicType('organization')).toBe('Organization')
    expect(humanizeTopicType('brand')).toBe('Brand')
  })

  it('falls back to the raw topic type for unknown values', () => {
    expect(humanizeTopicType('unknown_type')).toBe('unknown_type')
  })
})
