import { describe, expect, it } from 'vitest'

import {
  getSourceKindLabel,
  getRssFeedDisplayTitle,
  getTopicDisplayName,
  getTopicDisplayTitle,
  parseSourceTopicName,
} from './display-name'

describe('parseSourceTopicName', () => {
  it('extracts title and url from terminated format', () => {
    expect(parseSourceTopicName('Title (https://example.com)')).toEqual({
      title: 'Title',
      url: 'https://example.com',
    })
  })

  it('handles bare url with no title', () => {
    expect(parseSourceTopicName('(https://example.com)')).toEqual({
      title: '',
      url: 'https://example.com',
    })
  })

  it('handles truncated url with no closing paren', () => {
    expect(parseSourceTopicName('Title (https://example.com')).toEqual({
      title: 'Title',
      url: 'https://example.com',
    })
  })

  it('handles url with parens in path', () => {
    expect(parseSourceTopicName('Title (https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual({
      title: 'Title',
      url: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    })
  })

  it('returns name unchanged when no url present', () => {
    expect(parseSourceTopicName('Just a name')).toEqual({
      title: 'Just a name',
      url: null,
    })
  })
})

describe('getSourceKindLabel', () => {
  it('returns YouTube Channel for youtube.com host', () => {
    expect(
      getSourceKindLabel({ url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123' }),
    ).toBe('YouTube Channel')
  })

  it('returns YouTube Channel for youtu.be host', () => {
    expect(getSourceKindLabel({ url: 'https://youtu.be/watch?v=abc' })).toBe('YouTube Channel')
  })

  it('returns Podcast for podcast feedType', () => {
    expect(getSourceKindLabel({ url: null, feedType: 'podcast' })).toBe('Podcast')
  })

  it('returns Video for video feedType', () => {
    expect(getSourceKindLabel({ url: null, feedType: 'video' })).toBe('Video')
  })

  it('returns News Source for article feedType', () => {
    expect(getSourceKindLabel({ url: null, feedType: 'article' })).toBe('News Source')
  })

  it('returns News Source for mixed feedType', () => {
    expect(getSourceKindLabel({ url: null, feedType: 'mixed' })).toBe('News Source')
  })

  it('returns News Source when url is null and no feedType', () => {
    expect(getSourceKindLabel({ url: null })).toBe('News Source')
  })

  it('YouTube host wins over feedType', () => {
    expect(
      getSourceKindLabel({
        url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123',
        feedType: 'video',
      }),
    ).toBe('YouTube Channel')
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
