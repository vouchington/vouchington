import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type {
  runAgentModerationRetentionCleanupPage,
  runDataRetentionCleanup,
} from '@services/data-retention'
import { psql } from '@queues/psql/queues'
import { DATA_RETENTION_ORDERING } from '@queues/psql/config'
import {
  AI_RETENTION_FAMILIES,
  type AgentModerationRetentionContinuationData,
  type PsqlRetentionJobData,
} from '@queues/psql/types'
import processPsql from '../processors.mts'

const emptyCleanupResult = {
  softDeletedUsers: { deleted: 0, hasMore: false },
  postModerationLedger: {
    deletedVersions: 0,
    clearedPassEvidence: 0,
    hasMore: false,
    remainingKinds: [],
  },
  agentModerations: { scanned: 0, deleted: 0, hasMore: false, continuation: null },
  ...Object.fromEntries(AI_RETENTION_FAMILIES.map(family => [family, { hasMore: false }])),
  classifierRecords: { runs: { hasMore: false } },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: { hasMore: false },
  voteIntegrityDetails: { hasMore: false },
} as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>

describe('agent moderation retention continuations', () => {
  it('chains only moderation pages through their own ordered job', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `agent-moderation-retention__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const upperBoundId = randomUUID()
    const firstCursor = {
      afterDueAt: '2026-10-01T00:00:00.000Z',
      afterId: randomUUID(),
      afterPostId: randomUUID(),
      upperBoundDueAt: '2026-10-29T00:00:00.000Z',
      upperBoundId,
    }
    const secondCursor = { ...firstCursor, afterId: randomUUID() }
    const cleanup = vi.fn<typeof runDataRetentionCleanup>().mockResolvedValue({
      ...emptyCleanupResult,
      agentModerations: { scanned: 2, deleted: 1, hasMore: true, continuation: firstCursor },
    })
    const page = vi
      .fn<typeof runAgentModerationRetentionCleanupPage>()
      .mockResolvedValueOnce({ scanned: 2, deleted: 0, hasMore: true, continuation: secondCursor })
      .mockResolvedValueOnce({ scanned: 1, deleted: 1, hasMore: false, continuation: null })

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect(first!.opts.ordering).toEqual(DATA_RETENTION_ORDERING)
    expect(
      (first!.data as AgentModerationRetentionContinuationData).agentModerationRetention,
    ).toEqual(firstCursor)
    expect(await psql.getJob(`data-retention-cleanup__${runId}__1`)).toBeNull()
    await processPsql(
      'continueAgentModerationRetentionCleanup',
      first!.data as AgentModerationRetentionContinuationData,
      { agentModerationRetentionCleanupPage: page },
      first!.id,
    )
    expect(page.mock.calls[0]?.[1]).toEqual(firstCursor)
    const second = await psql.getJob(ids[1]!)
    expect(
      (second!.data as AgentModerationRetentionContinuationData).agentModerationRetention,
    ).toEqual(secondCursor)
    await processPsql(
      'continueAgentModerationRetentionCleanup',
      second!.data as AgentModerationRetentionContinuationData,
      { agentModerationRetentionCleanupPage: page },
      second!.id,
    )
    expect(page.mock.calls[1]?.[1]).toEqual(secondCursor)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(await psql.getJob(ids[2]!)).toBeNull()
  })

  it('does not restart a finished agent moderation sweep while classifier pages continue', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const cleanup = vi.fn<typeof runDataRetentionCleanup>().mockResolvedValue({
      ...emptyCleanupResult,
      classifierRecords: {
        ...emptyCleanupResult.classifierRecords,
        runs: { scanned: 1, deleted: 0, hasMore: true },
      },
    })

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    await processPsql(
      'dataRetentionCleanup',
      first!.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    expect(cleanup.mock.calls[1]?.[1]).toMatchObject({ includeAgentModerations: false })
    expect(await psql.getJob(ids[1]!)).not.toBeNull()
  })
})
