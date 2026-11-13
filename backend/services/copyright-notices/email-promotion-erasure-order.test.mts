import { createCommittedCopyrightPendingReply } from '@voucha/test-helpers/copyright-owned-email-replies'
import { interleaveCopyrightOwnedRead } from '@voucha/test-helpers/copyright-owned-read-interleave'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import { createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  markTestCopyrightNoticeErasedAndCommit,
  isTestCopyrightCaseEvidenceErased,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { copyrightEmailPromotionInput } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, onTestFinished } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email promotion replay and case erasure', () => {
  it('maps a deadlocked admission to a domain conflict without promotion effects', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    const failure = Object.assign(new Error('deadlock detected'), { code: '40P01' })
    let reachedRead = false
    const restore = runBeforePostgresStatementForTest(
      '/* promoteCopyrightEmailIntake:exists */',
      async () => {
        reachedRead = true
        throw failure
      },
    )
    onTestFinished(restore)
    try {
      await expect(promoteCopyrightEmailIntake(input)).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
        cause: failure,
      })
    } finally {
      restore()
    }
    expect(reachedRead).toBe(true)
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({ reviews: 0, evidence: 0, notice_targets: 0 })
  })

  it('rolls back a pending reply link when erasure commits after the replay snapshot', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { input, noticeId, rootId, replyId } =
      await createCommittedCopyrightPendingReply(moderator)
    expect(await readCopyrightEmailIntakeNoticeLinks(replyId)).toEqual([])
    const effects = await readCopyrightEmailPromotionEffects(rootId, input.targets[0]!.placementId)
    const references = await readCopyrightThreadReferenceState(replyId)
    const race = await interleaveCopyrightOwnedRead({
      marker: 'promoteCopyrightEmailIntake:priorPromotion',
      ownedId: rootId,
      first: () => promoteCopyrightEmailIntake(input),
      second: () => markTestCopyrightNoticeErasedAndCommit(noticeId),
    })
    expect(race.observerErrors).toEqual([])
    expect(race.second).toEqual({ status: 'fulfilled', value: undefined })
    expect([
      ...['40001', '40P01'].map(code => ({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          cause: expect.objectContaining({ code }),
        }),
      })),
      {
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          cause: expect.objectContaining({
            code: '23514',
            message: 'erased copyright case cannot acquire an email intake',
          }),
        }),
      },
    ]).toContainEqual(race.first)
    expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
    expect(await readCopyrightEmailIntakeNoticeLinks(rootId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeNoticeLinks(replyId)).toEqual([])
    expect(await readCopyrightThreadReferenceState(replyId)).toEqual(references)
    expect(await readCopyrightEmailPromotionEffects(rootId, input.targets[0]!.placementId)).toEqual(
      effects,
    )
  })

  it('rejects a separately committed erased case replay without attaching its pending reply', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { input, noticeId, rootId, replyId } =
      await createCommittedCopyrightPendingReply(moderator)
    await markTestCopyrightNoticeErasedAndCommit(noticeId)
    const effects = await readCopyrightEmailPromotionEffects(rootId, input.targets[0]!.placementId)
    const references = await readCopyrightThreadReferenceState(replyId)
    await expect(promoteCopyrightEmailIntake(input)).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: { code: '23514', message: 'erased copyright case cannot acquire an email intake' },
    })
    expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(true)
    expect(await readCopyrightEmailIntakeNoticeLinks(rootId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeNoticeLinks(replyId)).toEqual([])
    expect(await readCopyrightThreadReferenceState(replyId)).toEqual(references)
    expect(await readCopyrightEmailPromotionEffects(rootId, input.targets[0]!.placementId)).toEqual(
      effects,
    )
  })
})
