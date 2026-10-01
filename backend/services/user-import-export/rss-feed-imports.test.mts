import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'
import type { PrivateUser } from '@services/users/types'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'
import {
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from './rss-feed-import-row-updates.mts'

describe('RSS feed import batches', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('creates a pending import batch with one row per URL', async () => {
    const urls = [
      `https://batch-import-a-${Date.now()}.example.com/rss`,
      `https://batch-import-b-${Date.now()}.example.com/rss`,
    ]

    const created = await submitRssFeedImport(user, urls, { follow: false })
    const status = await getRssFeedImport(user.id, created.import.id)

    expect(created.rowIds).toHaveLength(2)
    expect(status?.import).toMatchObject({
      id: created.import.id,
      total_rows: 2,
      completed_rows: 0,
      failed_rows: 0,
      pending_rows: 2,
    })
    expect(status?.rows.map(row => row.status)).toEqual(['pending', 'pending'])
  })

  it('rejects imports above the per-import cap', async () => {
    await expect(
      submitRssFeedImport(
        user,
        Array.from({ length: 501 }, (_, index) => `https://too-many-${index}.example.com/rss`),
      ),
    ).rejects.toThrow('Maximum 500 URLs per import')
  })

  it('stores a maximum-size import in one batch while preserving row order', async () => {
    const suffix = Date.now()
    const urls = Array.from(
      { length: 500 },
      (_, index) => `https://scale-import-${suffix}-${index}.example.com/rss`,
    )

    const created = await submitRssFeedImport(user, urls, { follow: false })
    const status = await getRssFeedImport(user.id, created.import.id)

    expect(created.rowIds).toHaveLength(500)
    expect(status?.import).toMatchObject({ total_rows: 500, pending_rows: 500 })
    expect(status?.rows).toHaveLength(500)
    expect(status?.rows.map(row => row.input)).toEqual(urls)
  })

  it('rejects rows that do not belong to the requested import', async () => {
    const first = await submitRssFeedImport(user, [
      `https://wrong-import-a-${Date.now()}.example.com/rss`,
    ])
    const second = await submitRssFeedImport(user, [
      `https://wrong-import-b-${Date.now()}.example.com/rss`,
    ])

    await expect(processRssFeedImportRow(first.import.id, second.rowIds[0]!)).rejects.toThrow(
      `belongs to import ${second.import.id}`,
    )
  })

  it('marks rows failed when the import user is no longer available', async () => {
    const transientUser = await createTestUser()
    const created = await submitRssFeedImport(transientUser, [
      `https://missing-user-import-${Date.now()}.example.com/rss`,
    ])
    await softDeleteUser(transientUser.id)

    await processRssFeedImportRow(created.import.id, created.rowIds[0]!)

    const status = await getRssFeedImport(transientUser.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error: 'Import user not found',
    })
  })

  it('records a successful existing-feed row', async () => {
    const rssFeedUrl = `https://existing-import-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const created = await submitRssFeedImport(user, [rssFeedUrl])

    await processRssFeedImportRow(created.import.id, created.rowIds[0]!)

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 1,
      failed_rows: 0,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      input: rssFeedUrl,
      status: 'followed',
      entity_id: rssFeed.id,
    })
  })

  it('records a source_created row for a newly created feed', async () => {
    const rssFeedUrl = `https://new-import-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({})
    const createSourceFromUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      status: 'created',
      topic_slug: 'new-import',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })
    const created = await submitRssFeedImport(user, [rssFeedUrl])

    await processRssFeedImportRow(created.import.id, created.rowIds[0]!, {
      createSourceFromUrlImpl,
    })

    expect(createSourceFromUrlImpl).toHaveBeenCalledWith(
      SYSTEM_PROVENANCE,
      expect.objectContaining({ id: user.id }),
      rssFeedUrl,
      expect.any(Object),
    )
    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.rows[0]).toMatchObject({
      input: rssFeedUrl,
      status: 'source_created',
      entity_id: rssFeed.id,
    })
  })

  it('records invalid URL rows as errors without calling source creation', async () => {
    const created = await submitRssFeedImport(user, ['not-a-url'])

    await processRssFeedImportRow(created.import.id, created.rowIds[0]!)

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      input: 'not-a-url',
      status: 'error',
      error: 'Invalid URL format',
    })
  })

  it('keeps transient failures pending until the final attempt', async () => {
    const rssFeedUrl = `https://retry-import-${Date.now()}.example.com/feed.xml`
    const createSourceFromUrlImpl = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
    const created = await submitRssFeedImport(user, [rssFeedUrl])

    await expect(
      processRssFeedImportRow(created.import.id, created.rowIds[0]!, {
        isFinalAttempt: false,
        createSourceFromUrlImpl,
      }),
    ).rejects.toThrow('temporary failure')

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import.pending_rows).toBe(1)
    expect(status?.rows[0]).toMatchObject({
      status: 'pending',
      error: 'temporary failure',
    })
  })

  it('does not reprocess terminal failed rows', async () => {
    const rssFeedUrl = `https://terminal-failure-import-${Date.now()}.example.com/feed.xml`
    const createSourceFromUrlImpl = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValueOnce(new Error('terminal failure'))
    const created = await submitRssFeedImport(user, [rssFeedUrl])

    await expect(
      processRssFeedImportRow(created.import.id, created.rowIds[0]!, {
        createSourceFromUrlImpl,
      }),
    ).rejects.toThrow('terminal failure')

    const rssFeed = await insertTestRssFeedDirect({})
    createSourceFromUrlImpl.mockResolvedValueOnce({
      status: 'created',
      topic_slug: 'terminal-failure-import',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })

    await processRssFeedImportRow(created.import.id, created.rowIds[0]!, {
      createSourceFromUrlImpl,
    })

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(createSourceFromUrlImpl).toHaveBeenCalledTimes(1)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error: 'terminal failure',
    })
  })

  it('does not count duplicate terminal failures twice', async () => {
    const created = await submitRssFeedImport(user, [
      `https://duplicate-failure-import-${Date.now()}.example.com/feed.xml`,
    ])
    const rowId = created.rowIds[0]!

    await updateRssFeedImportRowFailed(rowId, 'terminal failure', { isFinalAttempt: true })
    await updateRssFeedImportRowFailed(rowId, 'duplicate failure', { isFinalAttempt: true })

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error: 'terminal failure',
    })
  })

  it('does not let stale successes overwrite terminal failures', async () => {
    const rssFeed = await insertTestRssFeedDirect({})
    const created = await submitRssFeedImport(user, [
      `https://stale-success-import-${Date.now()}.example.com/feed.xml`,
    ])
    const rowId = created.rowIds[0]!

    await updateRssFeedImportRowFailed(rowId, 'terminal failure', { isFinalAttempt: true })
    await updateRssFeedImportRowCompleted(rowId, 'source_created', rssFeed.id)

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error: 'terminal failure',
    })
  })
})
