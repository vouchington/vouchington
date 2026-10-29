import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { psql } from '@queues/psql/queues'
import { AI_RETENTION_FAMILIES, type PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

describe('AI usage retention continuation', () => {
  it('continues capped pages after classifier sweeps finish', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const aiPage = {
      ...Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [family, { hasMore: false }])),
      classifierRecords: { runs: { hasMore: false } },
      aiUsageRecords: { hasMore: true },
      softDeletedUsers: { hasMore: false },
      supersededVoteBallots: [],
      orphanedUserAgentStrings: { hasMore: false },
      voteIntegrityDetails: { hasMore: false },
    } as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const done = {
      ...aiPage,
      aiUsageRecords: { hasMore: false },
    } as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(aiPage)
      .mockResolvedValueOnce(aiPage)
      .mockResolvedValue(done)

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect((first!.data as PsqlRetentionJobData).continuation).toMatchObject({
      activeClassifierSweeps: [],
      activeAiUsage: true,
      step: 1,
    })
    await processPsql(
      'dataRetentionCleanup',
      first!.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    const second = await psql.getJob(ids[1]!)
    await processPsql(
      'dataRetentionCleanup',
      second!.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      second!.id,
    )
    expect(await psql.getJob(ids[2]!)).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(3)
    expect(cleanup.mock.calls[1]?.[1]).toMatchObject({
      classifierRecords: { activeSweeps: [] },
      aiUsageRecords: { active: true },
    })
  })
})
