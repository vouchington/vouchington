import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  acquireModerationOperationRetentionTestLock,
  beginTransaction,
  createTestExpiryWindow,
  createTestUserDirect,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  deleteModerationJudgementRetentionFixturesForTest,
  insertModerationJudgementForRetentionTest,
  moderationJudgementForRetentionTest,
  placeJudgementAccountHoldForRetentionTest,
  releaseJudgementAccountHoldForRetentionTest,
} from '@voucha/test-helpers/entities/moderation-judgement-retention'
import { deleteExpiredModerationHistory } from '../cleanup-moderation-delete-history.mts'
import { cleanupModerationRecords } from '../cleanup-moderation-records.mts'

describe('moderation judgement retention', () => {
  it('keeps rationale for six years and through a target account hold', async () => {
    const [unheldUser, heldUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const heldPostId = await insertTestPost({
      title: 'Held judgement target',
      slug: `held-judgement-${crypto.randomUUID()}`,
      markdown: 'Held judgement target',
      createdById: heldUser.id,
    })
    await using query = await beginTransaction()
    const now = new Date('2035-01-01T00:00:00.000Z')
    const old = new Date('2027-01-01T00:00:00.000Z')
    const young = new Date('2030-01-01T00:00:00.000Z')
    const newer = new Date('2034-01-01T00:00:00.000Z')
    const ids = {
      unheldOld: v7({ msecs: old.getTime() }),
      unheldYoung: v7({ msecs: young.getTime() }),
      unheldNewer: v7({ msecs: newer.getTime() }),
      heldUserOld: v7({ msecs: old.getTime() }),
      heldUserNewer: v7({ msecs: newer.getTime() }),
      heldPostOld: v7({ msecs: old.getTime() }),
      heldPostNewer: v7({ msecs: newer.getTime() }),
    }
    await Promise.all([
      insertModerationJudgementForRetentionTest(query, {
        id: ids.unheldOld,
        reportedUserId: unheldUser.id,
        dispatchedAt: old,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.unheldYoung,
        reportedUserId: unheldUser.id,
        dispatchedAt: young,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.unheldNewer,
        reportedUserId: unheldUser.id,
        dispatchedAt: newer,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.heldUserOld,
        reportedUserId: heldUser.id,
        dispatchedAt: old,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.heldUserNewer,
        reportedUserId: heldUser.id,
        dispatchedAt: newer,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.heldPostOld,
        postId: heldPostId,
        dispatchedAt: old,
      }),
      insertModerationJudgementForRetentionTest(query, {
        id: ids.heldPostNewer,
        postId: heldPostId,
        dispatchedAt: newer,
      }),
    ])
    await placeJudgementAccountHoldForRetentionTest(query, heldUser.id)

    expect(
      await deleteExpiredModerationHistory(
        'judgements',
        query,
        [ids.unheldOld, ids.unheldYoung, ids.heldUserOld, ids.heldPostOld],
        now,
      ),
    ).toBe(1)
    expect(await moderationJudgementForRetentionTest(query, ids.unheldOld)).toBeUndefined()
    expect(
      await Promise.all(
        [ids.unheldYoung, ids.heldUserOld, ids.heldPostOld].map(id =>
          moderationJudgementForRetentionTest(query, id),
        ),
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        recommended_action: 'warn',
        internal_response: 'Preserved private rationale',
      })),
    )

    await releaseJudgementAccountHoldForRetentionTest(query, heldUser.id)
    expect(
      await deleteExpiredModerationHistory(
        'judgements',
        query,
        [ids.heldUserOld, ids.heldPostOld],
        now,
      ),
    ).toBe(2)
  })

  it('keeps a held judgement on the cleanup page until that hold is released', async () => {
    const lock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const window = createTestExpiryWindow()
    const [unheldUser, heldUser, postAuthor] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const heldPostId = await insertTestPost({
      title: 'Held judgement page target',
      slug: `held-judgement-page-${crypto.randomUUID()}`,
      markdown: 'Held judgement page target',
      createdById: postAuthor.id,
    })
    const oldAt = window.firstEligibleDate
    const newerAt = window.secondEligibleDate
    const ids = {
      unheldOld: v7({ msecs: oldAt.getTime(), seq: 0 }),
      heldUserOld: v7({ msecs: oldAt.getTime(), seq: 1 }),
      heldPostOld: v7({ msecs: oldAt.getTime(), seq: 2 }),
      unheldNewer: v7({ msecs: newerAt.getTime(), seq: 0 }),
      heldUserNewer: v7({ msecs: newerAt.getTime(), seq: 1 }),
      heldPostNewer: v7({ msecs: newerAt.getTime(), seq: 2 }),
    }
    const judgementIds = Object.values(ids)
    onTestFinished(() =>
      deleteModerationJudgementRetentionFixturesForTest(judgementIds, [heldUser.id, postAuthor.id]),
    )
    await using setup = await beginTransaction()
    await Promise.all([
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.unheldOld,
        reportedUserId: unheldUser.id,
        dispatchedAt: oldAt,
      }),
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.unheldNewer,
        reportedUserId: unheldUser.id,
        dispatchedAt: newerAt,
      }),
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.heldUserOld,
        reportedUserId: heldUser.id,
        dispatchedAt: oldAt,
      }),
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.heldUserNewer,
        reportedUserId: heldUser.id,
        dispatchedAt: newerAt,
      }),
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.heldPostOld,
        postId: heldPostId,
        dispatchedAt: oldAt,
      }),
      insertModerationJudgementForRetentionTest(setup, {
        id: ids.heldPostNewer,
        postId: heldPostId,
        dispatchedAt: newerAt,
      }),
    ])
    await placeJudgementAccountHoldForRetentionTest(setup, heldUser.id)
    await placeJudgementAccountHoldForRetentionTest(setup, postAuthor.id)
    await setup.commit()

    const sevenYearsLater = new Date(window.upperBoundDate)
    sevenYearsLater.setUTCFullYear(sevenYearsLater.getUTCFullYear() + 7)
    const options = {
      kinds: ['judgements'] as const,
      batchSize: judgementIds.length,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      upperBoundDate: window.upperBoundDate,
      now: sevenYearsLater,
    }
    expect(await cleanupModerationRecords(options)).toMatchObject({ deleted: 1 })
    expect(await readJudgement(ids.unheldOld)).toBeUndefined()
    expect(await readJudgement(ids.heldUserOld)).toMatchObject({
      recommended_action: 'warn',
    })
    expect(await readJudgement(ids.heldPostOld)).toMatchObject({
      recommended_action: 'warn',
    })
    expect(await readJudgement(ids.unheldNewer)).toMatchObject({ recommended_action: 'warn' })
    expect(await readJudgement(ids.heldUserNewer)).toMatchObject({ recommended_action: 'warn' })
    expect(await readJudgement(ids.heldPostNewer)).toMatchObject({ recommended_action: 'warn' })

    await using release = await beginTransaction()
    await releaseJudgementAccountHoldForRetentionTest(release, heldUser.id)
    await releaseJudgementAccountHoldForRetentionTest(release, postAuthor.id)
    await release.commit()

    expect(await cleanupModerationRecords(options)).toMatchObject({ deleted: 2 })
    expect(await readJudgement(ids.heldUserOld)).toBeUndefined()
    expect(await readJudgement(ids.heldPostOld)).toBeUndefined()
    expect(await readJudgement(ids.heldUserNewer)).toMatchObject({ recommended_action: 'warn' })
    expect(await readJudgement(ids.heldPostNewer)).toMatchObject({ recommended_action: 'warn' })
  })
})

async function readJudgement(id: string) {
  await using query = await beginTransaction()
  return await moderationJudgementForRetentionTest(query, id)
}
