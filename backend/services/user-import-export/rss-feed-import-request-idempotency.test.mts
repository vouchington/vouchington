import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  WEB_PROVENANCE,
  getRssFeedImportRequestCountForRowForTest,
  getRssFeedImportRequestForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  createRssFeedImportRowForTest,
  deleteOwnedRssFeedImportRowForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import type { PrivateUser } from '@services/users/types'
import { importSingleRssFeed } from './import-rss-feeds.mts'

const importFeed = (user: PrivateUser, url: string, importRowId: string) =>
  importSingleRssFeed(user, WEB_PROVENANCE, url, { importRowId })

describe('RSS feed import request idempotency', () => {
  it('records one audit for a replayed row while preserving distinct submissions', async () => {
    const currentUser = await createTestUser()
    const otherUser = await createTestUser()
    const rssFeedUrl = `https://audit-replay-${randomUUID()}.example.com/feed.xml`
    await insertTestRssFeedDirect({ rssFeedUrl })
    const [firstRowId, secondRowId] = await Promise.all([
      createRssFeedImportRowForTest(currentUser.id, rssFeedUrl),
      createRssFeedImportRowForTest(otherUser.id, rssFeedUrl),
    ])

    await Promise.all([
      importFeed(currentUser, rssFeedUrl, firstRowId),
      importFeed(currentUser, rssFeedUrl, firstRowId),
    ])
    await importFeed(otherUser, rssFeedUrl, secondRowId)

    expect(await getRssFeedImportRequestCountForRowForTest(firstRowId)).toBe(1)
    expect(await getRssFeedImportRequestCountForRowForTest(secondRowId)).toBe(1)
  })

  it('retains the audit when its owned import row is deleted', async () => {
    const currentUser = await createTestUser()
    const rssFeedUrl = `https://audit-retention-${randomUUID()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const rowId = await createRssFeedImportRowForTest(currentUser.id, rssFeedUrl)

    await importFeed(currentUser, rssFeedUrl, rowId)
    const before = await getRssFeedImportRequestForTest(currentUser.id, rssFeed.id)
    expect(before).toMatchObject({ rss_feed_import_row_id: rowId })

    await deleteOwnedRssFeedImportRowForTest(currentUser.id, rowId)
    const after = await getRssFeedImportRequestForTest(currentUser.id, rssFeed.id)
    expect(after).toMatchObject({ id: before?.id, rss_feed_import_row_id: null })
  })
})
