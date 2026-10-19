import { describe, expect, it } from 'vitest'
import { createTestUser, suspendTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'

const feedUrl = () => `https://suspended-import-${crypto.randomUUID()}.example.com/feed.xml`

describe('RSS feed import suspension', () => {
  it('fails the remaining rows when the user is suspended after submit', async () => {
    const user = await createTestUser()
    const urls = [feedUrl(), feedUrl()]
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, urls, {
      should_follow_imported_feeds: false,
    })
    await suspendTestUser(user.id)

    await Promise.all(
      (await getRssFeedImportRowIds(created.import.id)).map(rowId =>
        processRssFeedImportRow(created.import.id, rowId),
      ),
    )

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({ completed_rows: 0, failed_rows: 2, pending_rows: 0 })
    expect(status?.rows).toEqual([
      expect.objectContaining({ status: 'error', error_code: 'ACCOUNT_SUSPENDED' }),
      expect.objectContaining({ status: 'error', error_code: 'ACCOUNT_SUSPENDED' }),
    ])
    expect(status?.rows.every(row => row.entity_id === undefined)).toBe(true)
  })
})
