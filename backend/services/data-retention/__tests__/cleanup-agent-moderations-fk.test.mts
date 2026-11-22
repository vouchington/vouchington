import { describe, expect, it } from 'vitest'
import { beginTransaction, insertTestAgentModeration } from '@voucha/test-helpers'
import {
  createTestAgentModerationRetentionFixture,
  testAgentModerationExists,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import {
  hasTestPendingAgentModerationVote,
  insertTestPendingAgentModerationVote,
} from '@voucha/test-helpers/entities/moderation-retention-child-race'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupObsoleteAgentModerations } from '../cleanup-agent-moderations.mts'

describe('agent moderation retention child protection', () => {
  it('keeps a superseded moderation and the vote being added to it', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const oldId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    await using holder = await beginTransaction()
    const voterId = await insertTestPendingAgentModerationVote(holder, fixture.postId, oldId)
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    let commit: Promise<unknown> | undefined
    const releaseHolder = async () => {
      await (commit ??= holder.commit())
    }
    const result = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'agent_moderations moderation',
        releaseHolder,
      },
      async waitForLock => {
        const operation = cleanupObsoleteAgentModerations({
          postIds: [fixture.postId],
          now,
          lowerBoundDate,
          batchSize: 1,
          maxBatches: 1,
        })
        await waitForLock(operation)
        await releaseHolder()
        return operation
      },
    )
    expect(await testAgentModerationExists(fixture.postId, oldId)).toBe(true)
    expect(await hasTestPendingAgentModerationVote(fixture.postId, oldId, voterId)).toBe(true)
    expect(result.deleted).toBe(0)
  })
})
