import { describe, expect, it } from 'vitest'
import { createLocalTestUser } from '../../../../test-helpers/data-stores/psql/users.mts'
import { createLocalTestMembership } from '../../../../test-helpers/data-stores/psql/rss-feeds.mts'

describe('mv_rss_feed_crawl_tiers', () => {
  it('depends on the single-current-membership invariant for follower weighting', async () => {
    const user = await createLocalTestUser()
    await createLocalTestMembership(user.id, { plan: 'plus' })

    await expect(createLocalTestMembership(user.id, { plan: 'pro' })).rejects.toMatchObject({
      code: '23505',
    })
  })
})
