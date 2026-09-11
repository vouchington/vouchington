import { describe, it, expect } from 'vitest'
import { postRouteConfigs, topicRouteConfigs, getPostTypeFromSlug } from '../route-configs'
import { getDefaultTopicSubpage } from '../topic-default-subpage'
import type { TopicMetrics, TopicTypes } from '@/types/topics'

describe.each([
  ['postRouteConfigs', postRouteConfigs] as const,
  ['topicRouteConfigs', topicRouteConfigs] as const,
])('%s', (_name, configs) => {
  it('all entries have non-empty title', () => {
    const missingTitles: string[] = []
    for (const [key, config] of Object.entries(configs)) {
      if (config.title.length === 0) missingTitles.push(key)
    }
    expect(missingTitles).toEqual([])
  })

  it('all entries have non-empty description', () => {
    const missingDescriptions: string[] = []
    for (const [key, config] of Object.entries(configs)) {
      if (config.description.length === 0) missingDescriptions.push(key)
    }
    expect(missingDescriptions).toEqual([])
  })

  it('no title or description contains "credit card"', () => {
    const creditCardMentions: Array<{ key: string; field: 'title' | 'description' }> = []
    for (const [key, config] of Object.entries(configs)) {
      if (config.title.toLowerCase().includes('credit card')) {
        creditCardMentions.push({ key, field: 'title' })
      }
      if (config.description.toLowerCase().includes('credit card')) {
        creditCardMentions.push({ key, field: 'description' })
      }
    }
    expect(creditCardMentions).toEqual([])
  })
})

describe('postRouteConfigs post types', () => {
  it('articles uses article post type', () => {
    expect(postRouteConfigs.articles.postTypes).toEqual(['article'])
  })

  it('blog uses blog_post post type', () => {
    expect(postRouteConfigs.blog.postTypes).toEqual(['blog_post'])
  })

  it('discussions uses discussion post type', () => {
    expect(postRouteConfigs.discussions.postTypes).toEqual(['discussion'])
  })

  it('stories entry exists in postRouteConfigs', () => {
    expect(postRouteConfigs.stories).toBeDefined()
  })

  it('stories uses story post type', () => {
    expect(postRouteConfigs.stories.postTypes).toEqual(['story'])
  })
})

describe('getPostTypeFromSlug', () => {
  it('article slug maps to article type', () => {
    expect(getPostTypeFromSlug('article')).toBe('article')
  })

  it('blog-post slug maps to blog_post type', () => {
    expect(getPostTypeFromSlug('blog-post')).toBe('blog_post')
  })

  it('review slug maps to review type', () => {
    expect(getPostTypeFromSlug('review')).toBe('review')
  })

  it('discussion slug maps to discussion type', () => {
    expect(getPostTypeFromSlug('discussion')).toBe('discussion')
  })

  it('story slug maps to story type', () => {
    expect(getPostTypeFromSlug('story')).toBe('story')
  })

  it('unknown slug returns undefined', () => {
    expect(getPostTypeFromSlug('unknown')).toBeUndefined()
  })
})

describe('getDefaultTopicSubpage', () => {
  const baseTopic = { topic_type: 'card' as TopicTypes, referral_program_id: null }

  function makeMetrics(count: Partial<TopicMetrics['count']>): TopicMetrics {
    return {
      __entity_type: 'topic_metrics',
      id: 'test-id',
      count: {
        discussions: 0,
        reviews: 0,
        'data-points': 0,
        news: 0,
        latest: 0,
        ...count,
      },
      ratings: { count: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
      ratings__updated_at: '2024-01-01T00:00:00Z',
      bookmarks: { follow: 0 },
      bookmarks__updated_at: '2024-01-01T00:00:00Z',
    }
  }

  it('returns posts when discussions count > 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ discussions: 1 }), baseTopic)).toBe('posts')
  })

  it('returns posts when reviews count > 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ reviews: 1 }), baseTopic)).toBe('posts')
  })

  it('returns posts when data-points count > 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ 'data-points': 1 }), baseTopic)).toBe('posts')
  })

  it('returns referral-links for referral_program topic type', () => {
    const referralTopic = {
      topic_type: 'referral_program' as TopicTypes,
      referral_program_id: null,
    }
    expect(getDefaultTopicSubpage(makeMetrics({}), referralTopic)).toBe('referral-links')
  })

  it('returns referral-links when referral_program_id is set', () => {
    const topicWithReferral = { topic_type: 'card' as TopicTypes, referral_program_id: 'rp-123' }
    expect(getDefaultTopicSubpage(makeMetrics({}), topicWithReferral)).toBe('referral-links')
  })

  it('returns latest when latest count > 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ latest: 5 }), baseTopic)).toBe('latest')
  })

  it('returns news when news count > 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ news: 3 }), baseTopic)).toBe('news')
  })

  it('prefers latest over news', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ latest: 5, news: 3 }), baseTopic)).toBe('latest')
  })

  it('prefers posts over latest when both exist', () => {
    expect(getDefaultTopicSubpage(makeMetrics({ discussions: 1, latest: 5 }), baseTopic)).toBe(
      'posts',
    )
  })

  it('falls back to posts when all counts are 0', () => {
    expect(getDefaultTopicSubpage(makeMetrics({}), baseTopic)).toBe('posts')
  })

  it('falls back to posts when metrics are undefined', () => {
    expect(getDefaultTopicSubpage(undefined, baseTopic)).toBe('posts')
  })

  it('falls back to latest (not posts) when all counts are 0 and topic_type is rss_feed', () => {
    const rssFeedTopic = { topic_type: 'rss_feed' as TopicTypes, referral_program_id: null }
    expect(getDefaultTopicSubpage(makeMetrics({}), rssFeedTopic)).toBe('latest')
  })

  it('falls back to latest when metrics are undefined for rss_feed topic', () => {
    const rssFeedTopic = { topic_type: 'rss_feed' as TopicTypes, referral_program_id: null }
    expect(getDefaultTopicSubpage(undefined, rssFeedTopic)).toBe('latest')
  })

  it('uses viewer_count to trigger posts tab when public count is 0', () => {
    const metricsWithViewer: TopicMetrics = {
      ...makeMetrics({}),
      viewer_count: { discussions: 1, reviews: 0, 'data-points': 0 },
    }
    expect(getDefaultTopicSubpage(metricsWithViewer, baseTopic)).toBe('posts')
  })
})
