import { describe, it, expect } from 'vitest'
import {
  feedRouteConfigs,
  getFeedSubFilters,
  type FeedCategory,
  type PostFeedType,
  type NewsFeedType,
  type ReferralLinksFeedType,
} from './feed-route-configs'
import { VALID_POST_FEED_TYPES, VALID_RSS_FEED_ITEM_FEED_TYPES } from '@ts-shared/feed-capabilities'

const FOLLOWING_LABEL_KEY = 'extracted.lib.feedRouteConfigData.following_344b4271'
const FRIENDS_LABEL_KEY = 'extracted.lib.feedRouteConfigData.friends_bd104d1b'
const SOURCES_LABEL_KEY = 'extracted.lib.feedRouteConfigData.sources_caf85b08'
const TOPICS_LABEL_KEY = 'extracted.lib.feedRouteConfigData.topics_e22820fc'
const MUTUAL_FRIENDS_LABEL_KEY = 'extracted.lib.feedRouteConfigData.mutualFriends_dddbc842'

describe('getFeedSubFilters', () => {
  // `label` is a MessageKey — translation happens at the render site (FeedSubFilterDropdown),
  // not inside this plain config function — so these assertions check key identity, not text.
  it('returns posts sub-filters in display order: Following, Friends, Topics', () => {
    const filters = getFeedSubFilters('posts')
    expect(filters.map(f => f.label)).toEqual([
      FOLLOWING_LABEL_KEY,
      FRIENDS_LABEL_KEY,
      TOPICS_LABEL_KEY,
    ])
  })

  it('returns news sub-filters in display order: Following, Friends, Sources, Topics', () => {
    const filters = getFeedSubFilters('news')
    expect(filters.map(f => f.label)).toEqual([
      FOLLOWING_LABEL_KEY,
      FRIENDS_LABEL_KEY,
      SOURCES_LABEL_KEY,
      TOPICS_LABEL_KEY,
    ])
  })

  it('returns podcasts sub-filters in display order: Following, Friends, Sources, Topics', () => {
    const filters = getFeedSubFilters('podcasts')
    expect(filters.map(f => f.label)).toEqual([
      FOLLOWING_LABEL_KEY,
      FRIENDS_LABEL_KEY,
      SOURCES_LABEL_KEY,
      TOPICS_LABEL_KEY,
    ])
  })

  it('returns videos sub-filters in display order: Following, Friends, Sources, Topics', () => {
    const filters = getFeedSubFilters('videos')
    expect(filters.map(f => f.label)).toEqual([
      FOLLOWING_LABEL_KEY,
      FRIENDS_LABEL_KEY,
      SOURCES_LABEL_KEY,
      TOPICS_LABEL_KEY,
    ])
  })

  it('returns referral-links sub-filters in display order: Following, Mutual Friends', () => {
    const filters = getFeedSubFilters('referral-links')
    expect(filters.map(f => f.label)).toEqual([FOLLOWING_LABEL_KEY, MUTUAL_FRIENDS_LABEL_KEY])
  })

  it('returns correct paths for posts filters', () => {
    const filters = getFeedSubFilters('posts')
    expect(filters.map(f => f.path)).toEqual([
      '/feed/posts',
      '/feed/posts/friends',
      '/feed/posts/topics',
    ])
  })

  it('returns correct paths for news filters', () => {
    const filters = getFeedSubFilters('news')
    expect(filters.map(f => f.path)).toEqual([
      '/feed/news',
      '/feed/news/friends',
      '/feed/news/sources',
      '/feed/news/topics',
    ])
  })

  it('returns correct paths for podcasts filters', () => {
    const filters = getFeedSubFilters('podcasts')
    expect(filters.map(f => f.path)).toEqual([
      '/feed/podcasts',
      '/feed/podcasts/friends',
      '/feed/podcasts/sources',
      '/feed/podcasts/topics',
    ])
  })

  it('returns correct paths for videos filters', () => {
    const filters = getFeedSubFilters('videos')
    expect(filters.map(f => f.path)).toEqual([
      '/feed/videos',
      '/feed/videos/friends',
      '/feed/videos/sources',
      '/feed/videos/topics',
    ])
  })

  it('returns correct paths for referral-links filters', () => {
    const filters = getFeedSubFilters('referral-links')
    expect(filters.map(f => f.path)).toEqual([
      '/feed/referral-links',
      '/feed/referral-links/mutual',
    ])
  })
})

describe('feedRouteConfigs', () => {
  it('all configs have required fields', () => {
    const validCategories: FeedCategory[] = [
      'posts',
      'news',
      'podcasts',
      'videos',
      'referral-links',
    ]
    for (const config of Object.values(feedRouteConfigs)) {
      expect(config.title).toBeTruthy()
      expect(config.path).toMatch(/^\/feed\//)
      expect(config.feedType).toBeTruthy()
      expect(config.label).toBeTruthy()
      expect(validCategories).toContain(config.category)
    }
  })

  it('posts feedType values are valid PostFeedType', () => {
    const validTypes: PostFeedType[] = VALID_POST_FEED_TYPES.filter(
      (type): type is PostFeedType => type !== 'all',
    )
    const postConfigs = Object.values(feedRouteConfigs).filter(c => c.category === 'posts')
    for (const config of postConfigs) {
      expect(validTypes).toContain(config.feedType)
    }
  })

  it('news feedType values are valid NewsFeedType', () => {
    const validTypes: NewsFeedType[] = VALID_RSS_FEED_ITEM_FEED_TYPES.filter(
      (type): type is NewsFeedType => type !== 'all',
    )
    const newsConfigs = Object.values(feedRouteConfigs).filter(c => c.category === 'news')
    for (const config of newsConfigs) {
      expect(validTypes).toContain(config.feedType)
    }
  })

  it('podcasts feedType values are valid NewsFeedType', () => {
    const validTypes: NewsFeedType[] = VALID_RSS_FEED_ITEM_FEED_TYPES.filter(
      (type): type is NewsFeedType => type !== 'all',
    )
    const podcastConfigs = Object.values(feedRouteConfigs).filter(c => c.category === 'podcasts')
    expect(podcastConfigs.length).toBe(4)
    for (const config of podcastConfigs) {
      expect(validTypes).toContain(config.feedType)
    }
  })

  it('videos feedType values are valid NewsFeedType', () => {
    const validTypes: NewsFeedType[] = VALID_RSS_FEED_ITEM_FEED_TYPES.filter(
      (type): type is NewsFeedType => type !== 'all',
    )
    const videoConfigs = Object.values(feedRouteConfigs).filter(c => c.category === 'videos')
    expect(videoConfigs.length).toBe(4)
    for (const config of videoConfigs) {
      expect(validTypes).toContain(config.feedType)
    }
  })

  it('referral-links feedType values are valid ReferralLinksFeedType', () => {
    const validTypes: ReferralLinksFeedType[] = ['follow_users', 'mutual_follows']
    const configs = Object.values(feedRouteConfigs).filter(c => c.category === 'referral-links')
    expect(configs.length).toBe(2)
    for (const config of configs) {
      expect(validTypes).toContain(config.feedType)
    }
  })
})
