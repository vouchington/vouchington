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
  deriveCacheTags,
  SITEMAP_TAG,
  HTML_TAG,
} from './cache-tags.mts'

const noContext = { isSitemap: false, isRss: false, isStatic: false }

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

describe('deriveCacheTags entity routes', () => {
  it('tags a user detail page', () => {
    expect(deriveCacheTags('/user/alice', noContext)).toEqual(['user:alice'])
  })

  it('tags landing pages with the owning user tag', () => {
    expect(deriveCacheTags('/landing/alice', noContext)).toEqual(['user:alice'])
    expect(deriveCacheTags('/landing/alice/primary-links', noContext)).toEqual(['user:alice'])
  })

  it('tags a post detail page by post-type slug', () => {
    expect(deriveCacheTags('/review/my-review-slug', noContext)).toEqual(['post:my-review-slug'])
    expect(deriveCacheTags('/discussion/some-id', noContext)).toEqual(['post:some-id'])
  })

  it('tags the separately-routable story detail page with the same post tag as its canonical discussion URL', () => {
    expect(deriveCacheTags('/story/some-id', noContext)).toEqual(['post:some-id'])
  })

  it('normalizes an id-or-slug segment before tagging so mixed-case URLs still purge correctly', () => {
    expect(deriveCacheTags('/user/Alice', noContext)).toEqual(['user:alice'])
    expect(deriveCacheTags('/discussion/Some-Id', noContext)).toEqual(['post:some-id'])
    expect(deriveCacheTags('/card/Chase-Sapphire', noContext)).toEqual(['topic:chase-sapphire'])
  })

  it('tags a topic detail page by topic-type slug', () => {
    expect(deriveCacheTags('/card/chase-sapphire', noContext)).toEqual(['topic:chase-sapphire'])
    expect(deriveCacheTags('/topic/some-id', noContext)).toEqual(['topic:some-id'])
  })

  it('tags a fediverse instance page with the topic tag a topic purge emits', () => {
    expect(deriveCacheTags('/instance/mastodon-example', noContext)).toEqual([
      'topic:mastodon-example',
    ])
    expect(deriveCacheTags('/instance/mastodon-example/posts', noContext)).toEqual([
      'topic:mastodon-example',
    ])
    expect(
      deriveCacheTags('/instance/mastodon-example', {
        isSitemap: false,
        isRss: false,
        isStatic: false,
      }),
    ).toEqual(['topic:mastodon-example'])
    expect(deriveCacheTags('/instances', noContext)).toEqual(['html'])
  })

  it('ignores extra path depth beyond the id-or-slug segment', () => {
    expect(deriveCacheTags('/user/alice/reviews', noContext)).toEqual(['user:alice'])
    expect(deriveCacheTags('/card/chase-sapphire/settings/about', noContext)).toEqual([
      'topic:chase-sapphire',
    ])
  })

  it('uses the html fallback for an unrecognized family segment', () => {
    expect(deriveCacheTags('/podcasts/apple-news', noContext)).toEqual(['html'])
  })

  it('does not mint a tag when a recognized route lacks an entity identifier', () => {
    for (const pathname of ['/api/v1/posts', '/md/posts', '/user', '/landing']) {
      expect(deriveCacheTags(pathname, noContext)).toEqual(['html'])
    }
  })

  it('tags a domain detail page with the hostname family, since it renders hostname data', () => {
    expect(deriveCacheTags('/domain/example.com', noContext)).toEqual(['hostname:example.com'])
  })

  it('tags a community detail page with the community family', () => {
    expect(deriveCacheTags('/communities/voucha-members', noContext)).toEqual([
      'community:voucha-members',
    ])
  })

  it('normalizes a domain id-or-slug segment before tagging', () => {
    expect(deriveCacheTags('/domain/Example.com', noContext)).toEqual(['hostname:example.com'])
  })

  it('tags a domain detail page addressed by hostname UUID with the same hostname family', () => {
    expect(deriveCacheTags('/domain/some-uuid', noContext)).toEqual(['hostname:some-uuid'])
  })

  it('tags a backend API detail route by its plural resource family', () => {
    expect(deriveCacheTags('/api/v1/posts/some-id', noContext)).toEqual(['post:some-id'])
    expect(deriveCacheTags('/api/v1/topics/chase-sapphire', noContext)).toEqual([
      'topic:chase-sapphire',
    ])
    expect(deriveCacheTags('/api/v1/users/alice', noContext)).toEqual(['user:alice'])
    expect(deriveCacheTags('/api/v1/communities/voucha-members', noContext)).toEqual([
      'community:voucha-members',
    ])
    expect(deriveCacheTags('/api/v1/lists/some-id', noContext)).toEqual(['list:some-id'])
    expect(deriveCacheTags('/api/v1/stories/some-id', noContext)).toEqual(['story:some-id'])
    expect(deriveCacheTags('/api/v1/rss-feeds/some-id', noContext)).toEqual(['rss-feed:some-id'])
    expect(deriveCacheTags('/api/v1/rss-feed-items/some-id', noContext)).toEqual([
      'rss-feed-item:some-id',
    ])
  })

  it('uses the html fallback for static rss-feeds API subroutes instead of mistaking the literal segment for an rss-feed id', () => {
    expect(deriveCacheTags('/api/v1/rss-feeds/trending', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/rss-feeds/recommended', noContext)).toEqual(['html'])
  })

  it('uses the html fallback for static community and list API subroutes instead of mistaking literals for ids', () => {
    expect(deriveCacheTags('/api/v1/communities/invite-redemptions', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/lists/contains', noContext)).toEqual(['html'])
  })

  it('ignores extra path depth beyond the id-or-slug on an API detail route', () => {
    expect(deriveCacheTags('/api/v1/posts/some-id/images', noContext)).toEqual(['post:some-id'])
  })

  it('uses the html fallback for an unrecognized API family segment', () => {
    expect(deriveCacheTags('/api/v1/admin/mcp', noContext)).toEqual(['html'])
  })

  it('uses the html fallback for an API path with no id-or-slug segment', () => {
    expect(deriveCacheTags('/api/v1/posts', noContext)).toEqual(['html'])
  })

  it('uses the html fallback for static API subroutes instead of mistaking the literal segment for a topic id', () => {
    expect(deriveCacheTags('/api/v1/topics/compare', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/topics/publisher-types', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/topics/aliases', noContext)).toEqual(['html'])
  })

  it('still tags a real topic id-or-slug that happens to differ from a static subroute name', () => {
    expect(deriveCacheTags('/api/v1/topics/chase-sapphire', noContext)).toEqual([
      'topic:chase-sapphire',
    ])
  })

  it('uses the html fallback for a bare single-segment path', () => {
    expect(deriveCacheTags('/reviews', noContext)).toEqual(['html'])
  })

  it('uses the html fallback for the root path', () => {
    expect(deriveCacheTags('/', noContext)).toEqual(['html'])
  })

  it('tags a hostname detail API route', () => {
    expect(deriveCacheTags('/api/v1/hostnames/example.com', noContext)).toEqual([
      'hostname:example.com',
    ])
  })

  it('uses the html fallback for static hostname API subroutes instead of mistaking the literal segment for a hostname id', () => {
    expect(deriveCacheTags('/api/v1/hostnames/top', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/hostnames/compare', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/hostnames/social', noContext)).toEqual(['html'])
    expect(deriveCacheTags('/api/v1/hostnames/blocked', noContext)).toEqual(['html'])
  })

  it('tags a markdown detail route by its plural resource family', () => {
    expect(deriveCacheTags('/md/posts/some-id', noContext)).toEqual(['post:some-id'])
    expect(deriveCacheTags('/md/topics/chase-sapphire', noContext)).toEqual([
      'topic:chase-sapphire',
    ])
    expect(deriveCacheTags('/md/users/alice', noContext)).toEqual(['user:alice'])
  })

  it('ignores extra path depth beyond the id-or-slug on a markdown detail route', () => {
    expect(deriveCacheTags('/md/posts/some-id/comments', noContext)).toEqual(['post:some-id'])
  })

  it('uses the html fallback for an unrecognized markdown family segment', () => {
    expect(deriveCacheTags('/md/webhooks/stripe', noContext)).toEqual(['html'])
  })

  it('uses the html fallback for a markdown path with no id-or-slug segment', () => {
    expect(deriveCacheTags('/md/posts', noContext)).toEqual(['html'])
  })

  it('strips a .md alias suffix from a web-route id-or-slug so the tag matches the real entity', () => {
    expect(deriveCacheTags('/discussion/some-id.md', noContext)).toEqual(['post:some-id'])
    expect(deriveCacheTags('/card/chase-sapphire.md', noContext)).toEqual(['topic:chase-sapphire'])
    expect(deriveCacheTags('/user/alice.md', noContext)).toEqual(['user:alice'])
  })

  it('does not strip a bare ".md" segment down to an empty id-or-slug', () => {
    expect(deriveCacheTags('/user/.md', noContext)).toEqual(['user:.md'])
  })
})

describe('deriveCacheTags', () => {
  it('prefers an entity tag over any class tag', () => {
    expect(deriveCacheTags('/user/alice', { ...noContext, isStatic: true })).toEqual(['user:alice'])
  })

  it('falls back to the sitemap class tag', () => {
    expect(deriveCacheTags('/sitemap.xml', { ...noContext, isSitemap: true })).toEqual([
      SITEMAP_TAG,
    ])
  })

  it('falls back to the rss class tag', () => {
    expect(deriveCacheTags('/feed.xml', { ...noContext, isRss: true })).toEqual(['rss'])
  })

  it('falls back to the static class tag', () => {
    expect(deriveCacheTags('/robots.txt', { ...noContext, isStatic: true })).toEqual(['static'])
  })

  it('falls back to the generic html class tag for unclassified pages', () => {
    expect(deriveCacheTags('/', noContext)).toEqual([HTML_TAG])
    expect(deriveCacheTags('/reviews', noContext)).toEqual([HTML_TAG])
  })
})
