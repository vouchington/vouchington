import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  createTestAgentModerationRetentionPage,
  createTestAgentModerationRetentionCursor,
  createTestAgentModerationRetentionContinuationPage,
  getTestAgentModerationRetentionState,
} from '@voucha/test-helpers/agent-moderation-retention-pages'
import {
  getTestAgentModerationRetentionPostCursor,
  insertTestAgentModerationRetentionPostWork,
  setTestAgentModerationRetentionHashBlocked,
  testAgentModerationRetentionPostHasWork,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import { psql } from '@queues/psql/queues'
import { DATA_RETENTION_ORDERING } from '@queues/psql/config'
import {
  AI_RETENTION_FAMILIES,
  type AgentModerationRetentionContinuationData,
  type PsqlRetentionJobData,
} from '@queues/psql/types'
import { rejectNextQueueJobAddForTest } from '@voucha/test-helpers/injected-failures'
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
  aiUsageRecords: { hasMore: false },
} as unknown as Awaited<ReturnType<typeof runDataRetentionCleanup>>

describe('agent moderation retention continuations', () => {
  it('chains only moderation pages through their own ordered job', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `agent-moderation-retention__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const owned = await createTestAgentModerationRetentionContinuationPage()
    const neighbor = await createTestAgentModerationRetentionPage()
    const options = {
      postIds: [owned.postId],
      batchSize: 2,
      maxBatches: 1,
      now: new Date('2026-10-29T00:00:00Z'),
    }
    const firstCursor = createTestAgentModerationRetentionCursor(owned.postId)
    const secondCursor = {
      ...firstCursor,
      afterDueAt: '2026-10-03T00:00:00.000Z',
      afterId: owned.secondId,
    }
    const cleanup = vi.fn<typeof runDataRetentionCleanup>().mockResolvedValue({
      ...emptyCleanupResult,
      agentModerations: { scanned: 2, deleted: 1, hasMore: true, continuation: firstCursor },
    })

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect(first!.opts.ordering).toEqual(DATA_RETENTION_ORDERING)
    expect(
      (first!.data as AgentModerationRetentionContinuationData).agentModerationRetention,
    ).toEqual(firstCursor)
    expect(await psql.getJob(`data-retention-cleanup__${runId}__1`)).toBeNull()
    const firstPage = await processPsql(
      'continueAgentModerationRetentionCleanup',
      first!.data as AgentModerationRetentionContinuationData,
      undefined,
      first!.id,
      { agentModeration: options },
    )
    expect(firstPage).toEqual({ scanned: 2, deleted: 0, hasMore: true, continuation: secondCursor })
    const second = await psql.getJob(ids[1]!)
    expect(
      (second!.data as AgentModerationRetentionContinuationData).agentModerationRetention,
    ).toEqual(secondCursor)
    const secondPage = await processPsql(
      'continueAgentModerationRetentionCleanup',
      second!.data as AgentModerationRetentionContinuationData,
      undefined,
      second!.id,
      { agentModeration: options },
    )
    expect(secondPage).toEqual({ scanned: 1, deleted: 1, hasMore: false, continuation: null })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.oldId)).toEqual({
      dueAt: null,
      blockedReason: 'reference',
    })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.secondId)).toEqual({
      dueAt: null,
      blockedReason: 'reference',
    })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.thirdId)).toBeNull()
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(await psql.getJob(ids[2]!)).toBeNull()
  })

  it('wakes only owned dirty posts and completes without following excluded work', async () => {
    const owned = await createTestAgentModerationRetentionPage()
    const neighbor = await createTestAgentModerationRetentionPage()
    await setTestAgentModerationRetentionHashBlocked(owned.postId, [owned.oldId])
    await setTestAgentModerationRetentionHashBlocked(neighbor.postId, [neighbor.oldId])
    await insertTestAgentModerationRetentionPostWork(
      [neighbor.postId],
      new Date('2000-01-01T00:00:00Z'),
    )
    await insertTestAgentModerationRetentionPostWork(
      [owned.postId],
      new Date('2001-01-01T00:00:00Z'),
    )
    const runId = randomUUID()
    const nextId = `agent-moderation-retention__${runId}__2`
    expect(
      await processPsql(
        'continueAgentModerationRetentionCleanup',
        {
          runId,
          step: 1,
          agentModerationRetention: createTestAgentModerationRetentionCursor(owned.postId),
        },
        undefined,
        undefined,
        {
          agentModeration: {
            postIds: [owned.postId],
            batchSize: 1,
            maxBatches: 1,
            now: new Date('2026-10-29T00:00:00Z'),
          },
        },
      ),
    ).toEqual({ scanned: 1, deleted: 1, hasMore: false, continuation: null })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.oldId)).toBeNull()
    expect(await testAgentModerationRetentionPostHasWork(owned.postId)).toBe(false)
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: null,
      blockedReason: 'hash',
    })
    expect(await getTestAgentModerationRetentionPostCursor(neighbor.postId)).toBe(
      '00000000-0000-0000-0000-000000000000',
    )
    expect(await testAgentModerationRetentionPostHasWork(neighbor.postId)).toBe(true)
    expect(await psql.getJob(nextId)).toBeNull()
  })

  it('propagates continuation admission failure after the owned page commits', async () => {
    const owned = await createTestAgentModerationRetentionContinuationPage()
    const neighbor = await createTestAgentModerationRetentionPage()
    const runId = randomUUID()
    const nextId = `agent-moderation-retention__${runId}__2`
    const restore = rejectNextQueueJobAddForTest(
      psql,
      'continueAgentModerationRetentionCleanup',
      new Error('continuation admission failed'),
    )
    onTestFinished(restore)
    await expect(
      processPsql(
        'continueAgentModerationRetentionCleanup',
        {
          runId,
          step: 1,
          agentModerationRetention: createTestAgentModerationRetentionCursor(owned.postId),
        },
        undefined,
        undefined,
        {
          agentModeration: {
            postIds: [owned.postId],
            batchSize: 2,
            maxBatches: 1,
            now: new Date('2026-10-29T00:00:00Z'),
          },
        },
      ),
    ).rejects.toThrow('continuation admission failed')
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.oldId)).toEqual({
      dueAt: null,
      blockedReason: 'reference',
    })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.secondId)).toEqual({
      dueAt: null,
      blockedReason: 'reference',
    })
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
    expect(await psql.getJob(nextId)).toBeNull()
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
