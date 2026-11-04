import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestAgentModerationRetentionPage,
  createTestAgentModerationRetentionCursor,
  getTestAgentModerationRetentionState,
} from '@voucha/test-helpers/agent-moderation-retention-pages'
import {
  getTestAgentModerationRetentionPostCursor,
  insertTestAgentModerationRetentionPostWork,
  setTestAgentModerationRetentionHashBlocked,
  testAgentModerationRetentionPostHasWork,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { psql } from '@queues/psql/queues'
import type { AgentModerationRetentionContinuationData } from '@queues/psql/types'
import processPsql from '../processors.mts'

describe('agent moderation retention boundaries', () => {
  it('continues dirty work when the due page is empty and preserves excluded work', async () => {
    const owned = await createTestAgentModerationRetentionPage()
    const neighbor = await createTestAgentModerationRetentionPage()
    await setTestAgentModerationRetentionHashBlocked(owned.postId, [owned.oldId, owned.newestId])
    await setTestAgentModerationRetentionHashBlocked(neighbor.postId, [
      neighbor.oldId,
      neighbor.newestId,
    ])
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
    onTestFinished(async () => {
      await (await psql.getJob(nextId))?.remove()
    })
    const options = {
      agentModeration: {
        postIds: [owned.postId],
        batchSize: 1,
        maxBatches: 1,
        now: new Date('2026-10-29T00:00:00Z'),
      },
    }
    const firstCursor = {
      ...createTestAgentModerationRetentionCursor(owned.postId),
      upperBoundDueAt: '2026-10-01T00:00:00.000Z',
    }
    const nextCursor = {
      ...firstCursor,
      afterDueAt: '1970-01-01T00:00:00.000Z',
      afterId: '00000000-0000-0000-0000-000000000000',
      afterPostId: '00000000-0000-0000-0000-000000000000',
    }
    expect(
      await processPsql(
        'continueAgentModerationRetentionCleanup',
        { runId, step: 1, agentModerationRetention: firstCursor },
        undefined,
        undefined,
        options,
      ),
    ).toEqual({ scanned: 0, deleted: 0, hasMore: true, continuation: nextCursor })
    const next = await psql.getJob(nextId)
    expect(next!.data).toEqual({ runId, step: 2, agentModerationRetention: nextCursor })
    expect(
      await processPsql(
        'continueAgentModerationRetentionCleanup',
        next!.data as AgentModerationRetentionContinuationData,
        undefined,
        next!.id,
        options,
      ),
    ).toEqual({ scanned: 0, deleted: 0, hasMore: false, continuation: null })
    expect(await getTestAgentModerationRetentionState(owned.postId, owned.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
    expect(await testAgentModerationRetentionPostHasWork(owned.postId)).toBe(false)
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: null,
      blockedReason: 'hash',
    })
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.newestId)).toEqual({
      dueAt: null,
      blockedReason: 'hash',
    })
    expect(await getTestAgentModerationRetentionPostCursor(neighbor.postId)).toBe(
      '00000000-0000-0000-0000-000000000000',
    )
    expect(await testAgentModerationRetentionPostHasWork(neighbor.postId)).toBe(true)
    expect(await psql.getJob(`agent-moderation-retention__${runId}__3`)).toBeNull()
  })

  it('rejects a missing cursor without admitting work', async () => {
    const neighbor = await createTestAgentModerationRetentionPage()
    const add = vi.spyOn(psql, 'add')
    onTestFinished(() => add.mockRestore())
    await expect(processPsql('continueAgentModerationRetentionCleanup')).rejects.toThrow(
      'Agent moderation retention continuation requires its cursor',
    )
    expect(add).not.toHaveBeenCalled()
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
  })

  it('propagates an unscoped page failure before the global dirty-post read', async () => {
    const neighbor = await createTestAgentModerationRetentionPage()
    const add = vi.spyOn(psql, 'add')
    const restore = runBeforePostgresStatementForTest(
      'listChangedAgentModerationRetentionPost',
      async () => {
        throw new Error('dirty-post read failed')
      },
    )
    onTestFinished(() => {
      restore()
      add.mockRestore()
    })
    await expect(
      processPsql('continueAgentModerationRetentionCleanup', {
        runId: randomUUID(),
        step: 1,
        agentModerationRetention: createTestAgentModerationRetentionCursor(neighbor.postId),
      }),
    ).rejects.toThrow('dirty-post read failed')
    expect(add).not.toHaveBeenCalled()
    expect(await getTestAgentModerationRetentionState(neighbor.postId, neighbor.oldId)).toEqual({
      dueAt: '2026-10-02T00:00:00.000Z',
      blockedReason: null,
    })
  })
})
