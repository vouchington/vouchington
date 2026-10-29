import { describe, it, expect } from 'vitest'
import {
  compareHref,
  adminLandingPageAnalyticsHref,
  createCommunityPathname,
  createPostPathname,
  createUserPathname,
  domainHref,
  landingPageHref,
  landingPageNamedHref,
  messagesHref,
  modmailThreadHref,
  myLandingPageHref,
  podcastCategoryHref,
  podcastsHref,
  reviewHref,
  referralValidationHref,
  topicClaimHref,
  topicRecommendationHref,
  urlHref,
  urlCrawlHref,
} from '../entity-href'

describe('messagesHref', () => {
  it('builds the messages path from the conversation id', () => {
    expect(messagesHref('conv-1')).toBe('/messages/conv-1')
  })
})

describe('modmailThreadHref', () => {
  it('builds modmail thread paths', () => {
    expect(modmailThreadHref('community-a', { id: 'thread-1' })).toBe(
      '/messages/modmail/community-a/thread-1',
    )
  })
})

describe('entity primitives', () => {
  it('builds user subpaths', () => {
    expect(createUserPathname({ username: 'alice', id: 'u1' }, '/admin')).toBe('/user/alice/admin')
  })

  it('builds community subpaths', () => {
    expect(createCommunityPathname('rewards', '/settings/moderation')).toBe(
      '/communities/rewards/settings/moderation',
    )
  })

  it('builds URL entity paths', () => {
    const url = 'https://example.com/a%2Fb?q=one&two'
    const segment = encodeURIComponent(url)
    expect(urlHref({ url }, '/crawls/crawl-1')).toBe(`/url/${segment}/crawls/crawl-1`)
    expect(urlHref(url)).toBe(`/url/${segment}`)
    expect(urlCrawlHref(url, { id: 'crawl-1' })).toBe(`/url/${segment}/crawls/crawl-1`)
  })

  it('builds post paths from a route slug', () => {
    expect(createPostPathname('review', { id: 'review-1', slug: 'great-card' })).toBe(
      '/review/great-card',
    )
    expect(createPostPathname('discussion', 'discussion-1', '/comment/comment-1')).toBe(
      '/discussion/discussion-1/comment/comment-1',
    )
    expect(reviewHref({ id: 'review-1', slug: null })).toBe('/review/review-1')
  })

  it('builds domain entity paths', () => {
    expect(domainHref('example.com')).toBe('/domain/example.com')
  })
})

describe('topic recommendation and claim hrefs', () => {
  it('builds topic recommendation detail and edit paths', () => {
    expect(topicRecommendationHref({ slug: 'suggest-card' })).toBe(
      '/topic-recommendations/suggest-card',
    )
    expect(topicRecommendationHref('suggest-card', '/edit')).toBe(
      '/topic-recommendations/suggest-card/edit',
    )
  })

  it('builds topic claim paths', () => {
    expect(topicClaimHref({ slug: 'chase-sapphire' })).toBe('/topic-claims/chase-sapphire')
  })

  it('builds referral validation paths from both slugs', () => {
    expect(referralValidationHref('chase-sapphire', { slug: 'personal-link' })).toBe(
      '/referral-program/chase-sapphire/validations/personal-link',
    )
  })
})

describe('landing page hrefs', () => {
  it('builds public landing page paths', () => {
    expect(landingPageHref({ username: 'alice' })).toBe('/@alice')
    expect(landingPageNamedHref('alice', 'bonus')).toBe('/@alice/bonus')
    expect(landingPageNamedHref('alice', null)).toBe('/@alice')
  })

  it('builds owner landing page paths', () => {
    expect(myLandingPageHref({ slug: 'bonus' })).toBe('/my/landing-page/bonus')
    expect(myLandingPageHref('bonus', '/analytics')).toBe('/my/landing-page/bonus/analytics')
  })

  it('builds admin analytics paths under the landing page', () => {
    expect(adminLandingPageAnalyticsHref('alice', { slug: 'bonus' })).toBe(
      '/landing/alice/bonus/analytics',
    )
  })
})

describe('compareHref', () => {
  it('builds compare paths', () => {
    expect(compareHref('alpha-vs-beta')).toBe('/compare/alpha-vs-beta')
  })
})

describe('podcastsHref', () => {
  it('builds the podcast hub path', () => {
    expect(podcastsHref()).toBe('/podcasts')
  })
})

describe('podcastCategoryHref', () => {
  it('builds podcast category paths from a string slug', () => {
    expect(podcastCategoryHref('technology')).toBe('/podcasts/technology')
  })

  it('builds podcast category paths from a slug object', () => {
    expect(podcastCategoryHref({ slug: 'business' })).toBe('/podcasts/business')
  })
})

describe('domainHref hostname object forms', () => {
  it('builds domain path from a hostname object', () => {
    expect(domainHref({ hostname: 'example.com' })).toBe('/domain/example.com')
  })

  it('builds domain path from an id object without hostname', () => {
    expect(domainHref({ id: 'domain-1' })).toBe('/domain/domain-1')
  })
})
