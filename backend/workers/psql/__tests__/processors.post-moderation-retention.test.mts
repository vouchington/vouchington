import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { psql } from '@queues/psql/queues'
import { AI_RETENTION_FAMILIES, type PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

const settledVoteBallots: Awaited<
  ReturnType<typeof runDataRetentionCleanup>
>['supersededVoteBallots'] = []

const noAIRetention = {
  softDeletedUsers: { deleted: 0, hasMore: false },
  ...Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [family, { hasMore: false }])),
  supersededVoteBallots: settledVoteBallots,
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
  aiUsageRecords: { hasMore: false },
}

describe('post moderation retention continuation', () => {
  it('continues only unfinished post moderation ledger streams', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const result = (remainingKinds: Array<'superseded_versions' | 'pass_evidence'>) =>
      ({
        ...noAIRetention,
        classifierRecords: {},
        agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
        postModerationLedger: {
          deletedVersions: 0,
          clearedPassEvidence: 0,
          hasMore: remainingKinds.length > 0,
          remainingKinds,
        },
      }) as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(result(['superseded_versions', 'pass_evidence']))
      .mockResolvedValueOnce(result(['pass_evidence']))
      .mockResolvedValue(result([]))

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect((first!.data as PsqlRetentionJobData).continuation?.activePostModerationKinds).toEqual([
      'superseded_versions',
      'pass_evidence',
    ])
    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    const second = await psql.getJob(ids[1]!)
    expect((second!.data as PsqlRetentionJobData).continuation?.activePostModerationKinds).toEqual([
      'pass_evidence',
    ])
    expect(cleanup.mock.calls[1]?.[1]).toMatchObject({
      postModerationLedger: { kinds: ['superseded_versions', 'pass_evidence'] },
    })
    await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      second!.id,
    )
    expect(cleanup.mock.calls[2]?.[1]).toMatchObject({
      postModerationLedger: { kinds: ['pass_evidence'] },
    })
    expect(await psql.getJob(ids[2]!)).toBeNull()
  })
})
