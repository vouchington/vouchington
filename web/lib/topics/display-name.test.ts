import { describe, expect, it } from 'vitest'

import { getRssFeedDisplayTitle, getTopicDisplayName, getTopicDisplayTitle } from './display-name'

describe('source topic titles', () => {
  it.each([
    ['Title (https://example.com)', 'Title'],
    ['(https://example.com)', '(News Source)'],
    ['Title (https://example.com', 'Title'],
    ['Title (https://en.wikipedia.org/wiki/Foo_(bar))', 'Title'],
    ['Just a name', 'Just a name'],
  ])('renders the public title for %s', (name, expected) => {
    expect(getTopicDisplayTitle({ name, topic_type: 'rss_feed' })).toBe(expected)
  })
})

describe('source kind display labels', () => {
  it.each([
    {
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123',
      feedType: undefined,
      label: 'YouTube Channel',
    },
    { url: 'https://youtu.be/watch?v=abc', feedType: undefined, label: 'YouTube Channel' },
    { url: null, feedType: 'podcast', label: 'Podcast' },
    { url: null, feedType: 'video', label: 'Video' },
    { url: null, feedType: 'article', label: 'News Source' },
    { url: null, feedType: 'mixed', label: 'News Source' },
    { url: null, feedType: undefined, label: 'News Source' },
    {
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123',
      feedType: 'video',
      label: 'YouTube Channel',
    },
  ] as const)('renders $label for $url / $feedType', ({ url, feedType, label }) => {
    expect(
      getTopicDisplayName(
        {
          name: url ? `Source (${url})` : 'Source',
          topic_type: 'rss_feed',
        },
        { feedType },
      ),
    ).toBe(`Source (${label})`)
  })
})

describe('getTopicDisplayName', () => {
  it('formats rss_feed topic with url name', () => {
    expect(
      getTopicDisplayName({
        name: 'Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=UC123)',
        topic_type: 'rss_feed',
      }),
    ).toBe('Level1Techs (YouTube Channel)')
  })

  it('returns name unchanged for non-rss_feed topic without feedType', () => {
    expect(getTopicDisplayName({ name: 'Open Banking', topic_type: 'topic' })).toBe('Open Banking')
  })

  it('detects YouTube Channel from truncated url without closing paren', () => {
    expect(
      getTopicDisplayName({
        name: 'Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=UC',
        topic_type: 'rss_feed',
      }),
    ).toBe('Level1Techs (YouTube Channel)')
  })

  it('returns name unchanged for non-rss_feed topic even when feedType provided', () => {
    expect(
      getTopicDisplayName(
        { name: 'My Podcast (https://example.com/feed)', topic_type: 'topic' },
        { feedType: 'podcast' },
      ),
    ).toBe('My Podcast (https://example.com/feed)')
  })
})

describe('getTopicDisplayTitle', () => {
  it('strips url and returns title only', () => {
    expect(
      getTopicDisplayTitle({
        name: 'Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=UC123)',
        topic_type: 'rss_feed',
      }),
    ).toBe('Level1Techs')
  })

  it('returns name unchanged for non-source topics', () => {
    expect(getTopicDisplayTitle({ name: 'Open Banking', topic_type: 'topic' })).toBe('Open Banking')
  })

  it('falls back to display name when title is empty (bare url)', () => {
    expect(
      getTopicDisplayTitle({
        name: '(https://www.youtube.com/feeds/videos.xml?channel_id=UC123)',
        topic_type: 'rss_feed',
      }),
    ).toBe('(YouTube Channel)')
  })
})

describe('getRssFeedDisplayTitle', () => {
  it('appends YouTube Channel label for youtube.com feed URL', () => {
    expect(
      getRssFeedDisplayTitle({
        title: 'Level1Techs',
        feed_type: 'article',
        rss_feed_url: {
          url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ',
        },
        home_page_url: null,
        topic: {
          name: 'Level1Techs (https://www.youtube.com/feeds/videos.xml?channel_id=UC123)',
          topic_type: 'rss_feed',
        },
      }),
    ).toBe('Level1Techs (YouTube Channel)')
  })

  it('appends Podcast label for podcast feed_type', () => {
    expect(
      getRssFeedDisplayTitle({
        title: 'Planet Money',
        feed_type: 'podcast',
        rss_feed_url: { url: 'https://feeds.npr.org/510289/podcast.xml' },
        home_page_url: { url: 'https://npr.org/planetmoney' },
        topic: {
          name: 'Planet Money (https://feeds.npr.org/510289/podcast.xml)',
          topic_type: 'rss_feed',
        },
      }),
    ).toBe('Planet Money (Podcast)')
  })

  it('appends News Source label for article feed_type', () => {
    expect(
      getRssFeedDisplayTitle({
        title: 'Fintech Daily',
        feed_type: 'article',
        rss_feed_url: { url: 'https://fintechdaily.com/feed' },
        home_page_url: null,
        topic: { name: 'Fintech Daily (https://fintechdaily.com/feed)', topic_type: 'rss_feed' },
      }),
    ).toBe('Fintech Daily (News Source)')
  })

  it('falls back to topic display title when feed title is empty', () => {
    expect(
      getRssFeedDisplayTitle({
        title: '',
        feed_type: 'article',
        rss_feed_url: { url: 'https://fintechdaily.com/feed' },
        home_page_url: null,
        topic: { name: 'Fintech Daily (https://fintechdaily.com/feed)', topic_type: 'rss_feed' },
      }),
    ).toBe('Fintech Daily (News Source)')
  })

  it('uses home_page_url host for label when available', () => {
    expect(
      getRssFeedDisplayTitle({
        title: 'My Channel',
        feed_type: 'video',
        rss_feed_url: { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc' },
        home_page_url: { url: 'https://www.youtube.com/@mychannel' },
        topic: {
          name: 'My Channel (https://www.youtube.com/feeds/videos.xml?channel_id=UCabc)',
          topic_type: 'rss_feed',
        },
      }),
    ).toBe('My Channel (YouTube Channel)')
  })
})
