import { it, expect, describe, beforeAll } from 'vitest'
import { createTestUser, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { upsertRecentlyViewed } from '@services/recently-viewed'
import { getUserRssFeedsCollection } from './get-rss-feeds-collection.mts'
import type { PrivateUser } from '@services/users/types'

describe('getUserRssFeedsCollection', () => {
  let user: PrivateUser
  let rssFeedId: string

  beforeAll(async () => {
    user = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    rssFeedId = feed.id
    await upsertRecentlyViewed('rss_feed', rssFeedId, null, user.id)
  })

  it('returns recently viewed rss feeds when listType is viewed', async () => {
    const { results, page_info } = await getUserRssFeedsCollection(user.id, 'viewed')

    const ids = results.map(f => f.id)
    expect(ids).toContain(rssFeedId)
    expect(page_info.has_next_page).toBe(false)
  })

  it('filters viewed rss feeds by feedType when feedType matches', async () => {
    const { results } = await getUserRssFeedsCollection(user.id, 'viewed', {
      feedType: 'article',
    })

    const ids = results.map(f => f.id)
    expect(ids).toContain(rssFeedId)
  })

  it('excludes viewed rss feeds when feedType does not match', async () => {
    const { results } = await getUserRssFeedsCollection(user.id, 'viewed', {
      feedType: 'podcast',
    })

    const ids = results.map(f => f.id)
    expect(ids).not.toContain(rssFeedId)
  })

  it('keeps unfiltered viewed terminal after the default limit', async () => {
    const owner = await createTestUser()
    for (let index = 0; index < 26; index++) {
      const feed = await insertTestRssFeedDirect({})
      await upsertRecentlyViewed('rss_feed', feed.id, null, owner.id)
    }

    const { results, page_info } = await getUserRssFeedsCollection(owner.id, 'viewed')
    expect(results).toHaveLength(25)
    expect(page_info).toMatchObject({ has_next_page: false, end_cursor: null })
  })
})
