import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createCopyrightNoticeForManualAssociation,
  readCopyrightEmailManualAssociationEvent,
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
  it('commits a current assessment and the concurrent source association', async () => {
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
    expect(result.assessment.copyright_notice_submission_id).toBe(submission.id)
    const after = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(after?.submissions.find(row => row.id === submission.id)).toMatchObject({
      current_assessment_identity_id: result.assessment.id,
    })
    expect(after?.assessments.find(row => row.id === result.assessment.id)).toBeDefined()
    expect(
      after?.lifecycleEvents.filter(
        row => row.copyright_notice_submission_assessment_identity_id === result.assessment.id,
      ),
    ).toHaveLength(1)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(reply.intakeId)).toHaveLength(1)
  })

  it('commits the reset, one replay audit and the concurrent source association', async () => {
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
    expect(result.replayed).toBe(true)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.intakeId)).toEqual([
      { copyright_notice_id: noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(reply.intakeId)).toHaveLength(1)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.deliveryIntents.find(row => row.id === intent.id)?.state).toBe('pending')
    expect(
      aggregate?.lifecycleEvents.filter(row => row.change_type === 'delivery_intent_replayed'),
    ).toHaveLength(1)
  })
})
