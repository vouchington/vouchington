import { describe, expect, it } from 'vitest'
import { getActiveIntent } from '../resolver'

describe('getActiveIntent', () => {
  it('resolves /web-search to web-search', () => {
    expect(getActiveIntent('/web-search')).toBe('web-search')
  })

  it('resolves /sources to web-search', () => {
    expect(getActiveIntent('/sources')).toBe('web-search')
  })

  it('resolves /source/123 to web-search (baseline; per-feed_type client override via SetNavIntent)', () => {
    expect(getActiveIntent('/source/123')).toBe('web-search')
  })

  it('resolves /domain/www.youtube.com to web-search', () => {
    expect(getActiveIntent('/domain/www.youtube.com')).toBe('web-search')
  })

  it('resolves /domain/ to web-search', () => {
    expect(getActiveIntent('/domain/')).toBe('web-search')
  })

  it('resolves /sources/create to web-search', () => {
    expect(getActiveIntent('/sources/create')).toBe('web-search')
  })

  it('resolves /domains to web-search', () => {
    expect(getActiveIntent('/domains')).toBe('web-search')
  })

  it('resolves /news to news', () => {
    expect(getActiveIntent('/news')).toBe('news')
  })

  it('resolves /stories to posts', () => {
    expect(getActiveIntent('/stories')).toBe('posts')
  })

  it('resolves /feed/podcasts to podcasts', () => {
    expect(getActiveIntent('/feed/podcasts')).toBe('podcasts')
  })

  it('resolves /feed/videos to videos', () => {
    expect(getActiveIntent('/feed/videos')).toBe('videos')
  })

  it('resolves /podcast-episodes to podcasts (before /podcasts prefix)', () => {
    expect(getActiveIntent('/podcast-episodes')).toBe('podcasts')
  })

  it('resolves /my/podcasts to podcasts', () => {
    expect(getActiveIntent('/my/podcasts')).toBe('podcasts')
  })

  it('resolves /my/channels to videos', () => {
    expect(getActiveIntent('/my/channels')).toBe('videos')
  })

  it('resolves /my/news-items to news', () => {
    expect(getActiveIntent('/my/news-items')).toBe('news')
  })

  it('resolves /my/news-items/saved to news', () => {
    expect(getActiveIntent('/my/news-items/saved')).toBe('news')
  })

  it('resolves /my/podcast-episodes to podcasts', () => {
    expect(getActiveIntent('/my/podcast-episodes')).toBe('podcasts')
  })

  it('resolves /my/podcast-episodes/saved to podcasts', () => {
    expect(getActiveIntent('/my/podcast-episodes/saved')).toBe('podcasts')
  })

  it('resolves /my/videos to videos', () => {
    expect(getActiveIntent('/my/videos')).toBe('videos')
  })

  it('resolves /my/videos/saved to videos', () => {
    expect(getActiveIntent('/my/videos/saved')).toBe('videos')
  })

  it('resolves /my/news-sources to news', () => {
    expect(getActiveIntent('/my/news-sources')).toBe('news')
  })

  it('resolves /news-sources to news', () => {
    expect(getActiveIntent('/news-sources')).toBe('news')
  })

  it('resolves /channels to videos', () => {
    expect(getActiveIntent('/channels')).toBe('videos')
  })

  it('resolves /my/sources/import-export to web-search', () => {
    expect(getActiveIntent('/my/sources/import-export')).toBe('web-search')
  })

  it('resolves /messages to messages (WS3)', () => {
    expect(getActiveIntent('/messages')).toBe('messages')
  })

  it('resolves /messages/conv-123 to messages (WS3)', () => {
    expect(getActiveIntent('/messages/conv-123')).toBe('messages')
  })

  it('resolves /my/notifications to messages (WS3)', () => {
    expect(getActiveIntent('/my/notifications')).toBe('messages')
  })

  it('resolves /notification-redirect to messages (WS3)', () => {
    expect(getActiveIntent('/notification-redirect')).toBe('messages')
  })

  it('resolves /my/appeals to moderation before /appeals (WS2)', () => {
    expect(getActiveIntent('/my/appeals')).toBe('moderation')
  })

  it('resolves /my/disputes to moderation (WS2)', () => {
    expect(getActiveIntent('/my/disputes')).toBe('moderation')
  })

  it('resolves account settings routes to settings', () => {
    expect(getActiveIntent('/my/identity')).toBe('settings')
    expect(getActiveIntent('/my/privacy')).toBe('settings')
    expect(getActiveIntent('/my/membership')).toBe('settings')
    expect(getActiveIntent('/moderation-transparency')).toBe('settings')
  })

  it('resolves profile settings routes to settings', () => {
    expect(getActiveIntent('/my/profile')).toBe('settings')
    expect(getActiveIntent('/my/cards')).toBe('settings')
    expect(getActiveIntent('/my/spending-categories')).toBe('settings')
  })

  it('resolves advanced settings routes to settings', () => {
    expect(getActiveIntent('/my/preferences')).toBe('settings')
    expect(getActiveIntent('/my/account-status')).toBe('settings')
    expect(getActiveIntent('/my/api-keys')).toBe('settings')
  })

  it('resolves /links to posts (WS1)', () => {
    expect(getActiveIntent('/links')).toBe('posts')
  })

  it('resolves /link/123 to posts (WS1)', () => {
    expect(getActiveIntent('/link/123')).toBe('posts')
  })

  it('resolves /article/keyboard-shortcuts to posts (WS5)', () => {
    expect(getActiveIntent('/article/keyboard-shortcuts')).toBe('posts')
  })

  it('resolves /story/123 to posts (WS5)', () => {
    expect(getActiveIntent('/story/123')).toBe('posts')
  })

  it('resolves /discussion/123 to posts (WS5)', () => {
    expect(getActiveIntent('/discussion/123')).toBe('posts')
  })

  it('resolves /review/123 to posts (WS5)', () => {
    expect(getActiveIntent('/review/123')).toBe('posts')
  })

  it('resolves /data-point/123 to posts (WS5)', () => {
    expect(getActiveIntent('/data-point/123')).toBe('posts')
  })

  it('resolves /compare/abc-vs-def to topics (WS1)', () => {
    expect(getActiveIntent('/compare/abc-vs-def')).toBe('topics')
  })

  it('resolves /topic-claims/123 to topics (WS1 — distinct from /admin/topic-claims)', () => {
    expect(getActiveIntent('/topic-claims/123')).toBe('topics')
  })

  it('resolves /card/123 to topics (WS5)', () => {
    expect(getActiveIntent('/card/123')).toBe('topics')
  })

  it('resolves /referral-program/123 to topics (WS5 — distinct from /referral-programs → referral-links)', () => {
    expect(getActiveIntent('/referral-program/123')).toBe('topics')
  })

  it('resolves /rewards-program/123 to topics (WS5)', () => {
    expect(getActiveIntent('/rewards-program/123')).toBe('topics')
  })

  it('resolves /rewards-program-status/123 to topics (WS5)', () => {
    expect(getActiveIntent('/rewards-program-status/123')).toBe('topics')
  })

  it('resolves /bank-account/123 to topics (WS5)', () => {
    expect(getActiveIntent('/bank-account/123')).toBe('topics')
  })

  it('resolves /crawler/123 to web-search (WS1)', () => {
    expect(getActiveIntent('/crawler/123')).toBe('web-search')
  })

  it('resolves /crawler/123/edit to web-search (WS1)', () => {
    expect(getActiveIntent('/crawler/123/edit')).toBe('web-search')
  })

  it('still resolves /referral-programs to referral-links (not confused by /referral-program/)', () => {
    expect(getActiveIntent('/referral-programs')).toBe('referral-links')
  })

  it('still resolves /rewards-programs to topics (not confused by /rewards-program/)', () => {
    expect(getActiveIntent('/rewards-programs')).toBe('topics')
  })

  it('returns news as fallback for unrecognized paths', () => {
    expect(getActiveIntent('/something-unknown')).toBe('news')
  })
})
