import { readCopyrightAssessmentPointers } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createCopyrightNoticeForManualAssociation,
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from '@voucha/test-helpers/copyright-email-manual-association'
import {
  copyrightEmailMessageId,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { failTestCopyrightDeliveryIntent } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  replayDeliveryAndAssociateCopyrightEmail,
  assessAndAssociateCopyrightEmail,
} from '@voucha/test-helpers/copyright-admission-association-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'

describe('copyright failed delivery recovery and intake association', () => {
  it('retains exactly the committed assessment or source association', async () => {
    const currentUser = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: null,
      receivedAt: new Date(),
      bodyCiphertext: 'Owned assessment source.',
    })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    const result = await assessAndAssociateCopyrightEmail(
      {
        currentUser,
        submissionId: submission.id,
        substantiallyCompliant: true,
        assessedAt: new Date(),
      },
      noticeId,
      reply.intakeId,
    )
    const after = await getCopyrightNoticePrivateAggregate(noticeId)
    const assessmentId = after?.assessments[0]?.id ?? null
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const associationConflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'copyright_email_thread_changed',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const assessmentSuccess = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({
        id: assessmentId,
        copyright_notice_submission_id: submission.id,
      }),
    })
    const associationSuccess = {
      status: 'fulfilled',
      value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: reply.intakeId } },
    }
    const state = {
      ...result,
      assessments: after?.assessments.map(row => row.id),
      pointer: (await readCopyrightAssessmentPointers(noticeId)).find(
        row => row.id === submission.id,
      )?.current_assessment_identity_id,
      assessmentEvents: after?.lifecycleEvents
        .filter(row => row.change_type === 'submission_assessed')
        .map(row => row.copyright_notice_submission_assessment_identity_id),
      links: await readCopyrightEmailIntakeNoticeLinks(reply.intakeId),
      reviews: await readCopyrightEmailManualAssociationReview(reply.intakeId),
      audits: await readCopyrightEmailManualAssociationEvent(reply.intakeId),
    }
    const associated = {
      links: [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
      reviews: [{ copyright_notice_id: noticeId, action: 'pending' }],
      audits: [
        {
          copyright_notice_id: noticeId,
          changed_by_id: currentUser.id,
          copyright_notice_email_intake_id: reply.intakeId,
        },
      ],
    }
    expect([
      {
        assessment: assessmentSuccess,
        association: associationConflict,
        assessments: [assessmentId],
        pointer: assessmentId,
        assessmentEvents: [assessmentId],
        links: [],
        reviews: [],
        audits: [],
      },
      {
        assessment: conflict,
        association: associationSuccess,
        assessments: [],
        pointer: null,
        assessmentEvents: [],
        ...associated,
      },
      {
        assessment: conflict,
        association: associationConflict,
        assessments: [],
        pointer: null,
        assessmentEvents: [],
        links: [],
        reviews: [],
        audits: [],
      },
    ]).toContainEqual(state)
  })

  it('retains exactly the committed recovery or source association', async () => {
    const currentUser = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [copyrightEmailMessageId()],
    })
    const intent = await createCopyrightDeliveryIntent({
      noticeId,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: currentUser.id,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `recovery-association-${crypto.randomUUID()}`,
    })
    await failTestCopyrightDeliveryIntent(intent.id)
    const result = await replayDeliveryAndAssociateCopyrightEmail(
      currentUser,
      noticeId,
      intent.id,
      reply.intakeId,
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const associationConflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'copyright_email_thread_changed',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const associationSuccess = {
      status: 'fulfilled',
      value: { copyright_notice: { id: noticeId }, copyright_email_intake: { id: reply.intakeId } },
    }
    const state = {
      ...result,
      links: await readCopyrightEmailIntakeNoticeLinks(reply.intakeId),
      reviews: await readCopyrightEmailManualAssociationReview(reply.intakeId),
      audits: await readCopyrightEmailManualAssociationEvent(reply.intakeId),
      intentState: aggregate?.deliveryIntents.find(row => row.id === intent.id)?.state,
      replayEvents: aggregate?.lifecycleEvents.filter(
        row => row.change_type === 'delivery_intent_replayed',
      ).length,
    }
    expect([
      {
        replayed: { status: 'fulfilled', value: true },
        association: associationConflict,
        links: [],
        reviews: [],
        audits: [],
        intentState: 'pending',
        replayEvents: 1,
      },
      {
        replayed: conflict,
        association: associationSuccess,
        links: [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
        reviews: [{ copyright_notice_id: noticeId, action: 'pending' }],
        audits: [
          {
            copyright_notice_id: noticeId,
            changed_by_id: currentUser.id,
            copyright_notice_email_intake_id: reply.intakeId,
          },
        ],
        intentState: 'failed',
        replayEvents: 0,
      },
      {
        replayed: conflict,
        association: associationConflict,
        links: [],
        reviews: [],
        audits: [],
        intentState: 'failed',
        replayEvents: 0,
      },
    ]).toContainEqual(state)
  })
})
