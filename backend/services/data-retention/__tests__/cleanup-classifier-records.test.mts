import { describe, expect, it } from 'vitest'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  countClassifierRows,
  seedClassifierRunPayloadsAt,
} from '@voucha/test-helpers/classifier-retention'
import { reserveClassifierRun } from '../../classifier-runs/run-reservation.mts'
import { cleanupClassifierRecords } from '../cleanup-classifier-records.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('classifier retention cleanup', () => {
  it('caps terminal payload deletion while retaining pending work and exact identities', async () => {
    const setup = await createSyntheticFixture()
    const at = new Date(Date.now() - 100 * DAY_MS)
    const { terminalIds, pendingId, requestId } = await seedClassifierRunPayloadsAt({
      slug: setup.slug,
      postId: setup.post.id,
      actorId: setup.actorId,
      currentInputSha256: setup.post.inputSha256,
      at,
      terminalCount: 3,
    })
    const options = {
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      lowerBoundDate: at,
      now: new Date(at.getTime() + 90 * DAY_MS + 1),
    }

    const first = await cleanupClassifierRecords(options)
    expect(first.runs).toEqual({ scanned: 2, deleted: 2, hasMore: true })
    expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(1)

    const second = await cleanupClassifierRecords(options)
    expect(second.runs).toEqual({ scanned: 2, deleted: 1, hasMore: false })
    expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(0)
    expect(await countClassifierRows('classifier_runs', [pendingId])).toBe(1)
    expect(
      await countClassifierRows('classifier_run_identities', [...terminalIds, pendingId]),
    ).toBe(4)
    expect(await countClassifierRows('classifier_run_requests', [requestId])).toBe(1)
    expect(await reserveClassifierRun(setup.adapter, setup.subject)).toEqual({ kind: 'no-work' })
    expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(0)
  })
})
