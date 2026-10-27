import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { beginTransaction, createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import {
  insertModerationJudgementForRetentionTest,
  moderationJudgementForRetentionTest,
  placeJudgementAccountHoldForRetentionTest,
  releaseJudgementAccountHoldForRetentionTest,
} from '@voucha/test-helpers/entities/moderation-judgement-retention'
import { deleteExpiredModerationHistory } from '../cleanup-moderation-delete-history.mts'

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
})
