import { describe, expect, it } from 'vitest'
import {
  postTag,
  topicTag,
  userTag,
  communityTag,
  listTag,
  storyTag,
  hostnameTag,
  rssFeedTag,
  rssFeedItemTag,
  deriveEntityCacheTags,
  deriveCacheTags,
  SITEMAP_TAG,
  RSS_TAG,
  STATIC_TAG,
  HTML_TAG,
} from './cache-tags.mts'

describe('tag formatters', () => {
  it('formats each entity family with its own prefix', () => {
    expect(postTag('abc')).toBe('post:abc')
    expect(topicTag('abc')).toBe('topic:abc')
    expect(userTag('abc')).toBe('user:abc')
    expect(communityTag('abc')).toBe('community:abc')
    expect(listTag('abc')).toBe('list:abc')
    expect(storyTag('abc')).toBe('story:abc')
    expect(hostnameTag('abc')).toBe('hostname:abc')
    expect(rssFeedTag('abc')).toBe('rss-feed:abc')
    expect(rssFeedItemTag('abc')).toBe('rss-feed-item:abc')
  })

  it('normalizes case and surrounding whitespace so purge tags match regardless of URL casing', () => {
    expect(postTag('Some-Slug')).toBe('post:some-slug')
    expect(topicTag(' Chase-Sapphire ')).toBe('topic:chase-sapphire')
    expect(userTag('Alice')).toBe('user:alice')
    expect(communityTag(' Voucha-Members ')).toBe('community:voucha-members')
    expect(listTag(' Some-Id ')).toBe('list:some-id')
    expect(storyTag(' Some-Id ')).toBe('story:some-id')
    expect(hostnameTag(' Example.com ')).toBe('hostname:example.com')
    expect(rssFeedTag(' Some-Id ')).toBe('rss-feed:some-id')
    expect(rssFeedItemTag(' Some-Id ')).toBe('rss-feed-item:some-id')
  })
})

