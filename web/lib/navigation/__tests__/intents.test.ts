// @vitest-environment node
import { describe, it } from 'vitest'
import { getActiveIntent } from '../intents'
import {
  type ActiveIntentCheck,
  expectActiveIntent,
} from '@/test-helpers/navigation/active-intent-cases'

const cases: Array<{ title: string; checks: ActiveIntentCheck[] }> = [
  { title: 'resolves /feed/news to news', checks: [['/feed/news', 'news']] },
  { title: 'resolves /posts to posts', checks: [['/posts', 'posts']] },
  { title: 'resolves /feed/posts to posts', checks: [['/feed/posts', 'posts']] },
  { title: 'resolves /discussions to posts', checks: [['/discussions', 'posts']] },
  { title: 'resolves /reviews to posts', checks: [['/reviews', 'posts']] },
  { title: 'resolves /data-points to posts', checks: [['/data-points', 'posts']] },
  { title: 'resolves /articles to posts', checks: [['/articles', 'posts']] },
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
]

const assertions = {
  expect: (run: () => void) => run(),
}

describe('getActiveIntent', () => {
  it.each(cases)('$title', ({ checks }) =>
    assertions.expect(() => expectActiveIntent(getActiveIntent, checks)),
  )
})
