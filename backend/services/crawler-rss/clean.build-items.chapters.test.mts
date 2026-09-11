import { describe, expect, it } from 'vitest'
import { buildRssFeedItemsFromFeed } from './clean.mts'

// Lives in @services/crawler-rss (not @services/rss-feed-items) because it exercises
// buildRssFeedItemsFromFeed: rss-feed-items must not depend back on crawler-rss (that would
// create a @services/crawler-rss <-> @services/rss-feed-items workspace cycle), but crawler-rss
// already depends on rss-feed-items for real (extractPodcastChaptersReference in clean.mts).
describe('buildRssFeedItemsFromFeed podcast chapters', () => {
  it('persists chapter references in normalized RSS item data', () => {
    const [item] = buildRssFeedItemsFromFeed(
      {
        items: [
          {
            title: 'Episode',
            link: '/episode',
            guid: 'episode-1',
            podcast: {
              chapters: {
                url: '/episode/chapters.json',
                type: 'application/json+chapters',
              },
            },
          },
        ],
      },
      'https://podcast.example.com/feed.xml',
    )

    expect(item).toMatchObject({
      chapters_url: 'https://podcast.example.com/episode/chapters.json',
      chapters_type: 'application/json+chapters',
    })
  })

  it('keeps chapter references off non-JSON chapter types', () => {
    const [item] = buildRssFeedItemsFromFeed(
      {
        items: [
          {
            title: 'Episode',
            link: '/episode',
            guid: 'episode-1',
            podcast: {
              chapters: {
                url: '/episode/chapters.txt',
                type: 'text/plain',
              },
            },
          },
        ],
      },
      'https://podcast.example.com/feed.xml',
    )

    expect(item).toMatchObject({
      chapters_url: 'https://podcast.example.com/episode/chapters.txt',
      chapters_type: 'text/plain',
    })
  })
})
