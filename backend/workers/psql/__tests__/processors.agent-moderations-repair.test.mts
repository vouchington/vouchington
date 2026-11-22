import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
import { psql } from '@queues/psql/queues'
import processPsql from '../processors.mts'

describe('agent moderation retention repair continuation', () => {
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
    const options = {
      agentModeration: {
        postIds: [owned.postId],
        batchSize: 1,
        maxBatches: 1,
        now: new Date('2026-10-29T00:00:00Z'),
      },
    }
    const result = await processPsql(
      'continueAgentModerationRetentionCleanup',
      {
        runId,
        step: 1,
        agentModerationRetention: createTestAgentModerationRetentionCursor(owned.postId),
      },
      undefined,
      undefined,
      options,
    )
    expect(result).toEqual({ scanned: 1, deleted: 1, hasMore: false, continuation: null })
    expect(await psql.getJob(nextId)).toBeNull()
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
  })
})
