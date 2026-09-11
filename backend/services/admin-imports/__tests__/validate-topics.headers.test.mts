import { describe, it, expect } from 'vitest'
import { validateTopicHeaders } from '../validate-topics.mts'

describe('validateTopicHeaders', () => {
  it('accepts known columns', () => {
    const unknown = validateTopicHeaders([
      'slug',
      'name',
      'topic_type',
      'markdown',
      'rss_feed_url',
      'rss_feed_title',
      'feed_type',
      'aliases',
      'parent_slugs',
      'extensions',
      'notes',
    ])
    expect(unknown).toHaveLength(0)
  })

  it('returns unknown columns', () => {
    const unknown = validateTopicHeaders(['slug', 'name', 'unknown_field'])
    expect(unknown).toEqual(['unknown_field'])
  })

  it('returns multiple unknown columns', () => {
    const unknown = validateTopicHeaders(['slug', 'foo', 'bar'])
    expect(unknown).toEqual(['foo', 'bar'])
  })
})
