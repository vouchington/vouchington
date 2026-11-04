import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestRssFeedDirect, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getFirstRssFeedImportRowId,
  getRssFeedImportRowIds,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { createRssFeedImport } from './rss-feed-import-records.mts'
import { getRssFeedImport, getRssFeedImportSummary } from './rss-feed-import-status.mts'
import {
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from './rss-feed-import-row-updates.mts'

describe('RSS import skipped counters', () => {
  it('decrements failed and skipped counters when a limit-failed row completes', async () => {
    const user = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://counter-${randomUUID()}.example.com/rss`],
      true,
    )
    expect(created.import.skipped_rows).toBe(0)
    const rowId = await getFirstRssFeedImportRowId(created.import.id)
    const feed = await insertTestRssFeedDirect({})
    await updateRssFeedImportRowFailed(rowId, 'RELATION_LIMIT_REACHED', {
      isFinalAttempt: true,
      rssFeedId: feed.id,
    })
    expect(await getRssFeedImportSummary(user.id, created.import.id)).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      skipped_rows: 1,
      pending_rows: 0,
    })
    await updateRssFeedImportRowCompleted(rowId, 'followed', feed.id)
    await updateRssFeedImportRowCompleted(rowId, 'followed', feed.id)
    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 1,
      failed_rows: 0,
      skipped_rows: 0,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({ status: 'followed', entity_id: feed.id })
    expect(status?.rows[0]).not.toHaveProperty('error_code')
  })
  it('counts only newly final limit failures, including replays', async () => {
    const user = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [0, 1].map(() => `https://counter-${randomUUID()}.example.com/rss`),
      true,
    )
    const [limitedRow, failedRow] = await getRssFeedImportRowIds(created.import.id)
    await Promise.all([
      updateRssFeedImportRowFailed(limitedRow!, 'RELATION_LIMIT_REACHED', { isFinalAttempt: true }),
      updateRssFeedImportRowFailed(limitedRow!, 'RELATION_LIMIT_REACHED', { isFinalAttempt: true }),
    ])
    await updateRssFeedImportRowFailed(failedRow!, 'ordinary failure', { isFinalAttempt: true })
    await updateRssFeedImportRowFailed(limitedRow!, 'changed replay error', {
      isFinalAttempt: true,
    })
    await updateRssFeedImportRowFailed(failedRow!, 'RELATION_LIMIT_REACHED', {
      isFinalAttempt: true,
    })
    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 2,
      skipped_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows).toMatchObject([
      { status: 'error', error_code: 'RELATION_LIMIT_REACHED' },
      { status: 'error', error_code: 'IMPORT_FAILED' },
    ])
  })
  it('does not decrement skips for a pending row with an intermediate limit error', async () => {
    const user = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://counter-${randomUUID()}.example.com/rss`],
      true,
    )
    const rowId = await getFirstRssFeedImportRowId(created.import.id)
    const feed = await insertTestRssFeedDirect({})
    await updateRssFeedImportRowFailed(rowId, 'RELATION_LIMIT_REACHED', { isFinalAttempt: false })
    expect(await getRssFeedImportSummary(user.id, created.import.id)).toMatchObject({
      failed_rows: 0,
      skipped_rows: 0,
      pending_rows: 1,
    })
    await updateRssFeedImportRowCompleted(rowId, 'followed', feed.id)
    await updateRssFeedImportRowFailed(rowId, 'RELATION_LIMIT_REACHED', { isFinalAttempt: true })
    expect(await getRssFeedImportSummary(user.id, created.import.id)).toMatchObject({
      completed_rows: 1,
      failed_rows: 0,
      skipped_rows: 0,
      pending_rows: 0,
    })
  })

  it('keeps counters consistent when final failure and completion overlap', async () => {
    const user = await createTestUser()
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://counter-${randomUUID()}.example.com/rss`],
      true,
    )
    const rowId = await getFirstRssFeedImportRowId(created.import.id)
    const feed = await insertTestRssFeedDirect({})
    await Promise.all([
      updateRssFeedImportRowFailed(rowId, 'RELATION_LIMIT_REACHED', { isFinalAttempt: true }),
      updateRssFeedImportRowCompleted(rowId, 'followed', feed.id),
    ])
    expect(await getRssFeedImportSummary(user.id, created.import.id)).toMatchObject({
      completed_rows: 1,
      failed_rows: 0,
      skipped_rows: 0,
      pending_rows: 0,
    })
  })
})
