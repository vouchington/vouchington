import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction, insertTestAgentModeration } from '@voucha/test-helpers'
import { lockTestAgentModerationRetentionSource } from '@voucha/test-helpers/agent-moderation-retention-concurrency'
import { getTestAgentModerationRetentionState } from '@voucha/test-helpers/agent-moderation-retention-pages'
import {
  createTestAgentModerationRetentionFixture,
  testAgentModerationExists,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupObsoleteAgentModerations } from '../cleanup-agent-moderations.mts'

describe('agent moderation retention reconciliation', () => {
  it('deletes the superseded result when adjacent inserts commit out of order', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await using older = await beginTransaction()
    await using newer = await beginTransaction()
    const olderId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    const newerId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) }, newer)
    await newer.commit()
    await older.commit()

    const options = {
      now,
      lowerBoundDate,
      postIds: [fixture.postId],
      batchSize: 1,
      maxBatches: 1,
    }
    const first = await cleanupObsoleteAgentModerations(options)
    expect(first).toMatchObject({ scanned: 1, deleted: 1, hasMore: true })
    expect(await testAgentModerationExists(fixture.postId, olderId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, newerId)).toBe(true)

    const keeperCheck = await cleanupObsoleteAgentModerations(options)
    expect(keeperCheck).toMatchObject({ scanned: 1, deleted: 0, hasMore: true })
    expect(
      await cleanupObsoleteAgentModerations({
        ...options,
        continuation: keeperCheck.continuation!,
      }),
    ).toEqual({ scanned: 1, deleted: 0, hasMore: false, continuation: null })
    expect(await cleanupObsoleteAgentModerations(options)).toEqual({
      scanned: 0,
      deleted: 0,
      hasMore: false,
      continuation: null,
    })
    expect(await testAgentModerationExists(fixture.postId, newerId)).toBe(true)
  })

  it('wakes a settled keeper when its unseen successor commits', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await using older = await beginTransaction()
    await using newer = await beginTransaction()
    const olderId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    const newerId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) }, newer)
    await older.commit()

    const options = {
      now,
      lowerBoundDate,
      postIds: [fixture.postId],
      batchSize: 1,
      maxBatches: 1,
    }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await getTestAgentModerationRetentionState(fixture.postId, olderId)).toEqual({
      dueAt: null,
      blockedReason: 'newest',
    })
    await newer.commit()

    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({
      scanned: 1,
      deleted: 0,
      hasMore: true,
    })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 0, deleted: 0 })
    expect(await testAgentModerationExists(fixture.postId, olderId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, newerId)).toBe(true)
  })

  it('rechecks the predecessor after a successor sees its uncommitted keeper check', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await using older = await beginTransaction()
    await using newer = await beginTransaction()
    const olderId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    const newerId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) }, newer)
    await older.commit()
    const options = {
      now,
      postIds: [fixture.postId],
      batchSize: 1,
      maxBatches: 1,
    }
    onTestFinished(
      afterPostgresTransactionQueryForTest(
        'blockAgentModerationRetentionCandidates',
        values => (values[0] as string[]).includes(olderId),
        async () => {
          await newer.commit()
          expect(
            await cleanupObsoleteAgentModerations({
              ...options,
              lowerBoundDate: at(94.5),
            }),
          ).toMatchObject({ scanned: 1, deleted: 0 })
        },
      ),
    )

    const first = await cleanupObsoleteAgentModerations({ ...options, lowerBoundDate })
    const predecessor = await getTestAgentModerationRetentionState(fixture.postId, olderId)
    const resumed = first.continuation
      ? await cleanupObsoleteAgentModerations({
          ...options,
          lowerBoundDate,
          continuation: first.continuation,
        })
      : null
    expect(await testAgentModerationExists(fixture.postId, olderId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, newerId)).toBe(true)
    expect(first).toMatchObject({ scanned: 1, deleted: 0, hasMore: true })
    expect(predecessor).toMatchObject({ blockedReason: 'check_newest' })
    expect(resumed).toMatchObject({ scanned: 1, deleted: 1 })
  })

  it('honors a fresh successor wake even when the keeper check has an older snapshot', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const olderId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    const options = { now, lowerBoundDate, postIds: [fixture.postId], batchSize: 1, maxBatches: 1 }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({
      scanned: 1,
      deleted: 0,
      hasMore: true,
    })
    expect(await getTestAgentModerationRetentionState(fixture.postId, olderId)).toMatchObject({
      blockedReason: 'check_newest',
    })

    await using holder = await beginTransaction()
    await lockTestAgentModerationRetentionSource(holder, fixture.postId, olderId)
    const { result, newerId } = await withTestOwnedPostgresWait(
      {
        holderProcessId: await getTestPostgresBackendProcessId(holder),
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'reconcileAgentModerationRetentionPage',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const cleanup = cleanupObsoleteAgentModerations(options)
        await waitForLock(cleanup)
        const freshId = await insertTestAgentModeration({ ...fixture, occurredAt: at(1) }, holder)
        await holder.commit()
        return { result: await cleanup, newerId: freshId }
      },
    )

    expect(await testAgentModerationExists(fixture.postId, olderId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, newerId)).toBe(true)
    expect(result).toMatchObject({ scanned: 1, deleted: 1 })
  })

  it('keeps an overlapping predecessor reconciliation pending until its own wake commits', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    await using original = await beginTransaction()
    await using older = await beginTransaction()
    const originalId = await insertTestAgentModeration({ ...fixture, occurredAt: at(96) }, original)
    const predecessorId = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) }, older)
    await original.commit()
    const options = {
      now,
      lowerBoundDate,
      postIds: [fixture.postId],
      batchSize: 1,
      maxBatches: 1,
    }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    await older.commit()
    const successorId = await insertTestAgentModeration({ ...fixture, occurredAt: at(94) })

    const paused = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const restore = runBeforePostgresStatementForTest(
      'listAgentModerationCleanupCandidates',
      async () => {
        paused.resolve()
        await release.promise
      },
    )
    const predecessor = cleanupObsoleteAgentModerations({
      ...options,
      lowerBoundDate: at(95.5),
      upperBoundDate: at(94.5),
    })
    const [predecessorResult, successorResult] = await Promise.all([
      predecessor,
      (async () => {
        try {
          await Promise.race([
            paused.promise,
            predecessor.then(() => {
              throw new Error('Expected the predecessor sweep to pause')
            }),
          ])
          return await cleanupObsoleteAgentModerations({
            ...options,
            lowerBoundDate: at(94.5),
          })
        } finally {
          release.resolve()
          restore()
        }
      })(),
    ])

    expect(successorResult).toMatchObject({ scanned: 1, deleted: 0 })
    expect(predecessorResult).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await testAgentModerationExists(fixture.postId, originalId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, predecessorId)).toBe(false)
    expect(await testAgentModerationExists(fixture.postId, successorId)).toBe(true)
  })
})