describe('deriveEntityCacheTags', () => {
  it('tags a user detail page', () => {
    expect(deriveEntityCacheTags('/user/alice')).toEqual(['user:alice'])
  })

  it('tags landing pages with the owning user tag', () => {
    expect(deriveEntityCacheTags('/landing/alice')).toEqual(['user:alice'])
    expect(deriveEntityCacheTags('/landing/alice/primary-links')).toEqual(['user:alice'])
  })

  it('tags a post detail page by post-type slug', () => {
    expect(deriveEntityCacheTags('/review/my-review-slug')).toEqual(['post:my-review-slug'])
    expect(deriveEntityCacheTags('/discussion/some-id')).toEqual(['post:some-id'])
  })

  it('tags the separately-routable story detail page with the same post tag as its canonical discussion URL', () => {
    expect(deriveEntityCacheTags('/story/some-id')).toEqual(['post:some-id'])
  })

  it('normalizes an id-or-slug segment before tagging so mixed-case URLs still purge correctly', () => {
    expect(deriveEntityCacheTags('/user/Alice')).toEqual(['user:alice'])
    expect(deriveEntityCacheTags('/discussion/Some-Id')).toEqual(['post:some-id'])
    expect(deriveEntityCacheTags('/card/Chase-Sapphire')).toEqual(['topic:chase-sapphire'])
  })

  it('tags a topic detail page by topic-type slug', () => {
    expect(deriveEntityCacheTags('/card/chase-sapphire')).toEqual(['topic:chase-sapphire'])
    expect(deriveEntityCacheTags('/topic/some-id')).toEqual(['topic:some-id'])
  })

  it('ignores extra path depth beyond the id-or-slug segment', () => {
    expect(deriveEntityCacheTags('/user/alice/reviews')).toEqual(['user:alice'])
    expect(deriveEntityCacheTags('/card/chase-sapphire/settings/about')).toEqual([
      'topic:chase-sapphire',
    ])
  })

  it('returns [] for an unrecognized family segment', () => {
    expect(deriveEntityCacheTags('/podcasts/apple-news')).toEqual([])
  })

  it('tags a domain detail page with the hostname family, since it renders hostname data', () => {
    expect(deriveEntityCacheTags('/domain/example.com')).toEqual(['hostname:example.com'])
  })

  it('tags a community detail page with the community family', () => {
    expect(deriveEntityCacheTags('/communities/voucha-members')).toEqual([
      'community:voucha-members',
    ])
  })

  it('normalizes a domain id-or-slug segment before tagging', () => {
    expect(deriveEntityCacheTags('/domain/Example.com')).toEqual(['hostname:example.com'])
  })

  it('tags a domain detail page addressed by hostname UUID with the same hostname family', () => {
    expect(deriveEntityCacheTags('/domain/some-uuid')).toEqual(['hostname:some-uuid'])
  })

  it('tags a backend API detail route by its plural resource family', () => {
    expect(deriveEntityCacheTags('/api/v1/posts/some-id')).toEqual(['post:some-id'])
    expect(deriveEntityCacheTags('/api/v1/topics/chase-sapphire')).toEqual(['topic:chase-sapphire'])
    expect(deriveEntityCacheTags('/api/v1/users/alice')).toEqual(['user:alice'])
    expect(deriveEntityCacheTags('/api/v1/communities/voucha-members')).toEqual([
      'community:voucha-members',
    ])
    expect(deriveEntityCacheTags('/api/v1/lists/some-id')).toEqual(['list:some-id'])
    expect(deriveEntityCacheTags('/api/v1/stories/some-id')).toEqual(['story:some-id'])
    expect(deriveEntityCacheTags('/api/v1/rss-feeds/some-id')).toEqual(['rss-feed:some-id'])
    expect(deriveEntityCacheTags('/api/v1/rss-feed-items/some-id')).toEqual([
      'rss-feed-item:some-id',
    ])
  })

  it('returns [] for static rss-feeds API subroutes instead of mistaking the literal segment for an rss-feed id', () => {
    expect(deriveEntityCacheTags('/api/v1/rss-feeds/trending')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/rss-feeds/recommended')).toEqual([])
  })

  it('returns [] for static community and list API subroutes instead of mistaking literals for ids', () => {
    expect(deriveEntityCacheTags('/api/v1/communities/invite-redemptions')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/lists/contains')).toEqual([])
  })

  it('ignores extra path depth beyond the id-or-slug on an API detail route', () => {
    expect(deriveEntityCacheTags('/api/v1/posts/some-id/images')).toEqual(['post:some-id'])
  })

  it('returns [] for an unrecognized API family segment', () => {
    expect(deriveEntityCacheTags('/api/v1/admin/mcp')).toEqual([])
  })

  it('returns [] for an API path with no id-or-slug segment', () => {
    expect(deriveEntityCacheTags('/api/v1/posts')).toEqual([])
  })

  it('returns [] for static API subroutes instead of mistaking the literal segment for a topic id', () => {
    expect(deriveEntityCacheTags('/api/v1/topics/compare')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/topics/publisher-types')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/topics/aliases')).toEqual([])
  })

  it('still tags a real topic id-or-slug that happens to differ from a static subroute name', () => {
    expect(deriveEntityCacheTags('/api/v1/topics/chase-sapphire')).toEqual(['topic:chase-sapphire'])
  })

  it('returns [] for a bare single-segment path', () => {
    expect(deriveEntityCacheTags('/reviews')).toEqual([])
  })

  it('returns [] for the root path', () => {
    expect(deriveEntityCacheTags('/')).toEqual([])
  })

  it('tags a hostname detail API route', () => {
    expect(deriveEntityCacheTags('/api/v1/hostnames/example.com')).toEqual(['hostname:example.com'])
  })

  it('returns [] for static hostname API subroutes instead of mistaking the literal segment for a hostname id', () => {
    expect(deriveEntityCacheTags('/api/v1/hostnames/top')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/hostnames/compare')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/hostnames/social')).toEqual([])
    expect(deriveEntityCacheTags('/api/v1/hostnames/blocked')).toEqual([])
  })

  it('tags a markdown detail route by its plural resource family', () => {
    expect(deriveEntityCacheTags('/md/posts/some-id')).toEqual(['post:some-id'])
    expect(deriveEntityCacheTags('/md/topics/chase-sapphire')).toEqual(['topic:chase-sapphire'])
    expect(deriveEntityCacheTags('/md/users/alice')).toEqual(['user:alice'])
  })

  it('ignores extra path depth beyond the id-or-slug on a markdown detail route', () => {
    expect(deriveEntityCacheTags('/md/posts/some-id/comments')).toEqual(['post:some-id'])
  })

  it('returns [] for an unrecognized markdown family segment', () => {
    expect(deriveEntityCacheTags('/md/webhooks/stripe')).toEqual([])
  })

  it('returns [] for a markdown path with no id-or-slug segment', () => {
    expect(deriveEntityCacheTags('/md/posts')).toEqual([])
  })

  it('strips a .md alias suffix from a web-route id-or-slug so the tag matches the real entity', () => {
    expect(deriveEntityCacheTags('/discussion/some-id.md')).toEqual(['post:some-id'])
    expect(deriveEntityCacheTags('/card/chase-sapphire.md')).toEqual(['topic:chase-sapphire'])
    expect(deriveEntityCacheTags('/user/alice.md')).toEqual(['user:alice'])
  })

  it('does not strip a bare ".md" segment down to an empty id-or-slug', () => {
    expect(deriveEntityCacheTags('/user/.md')).toEqual(['user:.md'])
  })
})

describe('deriveCacheTags', () => {
  const noContext = { isSitemap: false, isRss: false, isStatic: false }

  it('prefers an entity tag over any class tag', () => {
    expect(deriveCacheTags('/user/alice', { ...noContext, isStatic: true })).toEqual(['user:alice'])
  })

  it('falls back to the sitemap class tag', () => {
    expect(deriveCacheTags('/sitemap.xml', { ...noContext, isSitemap: true })).toEqual([
      SITEMAP_TAG,
    ])
  })

  it('falls back to the rss class tag', () => {
    expect(deriveCacheTags('/feed.xml', { ...noContext, isRss: true })).toEqual([RSS_TAG])
  })

  it('falls back to the static class tag', () => {
    expect(deriveCacheTags('/robots.txt', { ...noContext, isStatic: true })).toEqual([STATIC_TAG])
  })

  it('falls back to the generic html class tag for unclassified pages', () => {
    expect(deriveCacheTags('/', noContext)).toEqual([HTML_TAG])
    expect(deriveCacheTags('/reviews', noContext)).toEqual([HTML_TAG])
  })
})
