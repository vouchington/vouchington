import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightNoticeForManualAssociation,
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from '@voucha/test-helpers/copyright-email-manual-association'
import {
  copyrightEmailMessageId,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { rejectAndAssociateCopyrightEmail } from '@voucha/test-helpers/copyright-rejection-association-race'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-rejection.mts'

async function createRejectionScene() {
  const currentUser = await createTestUser({ extraRoles: ['moderator'] })
  const noticeId = await createCopyrightNoticeForManualAssociation()
  const rejected = await recordThreadedCopyrightEmail({
    messageId: copyrightEmailMessageId(),
    replyReferences: [copyrightEmailMessageId()],
  })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: rejected.intakeId,
    noticeId,
    linkKind: 'thread',
  })
  return {
    noticeId,
    input: {
      currentUser,
      intakeId: rejected.intakeId,
      kind: 'supplement' as const,
      rationale: 'The reply does not substantiate the requested action.',
      recommendationId: null,
      manualFallbackReason: 'Agent unavailable.',
    },
  }
}

describe('copyright correspondence rejection and another intake association', () => {
  it.each(['rejection', 'association'] as const)(
    'preserves complete outcomes with %s scheduled first',
    async first => {
      const { noticeId, input } = await createRejectionScene()
      const associated = await recordThreadedCopyrightEmail({
        messageId: copyrightEmailMessageId(),
        replyReferences: [copyrightEmailMessageId()],
      })
      const before = await getCopyrightNoticePrivateAggregate(noticeId)
      const beforeClock = await readCopyrightCaseLifecycleClock(noticeId)
      const result = await rejectAndAssociateCopyrightEmail(
        input,
        noticeId,
        associated.intakeId,
        first,
      )
      const rejectionWon = result.rejection.status === 'fulfilled'
      const associationWon = result.association.status === 'fulfilled'
      const rejected = {
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'CONFLICT',
          cause: expect.objectContaining({ code: '40001' }),
        }),
      }
      const associationRejected = {
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'copyright_email_thread_changed',
          cause: expect.objectContaining({ code: '40001' }),
        }),
      }
      const rejectionSuccess = { status: 'fulfilled', value: { noticeId, isDuplicate: false } }
      const associationSuccess = {
        status: 'fulfilled',
        value: expect.objectContaining({
          copyright_notice: expect.objectContaining({ id: noticeId }),
          copyright_email_intake: expect.objectContaining({ id: associated.intakeId }),
        }),
      }
      expect([
        { rejection: rejectionSuccess, association: associationRejected },
        { rejection: rejected, association: associationSuccess },
        { rejection: rejected, association: associationRejected },
      ]).toContainEqual(result)
      const bothAborted = !rejectionWon && !associationWon
      const rollbackState = bothAborted
        ? {
            aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
            clock: await readCopyrightCaseLifecycleClock(noticeId),
          }
        : null
      expect(rollbackState).toEqual(bothAborted ? { aggregate: before, clock: beforeClock } : null)
      expect(await readCopyrightEmailIntakeNoticeLinks(input.intakeId)).toEqual([
        { copyright_notice_id: noticeId, link_kind: 'thread' },
      ])
      expect(await readCopyrightEmailIntakeNoticeLinks(associated.intakeId)).toEqual(
        associationWon ? [{ copyright_notice_id: noticeId, link_kind: 'thread' }] : [],
      )
      expect(await readCopyrightEmailManualAssociationReview(input.intakeId)).toEqual([
        { copyright_notice_id: noticeId, action: rejectionWon ? 'rejected' : 'pending' },
      ])
      expect(await readCopyrightEmailManualAssociationReview(associated.intakeId)).toEqual(
        associationWon ? [{ copyright_notice_id: noticeId, action: 'pending' }] : [],
      )
      expect(await readCopyrightEmailManualAssociationEvent(associated.intakeId)).toEqual(
        !associationWon
          ? []
          : [
              {
                copyright_notice_id: noticeId,
                changed_by_id: input.currentUser.id,
                copyright_notice_email_intake_id: associated.intakeId,
              },
            ],
      )
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      const expectedReview = expect.objectContaining({
        copyright_notice_id: noticeId,
        copyright_notice_email_intake_id: input.intakeId,
        reviewed_by_id: input.currentUser.id,
        action: 'rejected',
        kind: 'supplement',
      })
      const expectedEvent = expect.objectContaining({
        copyright_notice_id: noticeId,
        changed_by_id: input.currentUser.id,
        copyright_notice_email_intake_id: input.intakeId,
      })
      expect(aggregate?.emailCorrespondenceReviews).toEqual(rejectionWon ? [expectedReview] : [])
      expect(
        aggregate?.lifecycleEvents.filter(
          row => row.change_type === 'email_correspondence_rejected',
        ),
      ).toEqual(rejectionWon ? [expectedEvent] : [])
      const replay = rejectionWon ? await rejectCopyrightEmailCorrespondence(input) : null
      expect(replay).toEqual(rejectionWon ? { noticeId, isDuplicate: true } : null)
    },
  )

  it('rolls back the earlier event, clock and review when a later write fails', async () => {
    const { noticeId, input } = await createRejectionScene()
    const before = await readCopyrightCaseLifecycleClock(noticeId)
    const failure = new Error('Owned correspondence review write failed')
    await expect(
      observeTestPostgresClientQueries(
        () => rejectCopyrightEmailCorrespondence(input),
        async query => {
          if (query.text.includes('/* rejectCopyrightEmailCorrespondence */')) throw failure
        },
      ),
    ).rejects.toBe(failure)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.emailCorrespondenceReviews).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(row => row.change_type === 'email_correspondence_rejected'),
    ).toEqual([])
    expect(await readCopyrightCaseLifecycleClock(noticeId)).toEqual(before)
    expect(await readCopyrightEmailManualAssociationReview(input.intakeId)).toEqual([
      { copyright_notice_id: noticeId, action: 'pending' },
    ])
    await expect(rejectCopyrightEmailCorrespondence(input)).resolves.toEqual({
      noticeId,
      isDuplicate: false,
    })
  })
})
