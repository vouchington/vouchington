import { createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import {
  readCopyrightEmailIntakeNoticeLinks,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it, onTestFinished } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email promotion and threading', () => {
  it('retains one case link and a matching review when promotion races a thread link', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)

    const [promotion, threadLink] = await Promise.allSettled([
      promoteCopyrightEmailIntake(input),
      linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: parent.noticeId,
        linkKind: 'thread',
        matchedReference: messageId,
      }),
    ])
    const links = await readCopyrightEmailIntakeNoticeLinks(intake.id)
    const reviews = await readCopyrightEmailIntakeReview(intake.id)
    const wasPromoted = promotion.status === 'fulfilled'
    const expectedNoticeId = wasPromoted ? promotion.value.noticeId : parent.noticeId
    const effects = await readCopyrightEmailPromotionEffects(
      intake.id,
      input.targets[0]!.placementId,
    )
    const threadLinkOutcome =
      threadLink.status === 'fulfilled'
        ? { status: 'fulfilled', value: threadLink.value }
        : {
            status: 'rejected',
            code: (threadLink.reason as { code?: string }).code,
            statusCode: (threadLink.reason as { status?: number }).status,
            causeCode: (threadLink.reason as { cause?: { code?: string } }).cause?.code,
            causeMessage: (threadLink.reason as { cause?: { message?: string } }).cause?.message,
          }
    expect([
      { wasPromoted: true, threadLink: { status: 'fulfilled', value: false } },
      {
        wasPromoted: true,
        threadLink: {
          status: 'rejected',
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          statusCode: 409,
          causeCode: '23514',
          causeMessage: 'reviewed copyright email intake cannot be linked as thread correspondence',
        },
      },
      { wasPromoted: false, threadLink: { status: 'fulfilled', value: true } },
    ]).toContainEqual({ wasPromoted, threadLink: threadLinkOutcome })
    const rejectionStatus =
      promotion.status === 'rejected'
        ? (promotion.reason as { status?: number } | null)?.status
        : null
    expect(rejectionStatus).toBe(wasPromoted ? null : 409)
    expect(links).toEqual([
      { copyright_notice_id: expectedNoticeId, link_kind: wasPromoted ? 'initial' : 'thread' },
    ])
    expect(reviews).toEqual(
      wasPromoted ? [{ decision: 'approved', promoted_copyright_notice_id: expectedNoticeId }] : [],
    )
    expect(effects).toMatchObject({
      reviews: Number(wasPromoted),
      evidence: Number(wasPromoted),
      notice_targets: Number(wasPromoted),
    })
  })

  it('commits a review before a competing thread link can touch its evidence object', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    const evidenceInserted = Promise.withResolvers<void>()
    const releasePromotion = Promise.withResolvers<void>()
    let holderProcessId: number | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'promoteCopyrightEmailIntake:evidence',
      values => values.includes(intake.raw_storage_object_id),
      async transaction => {
        holderProcessId = await getTestPostgresBackendProcessId(transaction)
        evidenceInserted.resolve()
        await releasePromotion.promise
      },
    )
    onTestFinished(restore)
    const promotion = promoteCopyrightEmailIntake(input)
    void promotion.catch(evidenceInserted.reject)
    let threadLink: PromiseSettledResult<boolean>
    try {
      await evidenceInserted.promise
      if (holderProcessId === undefined)
        throw new Error('Promotion evidence had no PostgreSQL owner')
      threadLink = await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: '/* linkCopyrightEmailIntakeToNotice */',
          releaseHolder: async () => releasePromotion.resolve(),
        },
        async waitForLock => {
          const attempt = linkCopyrightEmailIntakeToNotice({
            intakeId: intake.id,
            noticeId: parent.noticeId,
            linkKind: 'thread',
            matchedReference: messageId,
          })
          await waitForLock(attempt)
          releasePromotion.resolve()
          return (await Promise.allSettled([attempt]))[0]!
        },
      )
    } finally {
      releasePromotion.resolve()
      await Promise.allSettled([promotion])
      restore()
    }
    const promoted = await promotion
    expect(threadLink).toMatchObject({
      status: 'rejected',
      reason: {
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
        cause: {
          code: '23514',
          message: 'reviewed copyright email intake cannot be linked as thread correspondence',
        },
      },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: promoted.noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([
      { decision: 'approved', promoted_copyright_notice_id: promoted.noticeId },
    ])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({
      reviews: 1,
      evidence: 1,
      notice_targets: 1,
    })
  })

  it('admits one case when two promotions race on the same receipt', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = await copyrightEmailPromotionInput(moderator, intake.id)
    const firstReviewed = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let holderProcessId: number | undefined
    const restore = afterPostgresTransactionQueryForTest(
      'promoteCopyrightEmailIntake:review',
      values => values.includes(intake.id),
      async transaction => {
        holderProcessId = await getTestPostgresBackendProcessId(transaction)
        firstReviewed.resolve()
        await releaseFirst.promise
      },
    )
    onTestFinished(restore)
    const first = promoteCopyrightEmailIntake(input)
    void first.catch(firstReviewed.reject)
    let second: PromiseSettledResult<Awaited<typeof first>>
    try {
      await firstReviewed.promise
      if (holderProcessId === undefined) throw new Error('First promotion had no PostgreSQL owner')
      second = await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: '/* promoteCopyrightEmailIntake:currentDecision */',
          releaseHolder: async () => releaseFirst.resolve(),
        },
        async waitForLock => {
          const attempt = promoteCopyrightEmailIntake(input)
          await waitForLock(attempt)
          releaseFirst.resolve()
          return (await Promise.allSettled([attempt]))[0]!
        },
      )
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first])
      restore()
    }
    const admitted = await first
    expect(second).toMatchObject({
      status: 'rejected',
      reason: { status: 409, message: 'Copyright email intake was decided concurrently' },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
      { copyright_notice_id: admitted.noticeId, link_kind: 'initial' },
    ])
    expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([
      { decision: 'approved', promoted_copyright_notice_id: admitted.noticeId },
    ])
    expect(
      await readCopyrightEmailPromotionEffects(intake.id, input.targets[0]!.placementId),
    ).toMatchObject({
      reviews: 1,
      evidence: 1,
      notice_targets: 1,
    })
  })
})
