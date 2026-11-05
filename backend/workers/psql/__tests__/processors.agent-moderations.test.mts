import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  createTestAgentModerationRetentionPage,
  createTestAgentModerationRetentionContinuationPage,
  createTestAgentModerationRetentionCursor,
  createTestAgentModerationRetentionDailyContinuationPage,
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
import type {
  AgentModerationRetentionContinuationData,
  PsqlRetentionJobData,
} from '@queues/psql/types'
import { rejectNextQueueJobAddForTest } from '@voucha/test-helpers/injected-failures'
import { countClassifierRows } from '@voucha/test-helpers/classifier-retention'
import { withClassifierRetentionSweepLockWithoutReset } from '@voucha/test-helpers/classifier-retention-sweep-lock'
import { createAgentClassifierRetentionFixture } from '@voucha/test-helpers/agent-classifier-retention'
import { insertTestAgentModeration } from '@voucha/test-helpers/entities/post-llm-moderations'
import processPsql from '../processors.mts'
describe('agent moderation retention continuations', () => {
  it('chains only moderation pages through their own ordered job', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `agent-moderation-retention__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const [owned, neighbor] = await Promise.all([
      createTestAgentModerationRetentionDailyContinuationPage(),
      createTestAgentModerationRetentionPage(),
    ])
    const options = {
      postIds: [owned.postId],
      batchSize: 2,
      maxBatches: 1,
      now: new Date('2026-10-29T00:00:00Z'),
    }
    const firstCursor = {
      afterDueAt: '2026-10-01T00:00:00.000Z',
      afterId: owned.initialDeletedId,
      afterPostId: owned.postId,
      upperBoundDueAt: '2026-10-29T00:00:00.000Z',
      upperBoundId: owned.initialUpperBoundId,
    }
    const secondCursor = {
      ...firstCursor,
      afterDueAt: '2026-10-03T00:00:00.000Z',
      afterId: owned.secondId,
    }
    const initial = (await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, {
      retention: { families: ['agentModerations'], agentModerations: options },
    })) as Awaited<ReturnType<typeof runDataRetentionCleanup>>
    expect(initial.agentModerations).toEqual({
      scanned: 2,
      deleted: 1,
      hasMore: true,
      continuation: firstCursor,
    })
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
    expect(
      await getTestAgentModerationRetentionState(owned.postId, owned.initialBlockedId),
    ).toEqual({
      dueAt: null,
      blockedReason: 'reference',
    })
    expect(
      await getTestAgentModerationRetentionState(owned.postId, owned.initialDeletedId),
    ).toBeNull()
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
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
    const ids = [1, 2, 3, 4, 5].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    await withClassifierRetentionSweepLockWithoutReset(async () => {
      const { agent, excludedAgent, ownedRuns, excludedRuns, options, cleanup } =
        await createAgentClassifierRetentionFixture()
      try {
        const runPage = async (data: PsqlRetentionJobData, jobId: string) =>
          (await processPsql('dataRetentionCleanup', data, undefined, jobId, options)) as Awaited<
            ReturnType<typeof runDataRetentionCleanup>
          >
        const firstResult = await runPage({}, initialJobId)
        expect(firstResult.agentModerations).toEqual({
          scanned: 1,
          deleted: 1,
          hasMore: false,
          continuation: null,
        })
        expect(firstResult.classifierRecords.runs).toEqual({
          scanned: 1,
          deleted: 1,
          hasMore: true,
        })
        expect(await countClassifierRows('classifier_runs', ownedRuns.terminalIds)).toBe(2)
        expect(await countClassifierRows('classifier_runs', excludedRuns.terminalIds)).toBe(1)
        const rearmedId = await insertTestAgentModeration({
          ...agent,
          occurredAt: new Date('2026-07-07T00:00:00Z'),
        })
        expect(await getTestAgentModerationRetentionState(agent.postId, rearmedId)).toEqual({
          dueAt: '2026-10-05T00:00:00.000Z',
          blockedReason: null,
        })

        const first = await psql.getJob(ids[0]!)
        expect(first?.data).toMatchObject({ continuation: { runId, step: 1 } })
        const secondResult = await runPage(first!.data as PsqlRetentionJobData, first!.id)
        expect(secondResult.agentModerations).toEqual({
          scanned: 0,
          deleted: 0,
          hasMore: false,
          continuation: null,
        })
        expect(secondResult.classifierRecords.runs).toEqual({
          scanned: 1,
          deleted: 1,
          hasMore: true,
        })
        expect(await countClassifierRows('classifier_runs', ownedRuns.terminalIds)).toBe(1)
        expect(await getTestAgentModerationRetentionState(agent.postId, rearmedId)).toEqual({
          dueAt: '2026-10-05T00:00:00.000Z',
          blockedReason: null,
        })
        expect(
          await getTestAgentModerationRetentionState(excludedAgent.postId, excludedAgent.oldId),
        ).toEqual({ dueAt: '2026-10-02T00:00:00.000Z', blockedReason: null })
        expect(await countClassifierRows('classifier_runs', excludedRuns.terminalIds)).toBe(1)
        expect(await psql.getJob(ids[1]!)).not.toBeNull()

        const second = await psql.getJob(ids[1]!)
        const thirdResult = await runPage(second!.data as PsqlRetentionJobData, second!.id)
        expect(thirdResult.classifierRecords.runs).toEqual({
          scanned: 1,
          deleted: 1,
          hasMore: true,
        })
        const third = await psql.getJob(ids[2]!)
        const finalResult = await runPage(third!.data as PsqlRetentionJobData, third!.id)
        expect(finalResult.classifierRecords.runs).toEqual({
          scanned: 1,
          deleted: 0,
          hasMore: false,
        })
        expect(await countClassifierRows('classifier_runs', ownedRuns.terminalIds)).toBe(0)
        expect(await countClassifierRows('classifier_runs', [ownedRuns.pendingId])).toBe(1)
        expect(await countClassifierRows('classifier_runs', excludedRuns.terminalIds)).toBe(1)
        expect(await psql.getJob(ids[3]!)).toBeNull()
      } finally {
        await cleanup()
      }
    })
  })
})
