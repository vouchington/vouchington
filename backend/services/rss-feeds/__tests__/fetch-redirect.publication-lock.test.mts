import * as postPublication from '@services/post-publication'
import { beginTransaction, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { disableAndHideSource } from '../fetch-redirect.mts'

describe('permanent RSS redirect publication locking', () => {
  it('takes the feed publication scope before waiting on redirect state changes', async () => {
    const feed = await insertTestRssFeedDirect({})
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    async function holdFeedRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* permanent RSS redirect publication lock test */
        SELECT 1 FROM rss_feeds WHERE id = $1::uuid FOR UPDATE`,
        [feed.id],
      )
      rowLocked.resolve()
      await releaseRow.promise
      await query.commit()
    }
    const holder = holdFeedRow()
    await rowLocked.promise
    const lockFeeds = postPublication.lockPostPublicationRssFeedScopes
    const feedsLocked = Promise.withResolvers<void>()
    const feedSpy = vi
      .spyOn(postPublication, 'lockPostPublicationRssFeedScopes')
      .mockImplementation(async (query, rssFeedIds) => {
        await lockFeeds(query, rssFeedIds)
        feedsLocked.resolve()
      })

    const disabling = disableAndHideSource(feed.id)
    try {
      await feedsLocked.promise
      await expect(contendForFeedPublicationScope()).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseRow.resolve()
      feedSpy.mockRestore()
    }
    await holder
    await expect(disabling).resolves.toBeUndefined()

    async function contendForFeedPublicationScope(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* permanent RSS redirect publication lock timeout */ SET LOCAL lock_timeout = '50ms'`,
      )
      await lockFeeds(query, [feed.id])
      await query.commit()
    }
  })
})
