// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getActiveIntent } from '../intents'

describe('getActiveIntent', () => {
  describe('messages intent', () => {
    it('resolves /messages to messages', () => {
      expect(getActiveIntent('/messages')).toBe('messages')
    })

    it('resolves /messages/conv-123 to messages', () => {
      expect(getActiveIntent('/messages/conv-123')).toBe('messages')
    })

    it('resolves /my/notifications to messages', () => {
      expect(getActiveIntent('/my/notifications')).toBe('messages')
    })

    it('resolves /notification-redirect to messages', () => {
      expect(getActiveIntent('/notification-redirect')).toBe('messages')
    })
  })

  describe('news intent', () => {
    it('resolves /news to news', () => {
      expect(getActiveIntent('/news')).toBe('news')
    })

    it('resolves /news-sources to news', () => {
      expect(getActiveIntent('/news-sources')).toBe('news')
    })

    it('resolves /my/news-sources to news', () => {
      expect(getActiveIntent('/my/news-sources')).toBe('news')
    })

    it('resolves /feed/news to news', () => {
      expect(getActiveIntent('/feed/news')).toBe('news')
    })
  })

  describe('posts intent', () => {
    it('resolves /posts to posts', () => {
      expect(getActiveIntent('/posts')).toBe('posts')
    })

    it('resolves /feed/posts to posts', () => {
      expect(getActiveIntent('/feed/posts')).toBe('posts')
    })

    it('resolves /stories to posts', () => {
      expect(getActiveIntent('/stories')).toBe('posts')
    })

    it('resolves /story/123 to posts', () => {
      expect(getActiveIntent('/story/123')).toBe('posts')
    })

    it('resolves /discussions to posts', () => {
      expect(getActiveIntent('/discussions')).toBe('posts')
    })

    it('resolves /discussion/123 to posts', () => {
      expect(getActiveIntent('/discussion/123')).toBe('posts')
    })

    it('resolves /reviews to posts', () => {
      expect(getActiveIntent('/reviews')).toBe('posts')
    })

    it('resolves /review/123 to posts', () => {
      expect(getActiveIntent('/review/123')).toBe('posts')
    })

    it('resolves /data-points to posts', () => {
      expect(getActiveIntent('/data-points')).toBe('posts')
    })

    it('resolves /data-point/123 to posts', () => {
      expect(getActiveIntent('/data-point/123')).toBe('posts')
    })

    it('resolves /articles to posts', () => {
      expect(getActiveIntent('/articles')).toBe('posts')
    })

    it('resolves /article/keyboard-shortcuts to posts', () => {
      expect(getActiveIntent('/article/keyboard-shortcuts')).toBe('posts')
    })

    it('resolves /links to posts', () => {
      expect(getActiveIntent('/links')).toBe('posts')
    })

    it('resolves /link/123 to posts', () => {
      expect(getActiveIntent('/link/123')).toBe('posts')
    })

    it('resolves /blog to posts', () => {
      expect(getActiveIntent('/blog')).toBe('posts')
    })
  })

  describe('topics intent', () => {
    it('resolves /topics to topics', () => {
      expect(getActiveIntent('/topics')).toBe('topics')
    })

    it('resolves /topics/aliases to topics', () => {
      expect(getActiveIntent('/topics/aliases')).toBe('topics')
    })

    it('resolves /topics/create to topics', () => {
      expect(getActiveIntent('/topics/create')).toBe('topics')
    })

    it('resolves /topic-recommendations to topics', () => {
      expect(getActiveIntent('/topic-recommendations')).toBe('topics')
    })

    it('resolves /admin/topic-claims to topics', () => {
      expect(getActiveIntent('/admin/topic-claims')).toBe('topics')
    })

    it('resolves /rss-feed-categories to topics', () => {
      expect(getActiveIntent('/rss-feed-categories')).toBe('topics')
    })

    it('resolves /compare/abc-vs-def to topics', () => {
      expect(getActiveIntent('/compare/abc-vs-def')).toBe('topics')
    })

    it('resolves /topic-claims/123 to topics', () => {
      expect(getActiveIntent('/topic-claims/123')).toBe('topics')
    })

    it('resolves /card/123 to topics', () => {
      expect(getActiveIntent('/card/123')).toBe('topics')
    })

    it('resolves /referral-program/123 to topics', () => {
      expect(getActiveIntent('/referral-program/123')).toBe('topics')
    })

    it('resolves /rewards-program/123 to topics', () => {
      expect(getActiveIntent('/rewards-program/123')).toBe('topics')
    })

    it('resolves /rewards-program-status/123 to topics', () => {
      expect(getActiveIntent('/rewards-program-status/123')).toBe('topics')
    })

    it('resolves /bank-account/123 to topics', () => {
      expect(getActiveIntent('/bank-account/123')).toBe('topics')
    })
  })

  describe('moderation intent', () => {
    it('resolves /posts/review-queue to moderation (before /posts → posts)', () => {
      expect(getActiveIntent('/posts/review-queue')).toBe('moderation')
    })

    it('resolves /reports to moderation', () => {
      expect(getActiveIntent('/reports')).toBe('moderation')
    })

    it('resolves /appeals to moderation', () => {
      expect(getActiveIntent('/appeals')).toBe('moderation')
    })

    it('resolves /disputes to moderation', () => {
      expect(getActiveIntent('/disputes')).toBe('moderation')
    })

    it('resolves /admin/modlog to moderation', () => {
      expect(getActiveIntent('/admin/modlog')).toBe('moderation')
    })

    it('resolves /admin/moderation-analytics to moderation', () => {
      expect(getActiveIntent('/admin/moderation-analytics')).toBe('moderation')
    })

    it('resolves /admin/oauth-clients to moderation', () => {
      expect(getActiveIntent('/admin/oauth-clients')).toBe('moderation')
    })

    it('resolves /vote-integrity/flags to moderation', () => {
      expect(getActiveIntent('/vote-integrity/flags')).toBe('moderation')
    })

    it('resolves /report-integrity/flags to moderation', () => {
      expect(getActiveIntent('/report-integrity/flags')).toBe('moderation')
    })

    it('resolves both integrity penalty ledgers to moderation', () => {
      expect(getActiveIntent('/report-integrity/penalties')).toBe('moderation')
      expect(getActiveIntent('/vote-integrity/penalties')).toBe('moderation')
    })

    it('resolves /my/appeals to moderation', () => {
      expect(getActiveIntent('/my/appeals')).toBe('moderation')
    })

    it('resolves /my/disputes to moderation', () => {
      expect(getActiveIntent('/my/disputes')).toBe('moderation')
    })
  })
})
