import { describe, it } from 'vitest'
import { getActiveIntent } from '../resolver'
import {
  type ActiveIntentCheck,
  expectActiveIntent,
} from '@/test-helpers/navigation/active-intent-cases'

const cases: Array<{ title: string; checks: ActiveIntentCheck[] }> = [
  { title: 'resolves /web-search to web-search', checks: [['/web-search', 'web-search']] },
  { title: 'resolves /sources to web-search', checks: [['/sources', 'web-search']] },
  {
    title:
      'resolves /source/123 to web-search (baseline; per-feed_type client override via SetNavIntent)',
    checks: [['/source/123', 'web-search']],
  },
  {
    title: 'resolves /domain/www.youtube.com to web-search',
    checks: [['/domain/www.youtube.com', 'web-search']],
  },
  { title: 'resolves /domain/ to web-search', checks: [['/domain/', 'web-search']] },
  { title: 'resolves /sources/create to web-search', checks: [['/sources/create', 'web-search']] },
  { title: 'resolves /domains to web-search', checks: [['/domains', 'web-search']] },
  { title: 'resolves /news to news', checks: [['/news', 'news']] },
  { title: 'resolves /stories to posts', checks: [['/stories', 'posts']] },
  { title: 'resolves /feed/podcasts to podcasts', checks: [['/feed/podcasts', 'podcasts']] },
  { title: 'resolves /feed/videos to videos', checks: [['/feed/videos', 'videos']] },
  {
    title: 'resolves /podcast-episodes to podcasts (before /podcasts prefix)',
    checks: [['/podcast-episodes', 'podcasts']],
  },
  { title: 'resolves /my/podcasts to podcasts', checks: [['/my/podcasts', 'podcasts']] },
  { title: 'resolves /my/channels to videos', checks: [['/my/channels', 'videos']] },
  { title: 'resolves /my/news-items to news', checks: [['/my/news-items', 'news']] },
  { title: 'resolves /my/news-items/saved to news', checks: [['/my/news-items/saved', 'news']] },
  {
    title: 'resolves /my/podcast-episodes to podcasts',
    checks: [['/my/podcast-episodes', 'podcasts']],
  },
  {
    title: 'resolves /my/podcast-episodes/saved to podcasts',
    checks: [['/my/podcast-episodes/saved', 'podcasts']],
  },
  { title: 'resolves /my/videos to videos', checks: [['/my/videos', 'videos']] },
  { title: 'resolves /my/videos/saved to videos', checks: [['/my/videos/saved', 'videos']] },
  { title: 'resolves /my/news-sources to news', checks: [['/my/news-sources', 'news']] },
  { title: 'resolves /news-sources to news', checks: [['/news-sources', 'news']] },
  { title: 'resolves /channels to videos', checks: [['/channels', 'videos']] },
  {
    title: 'resolves /my/sources/import-export to web-search',
    checks: [['/my/sources/import-export', 'web-search']],
  },
  { title: 'resolves /messages to messages (WS3)', checks: [['/messages', 'messages']] },
  {
    title: 'resolves /messages/conv-123 to messages (WS3)',
    checks: [['/messages/conv-123', 'messages']],
  },
  {
    title: 'resolves /my/notifications to messages (WS3)',
    checks: [['/my/notifications', 'messages']],
  },
  {
    title: 'resolves /notification-redirect to messages (WS3)',
    checks: [['/notification-redirect', 'messages']],
  },
  {
    title: 'resolves /my/appeals to moderation before /appeals (WS2)',
    checks: [['/my/appeals', 'moderation']],
  },
  { title: 'resolves /my/disputes to moderation (WS2)', checks: [['/my/disputes', 'moderation']] },
  {
    title: 'resolves account settings routes to settings',
    checks: [
      ['/my/identity', 'settings'],
      ['/my/privacy', 'settings'],
      ['/my/membership', 'settings'],
      ['/moderation-transparency', 'settings'],
    ],
  },
  {
    title: 'resolves profile settings routes to settings',
    checks: [
      ['/my/profile', 'settings'],
      ['/my/cards', 'settings'],
      ['/my/spending-categories', 'settings'],
    ],
  },
  {
    title: 'resolves advanced settings routes to settings',
    checks: [
      ['/my/preferences', 'settings'],
      ['/my/account-status', 'settings'],
      ['/my/api-keys', 'settings'],
      ['/my/connected-apps', 'settings'],
    ],
  },
  { title: 'resolves /links to posts (WS1)', checks: [['/links', 'posts']] },
  { title: 'resolves /link/123 to posts (WS1)', checks: [['/link/123', 'posts']] },
  {
    title: 'resolves /article/keyboard-shortcuts to posts (WS5)',
    checks: [['/article/keyboard-shortcuts', 'posts']],
  },
  { title: 'resolves /story/123 to posts (WS5)', checks: [['/story/123', 'posts']] },
  { title: 'resolves /discussion/123 to posts (WS5)', checks: [['/discussion/123', 'posts']] },
  { title: 'resolves /review/123 to posts (WS5)', checks: [['/review/123', 'posts']] },
  { title: 'resolves /data-point/123 to posts (WS5)', checks: [['/data-point/123', 'posts']] },
  {
    title: 'resolves /compare/abc-vs-def to topics (WS1)',
    checks: [['/compare/abc-vs-def', 'topics']],
  },
  {
    title: 'resolves /topic-claims/123 to topics (WS1 — distinct from /admin/topic-claims)',
    checks: [['/topic-claims/123', 'topics']],
  },
  { title: 'resolves /card/123 to topics (WS5)', checks: [['/card/123', 'topics']] },
  {
    title:
      'resolves /referral-program/123 to topics (WS5 — distinct from /referral-programs → referral-links)',
    checks: [['/referral-program/123', 'topics']],
  },
  {
    title: 'resolves /rewards-program/123 to topics (WS5)',
    checks: [['/rewards-program/123', 'topics']],
  },
  {
    title: 'resolves /rewards-program-status/123 to topics (WS5)',
    checks: [['/rewards-program-status/123', 'topics']],
  },
  {
    title: 'resolves /bank-account/123 to topics (WS5)',
    checks: [['/bank-account/123', 'topics']],
  },
  { title: 'resolves /crawler/123 to web-search (WS1)', checks: [['/crawler/123', 'web-search']] },
  {
    title: 'resolves /crawler/123/edit to web-search (WS1)',
    checks: [['/crawler/123/edit', 'web-search']],
  },
  {
    title:
      'still resolves /referral-programs to referral-links (not confused by /referral-program/)',
    checks: [['/referral-programs', 'referral-links']],
  },
  {
    title: 'still resolves /rewards-programs to topics (not confused by /rewards-program/)',
    checks: [['/rewards-programs', 'topics']],
  },
  {
    title: 'returns news as fallback for unrecognized paths',
    checks: [['/something-unknown', 'news']],
  },
]

const assertions = {
  expect: (run: () => void) => run(),
}

describe('getActiveIntent', () => {
  it.each(cases)('$title', ({ checks }) =>
    assertions.expect(() => expectActiveIntent(getActiveIntent, checks)),
  )
})
