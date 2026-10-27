import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import {
  readClassifierDefaultLineage,
  seedOldClassifierDefaultDecision,
} from '@voucha/test-helpers/classifier-default-retention'
import { withClassifierRetentionSweepLock } from '@voucha/test-helpers/classifier-retention-sweep-lock'
import { cleanupClassifierRecords } from '../cleanup-classifier-records.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('expired classifier DEFAULT lineage', () => {
  it('retires real result rows before snapshots, calls and batches in capped continuations', async () => {
    const fixture = await createClassifierFixture()
    const oldAt = new Date(Date.UTC(2000, 0, 1) + randomInt(20 * 365 * DAY_MS))
    const oldIds = [
      await seedOldClassifierDefaultDecision(fixture, oldAt),
      await seedOldClassifierDefaultDecision(fixture, new Date(oldAt.getTime() + 1_000)),
    ]
    const freshId = await seedOldClassifierDefaultDecision(
      fixture,
      new Date(oldAt.getTime() + 3_000),
    )
    const options = {
      retentionDays: 90,
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: new Date(oldAt.getTime() - 1),
      now: new Date(oldAt.getTime() + 90 * DAY_MS + 2_000),
    }

    expect(await readClassifierDefaultLineage(oldIds)).toEqual({
      results: 2,
      candidates: 2,
      calls: 2,
      batches: 2,
    })
    await withClassifierRetentionSweepLock(async () => {
      const first = await cleanupClassifierRecords(options)
      expect(first.topicResults).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      expect(first.decisionCandidates).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      expect(first.calls).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      expect(first.batches).toEqual({ scanned: 1, deleted: 1, hasMore: true })

      const second = await cleanupClassifierRecords(options)
      expect(second.topicResults).toEqual({ scanned: 1, deleted: 1, hasMore: false })
      expect(second.decisionCandidates).toEqual({ scanned: 1, deleted: 1, hasMore: false })
      expect(second.calls).toEqual({ scanned: 1, deleted: 1, hasMore: false })
      expect(second.batches).toEqual({ scanned: 1, deleted: 1, hasMore: false })
      expect(await readClassifierDefaultLineage(oldIds)).toEqual({
        results: 0,
        candidates: 0,
        calls: 0,
        batches: 0,
      })
      expect(await readClassifierDefaultLineage([freshId])).toEqual({
        results: 1,
        candidates: 1,
        calls: 1,
        batches: 1,
      })
    })
  })
})
