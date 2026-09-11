import type { RssFeedUrlValidationResult } from '@voucha/types/entities/rss-feed-url-validation-result'

export type RssFeedUrlValidationCase = {
  name: string
  url: string
  valid: boolean
  importValidatorResult: RssFeedUrlValidationResult
}

export const rssFeedUrlValidationCases: RssFeedUrlValidationCase[] = [
  {
    name: 'generic format query param',
    url: 'https://example.com/feed.xml?format=rss',
    valid: true,
    importValidatorResult: {
      valid: true,
      canonicalUrl: 'https://example.com/feed.xml?format=rss',
    },
  },
  {
    name: 'YouTube channel_id query param',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ',
    valid: true,
    importValidatorResult: {
      valid: true,
      canonicalUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ',
    },
  },
  {
    name: 'multiple query params',
    url: 'https://example.com/feed.xml?format=rss&lang=en',
    valid: true,
    importValidatorResult: {
      valid: true,
      canonicalUrl: 'https://example.com/feed.xml?format=rss&lang=en',
    },
  },
  {
    name: 'query param with fragment',
    url: 'https://example.com/feed.xml?format=rss#section',
    valid: false,
    importValidatorResult: { valid: false, error: 'RSS feed URLs must not contain fragments' },
  },
  {
    name: 'localhost with query param',
    url: 'https://localhost/feed.xml?format=rss',
    valid: false,
    importValidatorResult: { valid: false, error: 'Invalid URL format' },
  },
  {
    name: 'single-label hostname with query param',
    url: 'https://intranet/feed.xml?format=rss',
    valid: false,
    importValidatorResult: { valid: false, error: 'Invalid URL format' },
  },
  {
    name: 'private IP hostname with query param',
    url: 'https://192.168.0.1/feed.xml?format=rss',
    valid: false,
    importValidatorResult: { valid: false, error: 'Invalid URL format' },
  },
  {
    name: 'non-http scheme with query param',
    url: 'ftp://example.com/feed.xml?format=rss',
    valid: false,
    importValidatorResult: { valid: false, error: 'Invalid URL format' },
  },
]
