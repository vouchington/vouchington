import { readPostsForDayPage } from '@services/sitemaps/daily-queries'
import { readSitemapFamilyPage } from '@services/sitemaps/family-queries'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid } from '../seed-data/common.mts'

/** Existing representative seeds exercise both source bounds and expanded topic URLs. */
export async function runSitemapPageScenarios(): Promise<void> {
  registerScenarioContract('sitemap-users-page', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['users_pkey'] },
      { kind: 'maxProcessedRows', relation: 'users', max: 25 },
    ],
  })
  await runAndCapture('sitemap-users-page', async () => {
    const page = await readSitemapFamilyPage('users', {
      highWaterId: seedUuid(19999, '01'),
      afterId: seedUuid(19900, '01'),
      afterPath: '/user/seeduser19900',
      limit: 11,
    })
    if (page.length !== 11) throw new Error('Missing bounded sitemap user source page')
  })

  registerScenarioContract('sitemap-topics-page', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['topics_pkey'] },
      { kind: 'maxProcessedRows', relation: 'topics', max: 25 },
    ],
  })
  await runAndCapture('sitemap-topics-page', async () => {
    const page = await readSitemapFamilyPage('topics', {
      highWaterId: seedUuid(2499, '04'),
      afterId: seedUuid(2400, '04'),
      afterPath: '/topic/seed-topic-2400/posts',
      limit: 11,
    })
    if (page.length !== 11) throw new Error('Missing bounded sitemap topic source page')
  })

  registerScenarioContract('sitemap-post-day-page', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 5000 }],
  })
  await runAndCapture('sitemap-post-day-page', async () => {
    const day = new Date(postSeedTimestampMs(0)).toISOString().slice(0, 10)
    const page = await readPostsForDayPage('discussion', day, { limit: 11 })
    if (page.length === 0 || page.length > 11)
      throw new Error('Missing bounded sitemap post-day source page')
  })
}
