import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { insertTestAiUsageRecord } from '@voucha/test-helpers'
import {
  countTestAiUsageRows,
  reserveTestAiUsageRetentionSweep,
} from '@voucha/test-helpers/entities/ai-usage-rollups'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

describe('AI usage retention continuation', () => {
  it('continues three capped AI pages after classifier sweeps finish', async () => {
    const releaseSweep = await reserveTestAiUsageRetentionSweep()
    onTestFinished(releaseSweep)
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const month = new Date()
    const base = Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12)
    const idAt = (offset: number) =>
      `${timestampToUuidv7LowerBound(base + offset * 1_000).slice(0, 24)}${randomBytes(6).toString('hex')}`
    const ownedIds = [idAt(0), idAt(1), idAt(2)]
    const outsideId = idAt(3)
    for (const id of [...ownedIds, outsideId]) await insertTestAiUsageRecord({ id })
    const options = {
      retention: {
        families: ['aiUsageRecords'] as const,
        aiUsageRecords: {
          recordIds: ownedIds,
          batchSize: 1,
          maxBatches: 1,
          now: new Date(base + 3_651 * 86_400_000),
          lowerBoundDate: new Date(base),
        },
      },
    }
    const firstResult = await processPsql(
      'dataRetentionCleanup',
      {},
      undefined,
      initialJobId,
      options,
    )
    expect(firstResult).toMatchObject({
      aiUsageRecords: { deleted: 1, hasMore: true, cursorId: ownedIds[0] },
    })
    const first = await psql.getJob(ids[0]!)
    expect((first!.data as PsqlRetentionJobData).continuation).toMatchObject({
      activeClassifierSweeps: [],
      activeAiUsage: true,
      step: 1,
    })
    const secondResult = await processPsql(
      'dataRetentionCleanup',
      first!.data as PsqlRetentionJobData,
      undefined,
      first!.id,
      options,
    )
    expect(secondResult).toMatchObject({
      aiUsageRecords: { deleted: 1, hasMore: true, cursorId: ownedIds[1] },
    })
    const second = await psql.getJob(ids[1]!)
    expect((second!.data as PsqlRetentionJobData).continuation).toMatchObject({
      activeClassifierSweeps: [],
      activeAiUsage: true,
      step: 2,
    })
    const thirdResult = await processPsql(
      'dataRetentionCleanup',
      second!.data as PsqlRetentionJobData,
      undefined,
      second!.id,
      options,
    )
    expect(thirdResult).toMatchObject({
      aiUsageRecords: { deleted: 1, hasMore: false, cursorId: null },
    })
    expect(await psql.getJob(ids[2]!)).toBeNull()
    expect(await countTestAiUsageRows(ownedIds)).toBe(0)
    expect(await countTestAiUsageRows([outsideId])).toBe(1)
  })
})
