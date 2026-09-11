import { describe, it, expect } from 'vitest'
import type { PostType } from '@/types/posts'
import {
  topicHref,
  topicManagementHref,
  topicIdOrSlug,
  topicApiId,
  userHref,
  communityHref,
  communityPostsHref,
  communityPendingPostsHref,
  topicTabForPostType,
  userTabForPostType,
  createTopicPathname,
  createTopicCollectionPathname,
  createCrawlerPathname,
} from '../entity-href'

describe('createTopicPathname', () => {
  it('returns the bare entity path with no suffix', () => {
    expect(createTopicPathname({ topic_type: 'topic', slug: 'foo' })).toBe('/topic/foo')
  })

  it('prefers slug over id', () => {
    expect(createTopicPathname({ topic_type: 'card', slug: 'amex', id: 'abc' })).toBe('/card/amex')
  })

  it('falls back to id when slug is null', () => {
    expect(createTopicPathname({ topic_type: 'topic', slug: null, id: 'abc' })).toBe('/topic/abc')
  })

  it('falls back to id when slug is blank', () => {
    expect(createTopicPathname({ topic_type: 'topic', slug: '', id: 'abc' })).toBe('/topic/abc')
  })

  it('appends a suffix that includes its own leading slash', () => {
    expect(
      createTopicPathname({ topic_type: 'referral_program', slug: 'rp' }, '/validations/new'),
    ).toBe('/referral-program/rp/validations/new')
  })

  it('maps rss_feed type to the source slug', () => {
    expect(createTopicPathname({ topic_type: 'rss_feed', id: 'abc' }, '/news')).toBe(
      '/source/abc/news',
    )
  })
})

describe('createTopicCollectionPathname', () => {
  it('returns /topics with no suffix', () => {
    expect(createTopicCollectionPathname()).toBe('/topics')
  })

  it('appends the create suffix', () => {
    expect(createTopicCollectionPathname('/create')).toBe('/topics/create')
  })

  it('appends the aliases suffix', () => {
    expect(createTopicCollectionPathname('/aliases')).toBe('/topics/aliases')
  })

  it('preserves a query string in the suffix', () => {
    expect(createTopicCollectionPathname('/create?name=Acme')).toBe('/topics/create?name=Acme')
  })
})

describe('createCrawlerPathname', () => {
  it('returns the crawler detail path with no suffix', () => {
    expect(createCrawlerPathname({ id: 'crawler-1' })).toBe('/crawler/crawler-1')
  })

  it('appends the edit suffix', () => {
    expect(createCrawlerPathname({ id: 'crawler-1' }, '/edit')).toBe('/crawler/crawler-1/edit')
  })
})

describe('topicHref', () => {
  it('returns base path when no tab', () => {
    expect(topicHref({ topic_type: 'topic', slug: 'foo' })).toBe('/topic/foo')
  })

  it('uses id when slug is absent', () => {
    expect(topicHref({ topic_type: 'topic', id: 'abc' })).toBe('/topic/abc')
  })

  it('prefers slug over id', () => {
    expect(topicHref({ topic_type: 'topic', slug: 'foo', id: 'abc' })).toBe('/topic/foo')
  })

  it('falls back to id when slug is null', () => {
    expect(topicHref({ topic_type: 'topic', slug: null, id: 'abc' })).toBe('/topic/abc')
  })

  it('falls back to id when slug is blank', () => {
    expect(topicHref({ topic_type: 'topic', slug: '', id: 'abc' })).toBe('/topic/abc')
  })

  it('appends tab', () => {
    expect(topicHref({ topic_type: 'topic', slug: 'foo' }, 'reviews')).toBe('/topic/foo/reviews')
  })

  it('maps rss_feed type to source slug', () => {
    expect(topicHref({ topic_type: 'rss_feed', id: 'abc' }, 'news')).toBe('/source/abc/news')
  })

  it('maps card type correctly', () => {
    expect(topicHref({ topic_type: 'card', slug: 'x' }, 'reviews')).toBe('/card/x/reviews')
  })
})

describe('topicManagementHref', () => {
  it('defaults to settings tab', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' })).toBe('/topic/foo/settings')
  })

  it('builds settings tab path', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' }, 'settings')).toBe(
      '/topic/foo/settings',
    )
  })

  it('builds settings/aliases sub-page path', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' }, 'settings/aliases')).toBe(
      '/topic/foo/settings/aliases',
    )
  })

  it('builds settings/domains sub-page path', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' }, 'settings/domains')).toBe(
      '/topic/foo/settings/domains',
    )
  })

  it('builds settings/about sub-page path', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' }, 'settings/about')).toBe(
      '/topic/foo/settings/about',
    )
  })

  it('builds settings/merge sub-page path', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'foo' }, 'settings/merge')).toBe(
      '/topic/foo/settings/merge',
    )
  })

  it('uses slug when available', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: 'my-topic', id: 'abc' })).toBe(
      '/topic/my-topic/settings',
    )
  })

  it('falls back to id when slug is absent', () => {
    expect(topicManagementHref({ topic_type: 'topic', id: 'abc' })).toBe('/topic/abc/settings')
  })

  it('falls back to id when slug is null', () => {
    expect(topicManagementHref({ topic_type: 'topic', slug: null, id: 'abc' })).toBe(
      '/topic/abc/settings',
    )
  })

  it('maps rss_feed type to source slug for source sub-page', () => {
    expect(topicManagementHref({ topic_type: 'rss_feed', id: 'abc' }, 'settings/source')).toBe(
      '/source/abc/settings/source',
    )
  })

  it('maps card type correctly', () => {
    expect(topicManagementHref({ topic_type: 'card', slug: 'x' }, 'settings')).toBe(
      '/card/x/settings',
    )
  })
})

