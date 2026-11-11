import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  deleteRssFeedImportBatchWithoutRowsForTest,
  insertRssFeedImportBatchWithoutRowsForTest,
} from '@voucha/test-helpers/sql-rss-feeds'
import type { PrivateUser } from '@services/users/types'
import { createRssFeedImport, getRssFeedImportRowWithBatch } from './rss-feed-import-records.mts'
import { getRssFeedImport } from './rss-feed-import-status.mts'

describe('RSS feed import records', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns row IDs in the input order', async () => {
    const urls = [
      `https://rss-row-${randomUUID()}.example.com/one`,
      `https://rss-row-${randomUUID()}.example.com/two`,
    ]
    const created = await createRssFeedImport(user.id, WEB_PROVENANCE, urls, false)

    await expect(
      Promise.all(
        (await getRssFeedImportRowIds(created.import.id)).map(id =>
          getRssFeedImportRowWithBatch(id),
        ),
      ),
    ).resolves.toMatchObject(urls.map(input_url => ({ row: { input_url } })))
  })

  it('continues rejecting an empty direct-service batch', async () => {
    // The batch size constraint rejects zero rows.
    await expect(createRssFeedImport(user.id, WEB_PROVENANCE, [], false)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects a direct-service batch above the progress count bound', async () => {
    const urls = Array.from({ length: 501 }, (_, index) => `https://example.com/rss/${index}`)
    await expect(createRssFeedImport(user.id, WEB_PROVENANCE, urls, false)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('returns an owned batch with no persisted rows without inventing a row', async () => {
    const importId = await insertRssFeedImportBatchWithoutRowsForTest(user.id)
    try {
      await expect(getRssFeedImport(user.id, importId)).resolves.toMatchObject({
        import: { id: importId, total_rows: 1, pending_rows: 0 },
        rows: [],
      })
    } finally {
      await deleteRssFeedImportBatchWithoutRowsForTest(importId)
    }
  })

  it('does not reveal an import to another user or return a missing import', async () => {
    const otherUser = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://rss-private-${randomUUID()}.example.com/feed`],
      false,
    )

    await expect(getRssFeedImport(otherUser.id, created.import.id)).resolves.toBeNull()
    await expect(getRssFeedImport(user.id, randomUUID())).resolves.toBeNull()
  })
})
