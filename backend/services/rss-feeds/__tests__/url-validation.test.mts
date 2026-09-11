import { rssFeedUrlValidationCases } from '@voucha/test-helpers/rss-feed-url-validation-cases'
import { describe, expect, it } from 'vitest'
import { isPublicRssFeedUrl } from '../url-validation.mts'

describe('isPublicRssFeedUrl', () => {
  it('accepts valid public HTTPS URL without query parameters', () => {
    expect(isPublicRssFeedUrl('https://example.com/feed.xml')).toBe(true)
  })

  it.each(rssFeedUrlValidationCases)(
    'validates query-param parity case: $name',
    ({ url, valid }) => {
      expect(isPublicRssFeedUrl(url)).toBe(valid)
    },
  )
})
