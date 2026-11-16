import { describe, expect, it } from 'vitest'
import { formatUtcDateTime, humanizePostType } from './format.mts'

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

describe('formatUtcDateTime', () => {
  it('formats the same instant in the requested locale and UTC', () => {
    expect(formatUtcDateTime('2026-01-14T23:30:00Z', 'en-US')).toBe('Jan 14, 2026, 11:30 PM UTC')
    expect(formatUtcDateTime('2026-01-14T23:30:00Z', 'de')).toBe('14. Jan. 2026, 23:30 UTC')
  })
})
