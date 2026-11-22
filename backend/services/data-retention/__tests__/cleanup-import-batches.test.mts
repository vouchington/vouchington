import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  countImportRetentionRows,
  createCompletedImportRetentionFixture,
  createIncompleteImportRetentionBatch,
  insertLateImportRowForRetention,
  insertLateImportDiscoveryForRetention,
  raceImportRetentionCursorWithDeletedCurrentBatch,
  readImportRetentionCursor,
} from '@voucha/test-helpers/import-retention'
import {
  lockTestCompletedAdminImportBatch,
  raceImportRetentionPageWithParentPurge,
} from '@voucha/test-helpers/import-retention-races'
import { finishTestPostgresActionWithoutWaiting } from '@voucha/test-helpers/postgres-lock-skip'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupCompletedImportBatches } from '../cleanup-import-batches.mts'

describe('completed import retention', () => {
  it.each(['admin', 'rss'] as const)(
    'deletes %s children in capped pages before its completed batch',
    async family => {
      const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
      const user = await createTestUser()
      const batchId = await createCompletedImportRetentionFixture(family, user.id, at(100))
      const options = () => ({ now, lowerBoundDate, batchSize: 1, maxBatches: 1 })
      const expected =
        family === 'admin'
          ? [
              { batches: 1, rows: 1, discoveries: 0 },
              { batches: 1, rows: 0, discoveries: 0 },
              { batches: 0, rows: 0, discoveries: 0 },
            ]
          : [
              { batches: 1, rows: 2, discoveries: 0 },
              { batches: 1, rows: 1, discoveries: 0 },
              { batches: 1, rows: 0, discoveries: 0 },
              { batches: 0, rows: 0, discoveries: 0 },
            ]
      for (const [index, counts] of expected.entries()) {
        const result = await cleanupCompletedImportBatches(family, options())
        expect(result.deleted).toBe(1)
        expect(result.continuation?.batchId ?? null).toBe(
          index === expected.length - 1 ? null : batchId,
        )
        expect(await countImportRetentionRows(family, batchId)).toEqual(counts)
      }
      expect(await cleanupCompletedImportBatches(family, options())).toMatchObject({
        deleted: 0,
        hasMore: false,
        continuation: null,
      })
    },
  )

  it.each(['admin', 'rss'] as const)(
    'preserves recent and unfinished %s batches while retiring an old one',
    async family => {
      const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
      const user = await createTestUser()
      const old = await createCompletedImportRetentionFixture(family, user.id, at(100))
      const recent = await createCompletedImportRetentionFixture(family, user.id, at(20))
      const unfinished = await createIncompleteImportRetentionBatch(family, user.id)
      const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 5 }
      await cleanupCompletedImportBatches(family, options)
      expect((await countImportRetentionRows(family, old)).batches).toBe(0)
      expect((await countImportRetentionRows(family, recent)).batches).toBe(1)
      expect((await countImportRetentionRows(family, unfinished)).batches).toBe(1)
    },
  )

  it.each(['admin', 'rss'] as const)(
    'rejects a new %s child after its parent is completed',
    async family => {
      const { at } = createIsolatedRetentionWindow()
      const user = await createTestUser()
      const batchId = await createCompletedImportRetentionFixture(family, user.id, at(100))
      await expect(insertLateImportRowForRetention(family, batchId)).rejects.toMatchObject({
        code: '23514',
      })
      expect((await countImportRetentionRows(family, batchId)).rows).toBe(2)
    },
  )

  it('rejects a new RSS discovery after its parent batch is completed', async () => {
    const { at } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const batchId = await createCompletedImportRetentionFixture('rss', user.id, at(100))
    await expect(insertLateImportDiscoveryForRetention(batchId)).rejects.toMatchObject({
      code: '23514',
    })
    expect((await countImportRetentionRows('rss', batchId)).discoveries).toBe(1)
  })

  it('makes progress on the next completed batch while the oldest parent is locked', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const locked = await createCompletedImportRetentionFixture('admin', user.id, at(100))
    const available = await createCompletedImportRetentionFixture('admin', user.id, at(99))
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    await using holder = await beginTransaction()
    await lockTestCompletedAdminImportBatch(holder, locked)

    const page = await finishTestPostgresActionWithoutWaiting(holder, 'import_retention', () =>
      cleanupCompletedImportBatches('admin', options),
    )

    expect(page).toMatchObject({ deleted: 2, continuation: { batchId: available, phase: 'batch' } })
    expect(await countImportRetentionRows('admin', locked)).toEqual({
      batches: 1,
      rows: 2,
      discoveries: 0,
    })
    expect(await countImportRetentionRows('admin', available)).toEqual({
      batches: 1,
      rows: 0,
      discoveries: 0,
    })
    await cleanupCompletedImportBatches('admin', { ...options, maxBatches: 3 })
    expect(await countImportRetentionRows('admin', locked)).toEqual({
      batches: 0,
      rows: 0,
      discoveries: 0,
    })
  })

  it('drains a resumed child page before a concurrent parent purge finishes', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const current = await createCompletedImportRetentionFixture('admin', user.id, at(100))
    const next = await createCompletedImportRetentionFixture('admin', user.id, at(99))
    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    expect(await cleanupCompletedImportBatches('admin', options)).toMatchObject({
      deleted: 1,
      continuation: { batchId: current, phase: 'rows' },
    })

    expect(await raceImportRetentionPageWithParentPurge(current, options)).toMatchObject({
      deleted: 1,
      continuation: { batchId: current, phase: 'batch' },
    })
    expect(await countImportRetentionRows('admin', current)).toEqual({
      batches: 0,
      rows: 0,
      discoveries: 0,
    })
    expect(await readImportRetentionCursor()).toMatchObject({ admin_batch_id: null })
    expect(await countImportRetentionRows('admin', next)).toEqual({
      batches: 1,
      rows: 2,
      discoveries: 0,
    })
    expect(await cleanupCompletedImportBatches('admin', options)).toMatchObject({
      deleted: 1,
      continuation: { batchId: next, phase: 'rows' },
    })
    await cleanupCompletedImportBatches('admin', { ...options, maxBatches: 2 })
  })

  it('re-reads the import cursor after its current batch is deleted concurrently', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const deletedBatch = await createCompletedImportRetentionFixture('admin', user.id, at(100))
    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    await expect(
      cleanupCompletedImportBatches('admin', { ...options, batchSize: 2 }),
    ).resolves.toMatchObject({
      deleted: 2,
      continuation: { batchId: deletedBatch, phase: 'batch' },
    })
    const nextBatch = await createCompletedImportRetentionFixture('admin', user.id, at(99))

    const page = await raceImportRetentionCursorWithDeletedCurrentBatch(deletedBatch, options)

    expect(page).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { batchId: nextBatch, phase: 'rows' },
    })
    expect(await countImportRetentionRows('admin', deletedBatch)).toEqual({
      batches: 0,
      rows: 0,
      discoveries: 0,
    })
    expect(await countImportRetentionRows('admin', nextBatch)).toEqual({
      batches: 1,
      rows: 1,
      discoveries: 0,
    })
    const cursor = await readImportRetentionCursor()
    expect(cursor).toMatchObject({
      admin_batch_id: nextBatch,
      phase: 'rows',
      cursor_row_id: page.continuation?.rowId,
    })
    expect(page.continuation?.rowId).not.toBeNull()
    await cleanupCompletedImportBatches('admin', options)
    await cleanupCompletedImportBatches('admin', options)
    expect(await countImportRetentionRows('admin', nextBatch)).toEqual({
      batches: 0,
      rows: 0,
      discoveries: 0,
    })
    expect(await readImportRetentionCursor()).toMatchObject({ admin_batch_id: null })
  })
})
