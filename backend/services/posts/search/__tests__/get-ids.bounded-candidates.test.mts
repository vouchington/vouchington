import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { postsWorkConfig } from '../../work-limits.mts'
import { getPostIds } from '../get-ids.mts'

describe('bounded post search candidates', () => {
  it('advances past inspected but filtered rows and uses a returned-row cursor on a full page', async () => {
    await postsWorkConfig.waitForInitialization()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected bounded search test user')
    await withDominantPostFixtures(
      [997, 998, 999].map(milliseconds => ({
        createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
        votesScoreUp: 1000,
        postType: 'topic_recommendation' as const,
        createdById: user.id,
      })),
      async ([oldest, middle, newest]) => {
        const options = {
          user_id: user.id,
          post_types: ['topic_recommendation'] as const,
          sort: 'new' as const,
          time_range: 'all' as const,
          limit: 1,
        }
        const full = await getPostIds(undefined, {
          ...options,
          post_types: [...options.post_types],
        })
        expect(full.results.map(row => row.id)).toEqual([newest])
        expect(full.page_info.has_next_page).toBe(true)

        const filtered = await getPostIds(undefined, {
          ...options,
          post_types: [...options.post_types],
          exclude_post_ids: [newest!, middle!],
        })
        expect(filtered.results.map(row => row.id)).toEqual([oldest])
        expect(filtered.page_info.has_next_page).toBe(false)
      },
    )
  })
})