describe('topicIdOrSlug', () => {
  it('returns slug when available', () => {
    expect(topicIdOrSlug({ id: 'uuid-1', slug: 'my-topic' })).toBe('my-topic')
  })

  it('falls back to id when slug is null', () => {
    expect(topicIdOrSlug({ id: 'uuid-1', slug: null })).toBe('uuid-1')
  })

  it('falls back to id when slug is undefined', () => {
    expect(topicIdOrSlug({ id: 'uuid-1' })).toBe('uuid-1')
  })
})

describe('topicApiId', () => {
  it('always returns the uuid id', () => {
    expect(topicApiId({ id: 'uuid-1' })).toBe('uuid-1')
  })
})

describe('userHref', () => {
  it('uses username', () => {
    expect(userHref({ username: 'alice', id: 'u1' })).toBe('/user/alice')
  })

  it('falls back to id when username is null', () => {
    expect(userHref({ username: null, id: 'u1' })).toBe('/user/u1')
  })

  it('falls back to id when username is undefined', () => {
    expect(userHref({ id: 'u1' })).toBe('/user/u1')
  })

  it('appends tab', () => {
    expect(userHref({ username: 'bob', id: 'u2' }, 'reviews')).toBe('/user/bob/reviews')
  })

  it('appends discussions tab', () => {
    expect(userHref({ username: 'bob', id: 'u2' }, 'discussions')).toBe('/user/bob/discussions')
  })
})

describe('communityHref', () => {
  it('builds the community path from the slug', () => {
    expect(communityHref({ slug: 'my-club' })).toBe('/communities/my-club')
  })
})

describe('communityPostsHref', () => {
  it('builds the canonical community posts path from the slug', () => {
    expect(communityPostsHref({ slug: 'my-club' })).toBe('/communities/my-club/posts')
  })
})

describe('communityPendingPostsHref', () => {
  it('builds the canonical pending community posts path from the slug', () => {
    expect(communityPendingPostsHref({ slug: 'my-club' })).toBe(
      '/communities/my-club/posts?post=pending',
    )
  })
})

describe('topicTabForPostType', () => {
  it('maps review → reviews', () => {
    expect(topicTabForPostType('review')).toBe('reviews')
  })
  it('maps data_point → data-points', () => {
    expect(topicTabForPostType('data_point')).toBe('data-points')
  })
  it('maps discussion → posts', () => {
    expect(topicTabForPostType('discussion')).toBe('posts')
  })
  it('maps story → posts', () => {
    expect(topicTabForPostType('story')).toBe('posts')
  })
  it('maps article → posts', () => {
    expect(topicTabForPostType('article')).toBe('posts')
  })
  it('maps blog_post → posts', () => {
    expect(topicTabForPostType('blog_post')).toBe('posts')
  })
  it('returns undefined for topic_recommendation', () => {
    expect(topicTabForPostType('topic_recommendation')).toBeUndefined()
  })
  it('returns undefined for undefined', () => {
    const noPostType: PostType | undefined = undefined
    expect(topicTabForPostType(noPostType)).toBeUndefined()
  })
})

describe('userTabForPostType', () => {
  it('maps review → reviews', () => {
    expect(userTabForPostType('review')).toBe('reviews')
  })
  it('maps discussion → discussions', () => {
    expect(userTabForPostType('discussion')).toBe('discussions')
  })
  it('maps story → discussions', () => {
    expect(userTabForPostType('story')).toBe('discussions')
  })
  it('maps article → discussions', () => {
    expect(userTabForPostType('article')).toBe('discussions')
  })
  it('maps blog_post → discussions', () => {
    expect(userTabForPostType('blog_post')).toBe('discussions')
  })
  it('maps comment → comments', () => {
    expect(userTabForPostType('comment')).toBe('comments')
  })
  it('returns undefined for data_point', () => {
    expect(userTabForPostType('data_point')).toBeUndefined()
  })
  it('returns undefined for undefined', () => {
    const noPostType: PostType | undefined = undefined
    expect(userTabForPostType(noPostType)).toBeUndefined()
  })
})
