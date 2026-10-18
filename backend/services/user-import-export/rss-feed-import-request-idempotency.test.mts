import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getRssFeedImportRequestCountForRowForTest,
  getRssFeedImportRequestForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  createRssFeedImportRowForTest,
  deleteOwnedRssFeedImportRowForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { recordRssFeedImportRequest } from './import-rss-feeds.mts'

describe('RSS feed import request idempotency', () => {
  it('records one audit for a replayed row while preserving distinct submissions', async () => {
    const currentUser = await createTestUser()
    const rssFeedUrl = `https://audit-replay-${randomUUID()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const [firstRowId, secondRowId] = await Promise.all([
      createRssFeedImportRowForTest(currentUser.id, rssFeedUrl),
      createRssFeedImportRowForTest(currentUser.id, rssFeedUrl),
    ])

    await Promise.all([
      recordRssFeedImportRequest(currentUser.id, rssFeedUrl, rssFeed.id, firstRowId),
      recordRssFeedImportRequest(currentUser.id, rssFeedUrl, rssFeed.id, firstRowId),
    ])
    await recordRssFeedImportRequest(currentUser.id, rssFeedUrl, rssFeed.id, secondRowId)

    expect(await getRssFeedImportRequestCountForRowForTest(firstRowId)).toBe(1)
    expect(await getRssFeedImportRequestCountForRowForTest(secondRowId)).toBe(1)
  })

  it('retains the audit when its owned import row is deleted', async () => {
    const currentUser = await createTestUser()
    const rssFeedUrl = `https://audit-retention-${randomUUID()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const rowId = await createRssFeedImportRowForTest(currentUser.id, rssFeedUrl)

    await recordRssFeedImportRequest(currentUser.id, rssFeedUrl, rssFeed.id, rowId)
    const before = await getRssFeedImportRequestForTest(currentUser.id, rssFeed.id)
    expect(before).toMatchObject({ rss_feed_import_row_id: rowId })

    await deleteOwnedRssFeedImportRowForTest(currentUser.id, rowId)
    const after = await getRssFeedImportRequestForTest(currentUser.id, rssFeed.id)
    expect(after).toMatchObject({ id: before?.id, rss_feed_import_row_id: null })
  })
})
