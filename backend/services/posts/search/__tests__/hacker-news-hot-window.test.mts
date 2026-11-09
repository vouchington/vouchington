import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { postsWorkConfig } from '../../work-limits.mts'
import { getPostIds } from '../get-ids.mts'

describe('Hacker News hot elapsed-day cutoff', () => {
  it('caps every range at thirty days after a 31-day month, including the boundary and narrower windows', async () => {
    await Promise.all([
      postsWorkConfig.waitForInitialization(),
      hackerNewsVisibilityConfig.waitForInitialization(),
    ])
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected a hot window test user')
    const decisionInstant = Date.parse('2027-11-06T12:00:00Z')
    const cutoff = decisionInstant - 30 * 86_400_000
    const ids: string[] = []
    const restoreCap = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      hacker_news_hot_candidate_limit: 1000,
    })
    const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: true,
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(decisionInstant)
    try {
      for (const timestamp of [decisionInstant - 5 * 86_400_000, cutoff + 1, cutoff, cutoff - 1]) {
        ids.push(
          await insertTestPost({
            createdById: user.id,
            createdAt: new Date(timestamp),
            title: `HN elapsed cutoff ${crypto.randomUUID()}`,
            slug: `hn-elapsed-cutoff-${crypto.randomUUID()}`,
            markdown: '',
          }),
        )
        await setPostVotesScoreUp(ids.at(-1)!, 1)
      }
      await setHackerNewsReferenceFlagsForTest(ids, [])
      const options = {
        user_id: user.id,
        has_hacker_news_references: true,
        sort: 'hot',
        limit: 10,
      } as const
      for (const time_range of ['1m', '1y', 'all'] as const) {
        const page = await getPostIds(user, { ...options, time_range })
        expect(page.results.map(row => row.id)).toEqual(ids.slice(0, 3))
      }
      const narrower = await getPostIds(user, { ...options, time_range: '1w' })
      expect(narrower.results.map(row => row.id)).toEqual([ids[0]])
    } finally {
      vi.useRealTimers()
      restoreVisibility()
      restoreCap()
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })
})
