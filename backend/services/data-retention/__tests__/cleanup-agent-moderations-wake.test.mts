import { describe, expect, it } from 'vitest'
import { beginTransaction, insertTestAgentModeration } from '@voucha/test-helpers'
import {
  attachTestAgentModerationAuditReference,
  createTestAgentModerationRetentionFixture,
  deleteTestAgentModerationAuditReference,
  getTestAgentModerationRetentionHashBlockedIds,
  getTestAgentModerationRetentionPostCursor,
  insertTestAgentModerationRetentionPostWork,
  setTestAgentModerationRetentionHashBlocked,
  setTestPostCurrentModerationInputHashFromResult,
  testAgentModerationExists,
  testAgentModerationRetentionPostHasWork,
} from '@voucha/test-helpers/entities/agent-moderation-retention'
import {
  getTestModerationTransparencyRollupCount,
  getTestReleasedModerationTransparencyRollupCount,
} from '@voucha/test-helpers/entities/moderation-transparency-rollups'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { cleanupObsoleteAgentModerations } from '../cleanup-agent-moderations.mts'
import { reconsiderChangedPostById } from '../cleanup-agent-moderation-hash-work.mts'

describe('agent moderation retention wake-ups', () => {
  it('does not revisit old keeper rows on an unchanged daily run', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const oldKeeper = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    expect(
      await cleanupObsoleteAgentModerations({ now, lowerBoundDate, batchSize: 1, maxBatches: 1 }),
    ).toMatchObject({ scanned: 0, deleted: 0 })
    expect(
      await cleanupObsoleteAgentModerations({ now, lowerBoundDate, batchSize: 1, maxBatches: 1 }),
    ).toMatchObject({ scanned: 0, deleted: 0 })
    expect(await testAgentModerationExists(fixture.postId, oldKeeper)).toBe(true)
  })

  it('waits until the source reaches the retention age after supersession', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const recent = await insertTestAgentModeration({ ...fixture, occurredAt: at(89) })
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    const options = { lowerBoundDate, batchSize: 2, maxBatches: 1 }
    expect(await cleanupObsoleteAgentModerations({ ...options, now })).toMatchObject({
      scanned: 0,
      deleted: 0,
    })
    expect(
      await cleanupObsoleteAgentModerations({
        ...options,
        now: new Date(now.getTime() + 2 * 86_400_000),
      }),
    ).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await testAgentModerationExists(fixture.postId, recent)).toBe(false)
  })

  it('wakes a held result only after its audit reference is removed', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const held = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    await attachTestAgentModerationAuditReference(fixture.postId, held)
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 0 })
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 0, deleted: 0 })
    await deleteTestAgentModerationAuditReference(fixture.postId, held)
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 1, deleted: 1 })
    expect(await testAgentModerationExists(fixture.postId, held)).toBe(false)
  })

  it('keeps a restored current hash until a later edit makes it obsolete again', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const old = await insertTestAgentModeration({ ...fixture, occurredAt: at(95) })
    const newest = await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, old)
    expect(await testAgentModerationRetentionPostHasWork(fixture.postId)).toBe(false)
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 0 })
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, newest)
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, old)
    {
      await using transaction = await beginTransaction()
      await reconsiderChangedPostById(transaction, fixture.postId, 2)
      await transaction.commit()
    }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 0 })
    expect(await testAgentModerationExists(fixture.postId, old)).toBe(true)
    const unrelatedPostIds = [
      (await createTestAgentModerationRetentionFixture()).postId,
      (await createTestAgentModerationRetentionFixture()).postId,
    ]
    try {
      {
        await using transaction = await beginTransaction()
        await setTestPostCurrentModerationInputHashFromResult(fixture.postId, newest, transaction)
        await insertTestAgentModerationRetentionPostWork(
          unrelatedPostIds,
          new Date('2000-01-01T00:00:00.000Z'),
          transaction,
        )
        expect(await reconsiderChangedPostById(transaction, fixture.postId, 2)).toMatchObject({
          processed: true,
          hasMore: true,
        })
        expect(await testAgentModerationRetentionPostHasWork(fixture.postId, transaction)).toBe(
          false,
        )
        await transaction.commit()
      }
      expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 1 })
      expect(await testAgentModerationExists(fixture.postId, old)).toBe(false)
    } finally {
      for (const postId of unrelatedPostIds) {
        await using transaction = await beginTransaction()
        await reconsiderChangedPostById(transaction, postId, 2)
        await transaction.commit()
      }
    }
  })

  it('advances a hash-work cursor past a current-hash keeper before waking the next result', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const keeper = await insertTestAgentModeration({ ...fixture, occurredAt: at(89) })
    const obsolete = await insertTestAgentModeration({ ...fixture, occurredAt: at(88) })
    const newest = await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    await setTestPostCurrentModerationInputHashFromResult(fixture.postId, newest)

    {
      await using transaction = await beginTransaction()
      await setTestAgentModerationRetentionHashBlocked(
        fixture.postId,
        [keeper, obsolete],
        transaction,
      )
      await setTestPostCurrentModerationInputHashFromResult(fixture.postId, keeper, transaction)
      expect(await testAgentModerationRetentionPostHasWork(fixture.postId, transaction)).toBe(true)
      expect(await reconsiderChangedPostById(transaction, fixture.postId, 1)).toMatchObject({
        processed: true,
        hasMore: true,
      })
      expect(await getTestAgentModerationRetentionPostCursor(fixture.postId, transaction)).toBe(
        keeper,
      )
      expect(
        await getTestAgentModerationRetentionHashBlockedIds(fixture.postId, transaction),
      ).toEqual([keeper, obsolete])
      expect(await reconsiderChangedPostById(transaction, fixture.postId, 1)).toMatchObject({
        processed: true,
      })
      expect(
        await getTestAgentModerationRetentionHashBlockedIds(fixture.postId, transaction),
      ).toEqual([keeper])
      expect(await testAgentModerationRetentionPostHasWork(fixture.postId, transaction)).toBe(false)
      await transaction.commit()
    }
    await cleanupObsoleteAgentModerations({
      now: new Date(now.getTime() + 3 * 86_400_000),
      lowerBoundDate,
      batchSize: 1,
      maxBatches: 1,
    })
    expect(await testAgentModerationExists(fixture.postId, keeper)).toBe(true)
    expect(await testAgentModerationExists(fixture.postId, obsolete)).toBe(false)
  })

  it('privately drains an old transparency cohort below the release threshold', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const fixture = await createTestAgentModerationRetentionFixture()
    const oldDay = at(91)
    await insertTestAgentModeration({ ...fixture, occurredAt: oldDay, occurredAtSequence: 1 })
    await insertTestAgentModeration({ ...fixture, occurredAt: oldDay, occurredAtSequence: 2 })
    await insertTestAgentModeration({ ...fixture, occurredAt: at(1) })
    const options = { now, lowerBoundDate, batchSize: 3, maxBatches: 1 }
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ deleted: 2 })
    expect(
      await getTestModerationTransparencyRollupCount({
        occurredAt: oldDay,
        metric: 'automated_moderation',
        category: 'agent_moderation',
      }),
    ).toBeUndefined()
    expect(
      await getTestReleasedModerationTransparencyRollupCount({
        occurredAt: oldDay,
        metric: 'automated_moderation',
        category: 'agent_moderation',
      }),
    ).toBeUndefined()
    expect(await cleanupObsoleteAgentModerations(options)).toMatchObject({ scanned: 0, deleted: 0 })
  })
})
