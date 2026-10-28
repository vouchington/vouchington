import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  countImportRetentionRows,
  createCompletedImportRetentionFixture,
  createIncompleteImportRetentionBatch,
  insertLateImportRowForRetention,
  insertLateImportDiscoveryForRetention,
} from '@voucha/test-helpers/import-retention'
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
})
