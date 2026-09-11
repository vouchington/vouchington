import { describe, expect, it } from 'vitest'
import type { RssFeedToFetch } from './get-to-fetch.mts'
import { buildRssFetchOptions } from './fetch-options.mts'

describe('buildRssFetchOptions', () => {
  it('adds conditional request headers when ttl is positive and the crawl body is replayable', () => {
    const lastModifiedAt = new Date('2026-01-02T03:04:05.000Z')

    const options = buildRssFetchOptions(
      makeRssFeedToFetch({
        etag: 'feed-etag',
        last_modified_at: lastModifiedAt,
      }),
      60_000,
      { canReplayFeedBody: true },
    )

    expect(options).toEqual({
      headers: {
        'If-Modified-Since': lastModifiedAt.toUTCString(),
        'If-None-Match': 'feed-etag',
      },
    })
  })

  it('omits conditional request headers when ttl is disabled', () => {
    const options = buildRssFetchOptions(
      makeRssFeedToFetch({
        etag: 'feed-etag',
        last_modified_at: new Date('2026-01-02T03:04:05.000Z'),
      }),
      0,
      { canReplayFeedBody: true },
    )

    expect(options).toEqual({ headers: {} })
  })

  it('omits conditional request headers when no replayable crawl body remains', () => {
    const options = buildRssFetchOptions(
      makeRssFeedToFetch({
        etag: 'feed-etag',
        last_modified_at: new Date('2026-01-02T03:04:05.000Z'),
      }),
      60_000,
      { canReplayFeedBody: false },
    )

    expect(options).toEqual({ headers: {} })
  })
})

function makeRssFeedToFetch(overrides: Partial<RssFeedToFetch> = {}): RssFeedToFetch {
  return {
    id: 'rss-feed-id',
    url: 'https://example.com/feed.xml',
    url_hostname_id: 'hostname-id',
    crawlable: true,
    title: 'Example feed',
    declared_language: null,
    last_modified_at: null,
    etag: null,
    last_fetched_at: null,
    feed_type: 'article',
    crawl_score: 0,
    crawl_tier: 5,
    priority_group: 1,
    feed_ignore_robots_txt: null,
    hostname_ignore_robots_txt: null,
    feed_unreliable_status_codes: null,
    hostname_unreliable_status_codes: null,
    ...overrides,
  }
}
