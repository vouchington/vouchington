import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestPostgresBackendProcessId,
  getTestAgentModerationTransparencyStamp,
  insertTestAgentModeration,
  insertTestPost,
  setTestAgentDeletedAt,
} from '@voucha/test-helpers'
import {
  attachTestAgentModerationAuditReference,
  createTestAgentModerationRetentionFixture,
  attachTestAgentModerationFlagReference,
  attachTestAgentModerationTrainingReference,
  attachTestAgentModerationVoteReference,
  deleteTestAgentModerationAuditReference,
  deleteTestAgentModerationFlagReference,
  deleteTestAgentModerationTrainingReference,
  deleteTestAgentModerationVoteReference,
  releaseTestAgentModerationTransparencyDay,
  setTestPostCurrentModerationInputHashFromResult,
  testAgentModerationExists,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import {
  getTestModerationTransparencyRollupCount,
  getTestReleasedModerationTransparencyRollupCount,
} from '@voucha/test-helpers/entities/moderation-transparency-rollups'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { reconsiderChangedPostById } from '../cleanup-agent-moderation-hash-work.mts'
import {
  cleanupObsoleteAgentModerations,
  type AgentModerationCleanupContinuation,
} from '../cleanup-agent-moderations.mts'

describe('agent moderation retention', () => {
  it('preserves the current input hash, newest live fallback, absolute newest, and 90-day boundary', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await setTestAgentDeletedAt(fixture.agentId, new Date())
    const oldCurrent = await insertTestAgentModeration({
      ...fixture,
      agentId: fixture.agentId,
      occurredAt: at(92),
    })
    const oldDeleted = await insertTestAgentModeration({
      ...fixture,
      agentId: fixture.agentId,
      occurredAt: at(91),
      deletedAt: at(90),
    })
    const boundary = await insertTestAgentModeration({
      ...fixture,
      agentId: fixture.agentId,
      occurredAt: at(90),
    })
    const newest = await insertTestAgentModeration({
      ...fixture,
      agentId: fixture.agentId,
      occurredAt: at(1),
    })
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, oldCurrent)
    const options = { now, lowerBoundDate, batchSize: 10, maxBatches: 1 }

    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({
      scanned: 2,
      deleted: 1,
    })
    expect(await testAgentModerationExists(fixture.postId, oldCurrent)).toBe(true)
    expect(await testAgentModerationExists(fixture.postId, oldDeleted)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, boundary)).toBe(true)
    expect(await testAgentModerationExists(fixture.postId, newest)).toBe(true)

    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, newest)
    {
      await using transaction = await beginTransaction()
      await reconsiderChangedPostById(transaction, fixture.postId, 10)
      await transaction.commit()
    }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 1 })
    expect(await testAgentModerationExists(fixture.postId, oldCurrent)).toBe(false)

    const fallbackPost = await insertTestPost({
      createdById: (await createTestUserDirect()).id,
      slug: `agent-retention-fallback-${crypto.randomUUID()}`,
      title: 'Visible fallback',
      markdown: 'Synthetic moderation input',
    })
    const liveFallback = await insertTestAgentModeration({
      postId: fallbackPost,
      promptId: fixture.promptId,
      agentId: fixture.agentId,
      occurredAt: at(95),
    })
    const deletedNewest = await insertTestAgentModeration({
      postId: fallbackPost,
      promptId: fixture.promptId,
      agentId: fixture.agentId,
      occurredAt: at(94),
      deletedAt: at(93),
    })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 0 })
    expect(await testAgentModerationExists(fallbackPost, liveFallback)).toBe(true)
    expect(await testAgentModerationExists(fallbackPost, deletedNewest)).toBe(true)
  })

  it('advances through keeper pages and preserves accounting references', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await setTestAgentDeletedAt(fixture.agentId, new Date())
    const ids = []
    for (const daysAgo of [98, 97, 96, 95, 94, 93]) {
      ids.push(await insertTestAgentModeration({ ...fixture, occurredAt: at(daysAgo) }))
    }
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    await attachTestAgentModerationAuditReference(fixture.postId, ids[0]!)
    await attachTestAgentModerationTrainingReference(fixture.postId, ids[1]!)
    await attachTestAgentModerationFlagReference(fixture.postId, ids[2]!)
    await attachTestAgentModerationVoteReference(
      fixture.postId,
      ids[3]!,
      (await createTestUserDirect()).id,
    )
    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    let continuation: AgentModerationCleanupContinuation | null = null
    const deletedByPage = []
    const hasMoreByPage = []
    let lateId: string | null = null
    for (let page = 0; page < ids.length; page += 1) {
      const result = await cleanupObsoleteAgentModerations({
        ...options,
        now: page === 0 ? now : new Date(now.getTime() + 10 * 86_400_000),
        ...(continuation ? { continuation } : {}),
      })
      expect(result.scanned).toBe(1)
      hasMoreByPage.push(result.hasMore)
      deletedByPage.push(result.deleted)
      continuation = result.continuation
      if (page === 0) {
        // This id crosses the age boundary before the continuation but remains outside its frozen bound.
        lateId = await insertTestAgentModeration({ ...fixture, occurredAt: at(89) })
      }
    }
    expect(deletedByPage).toEqual([0, 0, 0, 0, 1, 1])
    expect(hasMoreByPage.slice(0, -1)).toEqual(Array.from({ length: ids.length - 1 }, () => true))
    expect(await Promise.all(ids.map(id => testAgentModerationExists(fixture.postId, id)))).toEqual(
      [true, true, true, true, false, false],
    )
    await deleteTestAgentModerationAuditReference(fixture.postId, ids[0]!)
    await deleteTestAgentModerationTrainingReference(fixture.postId, ids[1]!)
    await deleteTestAgentModerationFlagReference(fixture.postId, ids[2]!)
    await deleteTestAgentModerationVoteReference(fixture.postId, ids[3]!)
    expect(
      await cleanupObsoleteAgentModerations({
        now,
        lowerBoundDate,
        batchSize: 10,
        maxBatches: 1,
      }),
    ).toMatchObject({ scanned: 4, deleted: 4 })
    if (!lateId) throw new Error('Expected a later moderation fixture')
    expect(await testAgentModerationExists(fixture.postId, lateId)).toBe(true)
  })

  it('continues across equal moderation ids on different posts', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await setTestAgentDeletedAt(fixture.agentId, new Date())
    const secondPostId = await insertTestPost({
      createdById: (await createTestUserDirect()).id,
      slug: `agent-retention-tied-id-${crypto.randomUUID()}`,
      title: 'Tied moderation id',
      markdown: 'Independent synthetic input',
    })
    const occurredAt = at(95)
    const firstId = await insertTestAgentModeration({
      ...fixture,
      occurredAt,
      occurredAtSequence: 42,
    })
    const secondId = await insertTestAgentModeration({
      ...fixture,
      postId: secondPostId,
      moderationId: firstId,
    })
    expect(secondId).toBe(firstId)
    await Promise.all([
      insertTestAgentModeration({ ...fixture, occurredAt: at(1) }),
      insertTestAgentModeration({ ...fixture, postId: secondPostId, occurredAt: at(1) }),
    ])

    const options = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
    const first = await cleanupObsoleteAgentModerations(options)
    expect(first).toMatchObject({ scanned: 1, deleted: 1, hasMore: true })
    expect(first.continuation).toMatchObject({
      afterId: firstId,
      afterPostId: [fixture.postId, secondPostId].toSorted()[0],
    })
    const second = await cleanupObsoleteAgentModerations({
      ...options,
      continuation: first.continuation!,
    })
    expect(second).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await testAgentModerationExists(fixture.postId, firstId)).toBe(false)
    expect(await testAgentModerationExists(secondPostId, secondId)).toBe(false)
  })

  it('rechecks the current input hash after a concurrent post update wins', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await setTestAgentDeletedAt(fixture.agentId, new Date())
    const revertedResult = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })

    await using holder = await beginTransaction()
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, revertedResult, holder)
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    const result = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'lockAgentModerationCleanupPosts',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const cleanup = cleanupObsoleteAgentModerations({
          now,
          lowerBoundDate,
          batchSize: 1,
          maxBatches: 1,
        })
        await waitForLock(cleanup)
        await holder.commit()
        return cleanup
      },
    )
    expect(result).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await testAgentModerationExists(fixture.postId, revertedResult)).toBe(true)
  })

  it('deletes a released transparency cohort without changing its disclosed total', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const oldDay = at(91)
    const oldIds = await Promise.all(
      Array.from({ length: 20 }, (_, sequence) =>
        insertTestAgentModeration({ ...fixture, occurredAt: oldDay, occurredAtSequence: sequence }),
      ),
    )
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    expect(await getTestAgentModerationTransparencyStamp(oldIds[0]!)).toEqual({
      category: 'agent_moderation',
      communityId: null,
    })
    const options = { now, lowerBoundDate, batchSize: 25, maxBatches: 1 }
    expect(
      await getTestModerationTransparencyRollupCount({
        occurredAt: oldDay,
        metric: 'automated_moderation',
        category: 'agent_moderation',
      }),
    ).toBe(20)
    await releaseTestAgentModerationTransparencyDay(oldDay)
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 20 })
    expect(
      await getTestReleasedModerationTransparencyRollupCount({
        occurredAt: oldDay,
        metric: 'automated_moderation',
        category: 'agent_moderation',
      }),
    ).toBe(20)
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 0, deleted: 0 })
    expect(
      await getTestReleasedModerationTransparencyRollupCount({
        occurredAt: oldDay,
        metric: 'automated_moderation',
        category: 'agent_moderation',
      }),
    ).toBe(20)
  })
})
