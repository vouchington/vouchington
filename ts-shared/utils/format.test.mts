import { describe, expect, it } from 'vitest'
import {
  formatUtcDate,
  formatNumber,
  humanizePostType,
  humanizeTopicType,
  formatCompactNumber,
  generateExcerpt,
  calculateAverageRating,
  formatBytes,
  formatDuration,
  formatDomainForDisplay,
} from './format.mts'

describe('formatUtcDate', () => {
  it('formats dates with a fixed UTC timezone', () => {
    expect(formatUtcDate('2025-01-15T10:00:00Z')).toBe('Jan 15, 2025')
  })

  it('formats dates with an explicit locale', () => {
    expect(formatUtcDate('2025-01-15T10:00:00Z', 'fr')).toBe('15 janv. 2025')
  })
})

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

describe('formatCompactNumber', () => {
  it('returns plain number below 1000', () => {
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('formats thousands', () => {
    expect(formatCompactNumber(1200)).toBe('1.2K')
  })

  it('formats millions', () => {
    expect(formatCompactNumber(3_400_000)).toBe('3.4M')
  })

  it('formats billions', () => {
    expect(formatCompactNumber(2_000_000_000)).toBe('2.0B')
  })

  it('formats compact numbers with locale-specific output', () => {
    expect(formatCompactNumber(1200, 'de-DE')).toBe('1200')
  })
})

describe('formatNumber', () => {
  it('formats grouped numbers with an English default', () => {
    expect(formatNumber(1000)).toBe('1,000')
  })

  it('formats grouped numbers with an explicit locale', () => {
    expect(formatNumber(1000, 'de-DE')).toBe('1.000')
  })
})

describe('generateExcerpt', () => {
  it('returns text as-is when under maxLength', () => {
    expect(generateExcerpt('Hello world', 200)).toBe('Hello world')
  })

  it('strips markdown headers', () => {
    expect(generateExcerpt('# Title\nBody')).toBe('Title Body')
  })

  it('truncates at word boundary', () => {
    const long = 'word '.repeat(50)
    const result = generateExcerpt(long, 20)
    expect(result.length).toBeLessThanOrEqual(23) // max + '...'
    expect(result.endsWith('...')).toBe(true)
  })
})

describe('calculateAverageRating', () => {
  it('returns null when no ratings', () => {
    expect(calculateAverageRating({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 })).toBeNull()
  })

  it('calculates weighted average', () => {
    expect(calculateAverageRating({ '5': 2, '1': 0, '2': 0, '3': 0, '4': 0 })).toBe(5)
    expect(calculateAverageRating({ '3': 1, '1': 0, '2': 0, '4': 0, '5': 0 })).toBe(3)
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(5_242_880)).toBe('5.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(2_147_483_648)).toBe('2.00 GB')
  })
})

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02:05')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('formatDomainForDisplay', () => {
  it('strips leading www.', () => {
    expect(formatDomainForDisplay('www.techradar.com')).toBe('techradar.com')
  })

  it('leaves non-www hostnames unchanged', () => {
    expect(formatDomainForDisplay('techradar.com')).toBe('techradar.com')
  })

  it('only strips the first www.', () => {
    expect(formatDomainForDisplay('www.www.example.com')).toBe('www.example.com')
  })

  it('strips trailing dots', () => {
    expect(formatDomainForDisplay('example.com.')).toBe('example.com')
  })

  it('strips both www. prefix and trailing dot', () => {
    expect(formatDomainForDisplay('www.example.com.')).toBe('example.com')
  })
})
