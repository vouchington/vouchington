import { describe, it, expect } from 'vitest'
import {
  validateMediaTypes,
  validatePostTypes,
  validateTopicTypes,
  validateTimeRange,
  validateSort,
} from '../filters.mts'
import { VALID_FEED_TIME_RANGES, VALID_FILTERABLE_POST_TYPES } from '@ts-shared/feed-capabilities'

describe('validatePostTypes', () => {
  it('should parse valid post types from comma-separated string', () => {
    const result = validatePostTypes('discussion,review,data_point,comment')
    expect(result).toEqual(['discussion', 'review', 'data_point', 'comment'])
  })

  it('should parse valid post types from array', () => {
    const result = validatePostTypes(['discussion', 'review'])
    expect(result).toEqual(['discussion', 'review'])
  })

  it('should filter out invalid post types', () => {
    const result = validatePostTypes('discussion,invalid_type,review')
    expect(result).toEqual(['discussion', 'review'])
  })

  it('should return undefined if all types are invalid', () => {
    const result = validatePostTypes('invalid1,invalid2')
    expect(result).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    const result = validatePostTypes('')
    expect(result).toBeUndefined()
  })

  it('should return undefined for undefined', () => {
    const result = validatePostTypes(undefined)
    expect(result).toBeUndefined()
  })

  it('should handle whitespace in comma-separated values', () => {
    const result = validatePostTypes('discussion, review , data_point')
    expect(result).toEqual(['discussion', 'review', 'data_point'])
  })

  it('accepts every cataloged filterable post type', () => {
    expect(validatePostTypes(VALID_FILTERABLE_POST_TYPES.join(','))).toEqual([
      ...VALID_FILTERABLE_POST_TYPES,
    ])
  })
})

describe('validateTopicTypes', () => {
  it('should parse valid topic types from comma-separated string', () => {
    const result = validateTopicTypes('topic,rewards_program,card')
    expect(result).toEqual(['topic', 'rewards_program', 'card'])
  })

  it('should parse all valid topic types', () => {
    const result = validateTopicTypes(
      'topic,rewards_program,rewards_program_status,referral_program,card',
    )
    expect(result).toEqual([
      'topic',
      'rewards_program',
      'rewards_program_status',
      'referral_program',
      'card',
    ])
  })

  it('should parse valid topic types from array', () => {
    const result = validateTopicTypes(['topic', 'card'])
    expect(result).toEqual(['topic', 'card'])
  })

  it('should filter out invalid topic types', () => {
    const result = validateTopicTypes('topic,invalid_type,card')
    expect(result).toEqual(['topic', 'card'])
  })

  it('should return undefined if all types are invalid', () => {
    const result = validateTopicTypes('invalid1,invalid2')
    expect(result).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    const result = validateTopicTypes('')
    expect(result).toBeUndefined()
  })

  it('should return undefined for undefined', () => {
    const result = validateTopicTypes(undefined)
    expect(result).toBeUndefined()
  })
})

describe('validateTimeRange', () => {
  it('should validate every cataloged feed time range', () => {
    for (const timeRange of VALID_FEED_TIME_RANGES) {
      expect(validateTimeRange(timeRange)).toBe(timeRange)
    }
  })

  it('should return undefined for invalid time range', () => {
    const result = validateTimeRange('10w')
    expect(result).toBeUndefined()
  })

  it('should return undefined for non-string value', () => {
    const result = validateTimeRange(123)
    expect(result).toBeUndefined()
  })

  it('should return undefined for undefined', () => {
    const result = validateTimeRange(undefined)
    expect(result).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    const result = validateTimeRange('')
    expect(result).toBeUndefined()
  })
})

describe('validateMediaTypes', () => {
  it('should parse a single string media type', () => {
    const result = validateMediaTypes('audio', undefined)
    expect(result).toEqual(['audio'])
  })

  it('should parse a single array media type', () => {
    const result = validateMediaTypes(['audio', 'video'], undefined)
    expect(result).toEqual(['audio', 'video'])
  })

  it('should parse multi as comma-separated string', () => {
    const result = validateMediaTypes(undefined, 'audio,video')
    expect(result).toEqual(['audio', 'video'])
  })

  it('should parse multi as array', () => {
    const result = validateMediaTypes(undefined, ['audio', 'article'])
    expect(result).toEqual(['audio', 'article'])
  })

  it('should filter out invalid media types', () => {
    const result = validateMediaTypes('audio', 'invalid')
    expect(result).toEqual(['audio'])
  })

  it('should return undefined for all invalid media types', () => {
    const result = validateMediaTypes('invalid1', 'invalid2')
    expect(result).toBeUndefined()
  })

  it('should return undefined when both params are undefined', () => {
    const result = validateMediaTypes(undefined, undefined)
    expect(result).toBeUndefined()
  })

  it('should trim whitespace in string values', () => {
    const result = validateMediaTypes(' audio ', undefined)
    expect(result).toEqual(['audio'])
  })

  it('should parse single as comma-separated string', () => {
    const result = validateMediaTypes('audio,video', undefined)
    expect(result).toEqual(['audio', 'video'])
  })

  it('should deduplicate values across single and multi params', () => {
    const result = validateMediaTypes('audio', 'audio')
    expect(result).toEqual(['audio'])
  })
})

describe('validateSort', () => {
  it('should validate sort value in allowed list', () => {
    const result = validateSort('new', ['new', 'best', 'ranking'])
    expect(result).toBe('new')
  })

  it('should return undefined for sort value not in allowed list', () => {
    const result = validateSort('invalid', ['new', 'best'])
    expect(result).toBeUndefined()
  })

  it('should return undefined for non-string value', () => {
    const result = validateSort(123, ['new', 'best'])
    expect(result).toBeUndefined()
  })

  it('should return undefined for undefined', () => {
    const result = validateSort(undefined, ['new', 'best'])
    expect(result).toBeUndefined()
  })

  it('should handle readonly arrays', () => {
    const allowedValues = ['new', 'best', 'ranking'] as const
    const result = validateSort('best', allowedValues)
    expect(result).toBe('best')
  })

  it('should be case-sensitive', () => {
    const result = validateSort('NEW', ['new', 'best'])
    expect(result).toBeUndefined()
  })
})
