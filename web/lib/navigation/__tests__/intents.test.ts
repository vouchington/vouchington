// @vitest-environment node
import { describe, it } from 'vitest'
import { getActiveIntent } from '../intents'
import {
  type ActiveIntentCheck,
  expectActiveIntent,
} from '@/test-helpers/navigation/active-intent-cases'

const cases: Array<{ title: string; checks: ActiveIntentCheck[] }> = [
  { title: 'resolves /messages to messages', checks: [['/messages', 'messages']] },
  {
    title: 'resolves /messages/conv-123 to messages',
    checks: [['/messages/conv-123', 'messages']],
  },
  { title: 'resolves /my/notifications to messages', checks: [['/my/notifications', 'messages']] },
  {
    title: 'resolves /notification-redirect to messages',
    checks: [['/notification-redirect', 'messages']],
  },
  { title: 'resolves /news to news', checks: [['/news', 'news']] },
  { title: 'resolves /news-sources to news', checks: [['/news-sources', 'news']] },
  { title: 'resolves /my/news-sources to news', checks: [['/my/news-sources', 'news']] },
  { title: 'resolves /feed/news to news', checks: [['/feed/news', 'news']] },
  { title: 'resolves /posts to posts', checks: [['/posts', 'posts']] },
  { title: 'resolves /feed/posts to posts', checks: [['/feed/posts', 'posts']] },
  { title: 'resolves /stories to posts', checks: [['/stories', 'posts']] },
  { title: 'resolves /story/123 to posts', checks: [['/story/123', 'posts']] },
  { title: 'resolves /discussions to posts', checks: [['/discussions', 'posts']] },
  { title: 'resolves /discussion/123 to posts', checks: [['/discussion/123', 'posts']] },
  { title: 'resolves /reviews to posts', checks: [['/reviews', 'posts']] },
  { title: 'resolves /review/123 to posts', checks: [['/review/123', 'posts']] },
  { title: 'resolves /data-points to posts', checks: [['/data-points', 'posts']] },
  { title: 'resolves /data-point/123 to posts', checks: [['/data-point/123', 'posts']] },
  { title: 'resolves /articles to posts', checks: [['/articles', 'posts']] },
  {
    title: 'resolves /article/keyboard-shortcuts to posts',
    checks: [['/article/keyboard-shortcuts', 'posts']],
  },
  { title: 'resolves /links to posts', checks: [['/links', 'posts']] },
  { title: 'resolves /link/123 to posts', checks: [['/link/123', 'posts']] },
  { title: 'resolves /blog to posts', checks: [['/blog', 'posts']] },
  { title: 'resolves /topics to topics', checks: [['/topics', 'topics']] },
  { title: 'resolves /topics/aliases to topics', checks: [['/topics/aliases', 'topics']] },
  { title: 'resolves /topics/create to topics', checks: [['/topics/create', 'topics']] },
  {
    title: 'resolves /topic-recommendations to topics',
    checks: [['/topic-recommendations', 'topics']],
  },
  { title: 'resolves /admin/topic-claims to topics', checks: [['/admin/topic-claims', 'topics']] },
  {
    title: 'resolves /rss-feed-categories to topics',
    checks: [['/rss-feed-categories', 'topics']],
  },
  { title: 'resolves /compare/abc-vs-def to topics', checks: [['/compare/abc-vs-def', 'topics']] },
  { title: 'resolves /topic-claims/123 to topics', checks: [['/topic-claims/123', 'topics']] },
  { title: 'resolves /card/123 to topics', checks: [['/card/123', 'topics']] },
  {
    title: 'resolves /referral-program/123 to topics',
    checks: [['/referral-program/123', 'topics']],
  },
  {
    title: 'resolves /rewards-program/123 to topics',
    checks: [['/rewards-program/123', 'topics']],
  },
  {
    title: 'resolves /rewards-program-status/123 to topics',
    checks: [['/rewards-program-status/123', 'topics']],
  },
  { title: 'resolves /bank-account/123 to topics', checks: [['/bank-account/123', 'topics']] },
  {
    title: 'resolves /posts/review-queue to moderation (before /posts → posts)',
    checks: [['/posts/review-queue', 'moderation']],
  },
  { title: 'resolves /reports to moderation', checks: [['/reports', 'moderation']] },
  { title: 'resolves /appeals to moderation', checks: [['/appeals', 'moderation']] },
  { title: 'resolves /disputes to moderation', checks: [['/disputes', 'moderation']] },
  { title: 'resolves /admin/modlog to moderation', checks: [['/admin/modlog', 'moderation']] },
  {
    title: 'resolves /admin/moderation-analytics to moderation',
    checks: [['/admin/moderation-analytics', 'moderation']],
  },
  {
    title: 'resolves /admin/oauth-clients to moderation',
    checks: [['/admin/oauth-clients', 'moderation']],
  },
  {
    title: 'resolves /vote-integrity/flags to moderation',
    checks: [['/vote-integrity/flags', 'moderation']],
  },
  {
    title: 'resolves /report-integrity/flags to moderation',
    checks: [['/report-integrity/flags', 'moderation']],
  },
  {
    title: 'resolves both integrity penalty ledgers to moderation',
    checks: [
      ['/report-integrity/penalties', 'moderation'],
      ['/vote-integrity/penalties', 'moderation'],
    ],
  },
  { title: 'resolves /my/appeals to moderation', checks: [['/my/appeals', 'moderation']] },
  { title: 'resolves /my/disputes to moderation', checks: [['/my/disputes', 'moderation']] },
]

const assertions = {
  expect: (run: () => void) => run(),
}

describe('getActiveIntent', () => {
  it.each(cases)('$title', ({ checks }) =>
    assertions.expect(() => expectActiveIntent(getActiveIntent, checks)),
  )
})
