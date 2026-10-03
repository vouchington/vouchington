import { markCopyrightDeliveryIntentSent } from './delivery-intents.mts'
import { copyrightEmailSubject } from './statement-of-reasons-wording.mts'
import { listNotifications } from '@services/notifications'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import {
  readTestCopyrightStatementIntents,
  replayTestCopyrightStatementNotices,
  createTestCopyrightLiftStatement,
} from '@voucha/test-helpers/services/copyright-notices/statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { completeCopyrightMandatoryHumanReview } from './human-review.mts'
import {
  deliverCopyrightInAppNotification,
  prepareCopyrightEmailDelivery,
} from './delivery-transport.mts'

describe('poster statements on human imposition', () => {
  useCopyrightIntakeEnvironment()
  it('records both channels and in-app informed-at time', async () => {
    const poster = await createTestUser()
    const notice = await createSignedInCopyrightForm(1, { poster })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      accepted: true,
      rationale: 'Complete notice.',
    })
    const intents = (
      await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    ).filter(row => row.recipient_role === 'poster')
    expect(intents).toHaveLength(2)
    expect(intents.every(row => row.recipient_user_id === poster.id)).toBe(true)
    expect(intents.find(row => row.channel === 'email')?.text).toContain('globally')
    expect(intents.find(row => row.channel === 'email')?.text).toContain(
      'A person made this decision',
    )
    expect(intents.find(row => row.channel === 'email')?.text).toContain('/counter-notice')
    expect(
      await deliverCopyrightInAppNotification(intents.find(row => row.channel === 'in_app')!.id),
    ).toBe(true)
    const notifications = await listNotifications(poster.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_path: `/copyright/notices/${notice.intake.copyright_notice_id}`,
          body: intents.find(row => row.channel === 'email')!.text!.split('\n\n')[0],
        }),
      ]),
    )
    expect(
      (await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)).find(
        row => row.channel === 'in_app' && row.recipient_role === 'poster',
      )?.sent_at,
    ).toBeInstanceOf(Date)
  })
})

describe('poster first human review statements', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()
  it('delivers all new email subjects and in-app kinds with per-recipient sent times', async () => {
    const poster = await createTestUser()
    const { notice } = await createClearScreenedForm(1, { poster })
    const caseId = notice.intake.copyright_notice_id
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    const restriction = (await getCopyrightNoticePrivateAggregate(caseId))!.restrictions[0]!
    await completeCopyrightMandatoryHumanReview({
      noticeId: caseId,
      restrictionId: restriction.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      action: 'reverse',
      rationale: 'A person reviewed the record.',
      reviewedAt: new Date(),
    })
    await createTestCopyrightLiftStatement({
      noticeId: caseId,
      restrictionId: restriction.id,
      targetId: restriction.copyright_notice_target_id,
    })
    const intents = (await readTestCopyrightStatementIntents(caseId)).filter(
      row => row.delivery_kind !== 'poster_restriction_notice',
    )
    for (const intent of intents.filter(row => row.channel === 'in_app')) {
      expect(await deliverCopyrightInAppNotification(intent.id)).toBe(true)
    }
    for (const intent of intents.filter(row => row.channel === 'email')) {
      const prepared = await prepareCopyrightEmailDelivery(intent.id)
      expect(prepared.subject).toBe(
        copyrightEmailSubject(
          intent.delivery_kind as
            | 'poster_review_notice'
            | 'poster_restoration_notice'
            | 'claimant_decision_notice',
        ),
      )
      expect(prepared.text).toBe(intent.text)
      expect(
        await markCopyrightDeliveryIntentSent({
          intentId: intent.id,
          leaseToken: prepared.leaseToken,
          sesMessageId: `statement-${crypto.randomUUID()}`,
        }),
      ).toBe(true)
    }
    const delivered = await readTestCopyrightStatementIntents(caseId)
    expect(
      delivered
        .filter(row => row.delivery_kind !== 'poster_restriction_notice')
        .every(row => row.sent_at instanceof Date),
    ).toBe(true)
    expect(
      new Set(intents.filter(row => row.channel === 'email').map(row => row.delivery_kind)),
    ).toEqual(
      new Set(['poster_review_notice', 'poster_restoration_notice', 'claimant_decision_notice']),
    )
  })
  it.each(['confirm', 'reverse'] as const)(
    'keeps the %s decision durable independently of restoration',
    async action => {
      const { notice } = await createClearScreenedForm()
      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
      const caseId = notice.intake.copyright_notice_id
      const restriction = (await getCopyrightNoticePrivateAggregate(caseId))!.restrictions[0]!
      await completeCopyrightMandatoryHumanReview({
        noticeId: caseId,
        restrictionId: restriction.id,
        currentUser: await createTestUser({ extraRoles: ['moderator'] }),
        action,
        rationale: 'A person reviewed the notice.',
        reviewedAt: new Date(),
      })
      await replayTestCopyrightStatementNotices(caseId, restriction.id, action)
      const intents = await readTestCopyrightStatementIntents(caseId)
      expect(intents.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
      expect(intents.filter(row => row.delivery_kind === 'poster_restoration_notice')).toHaveLength(
        0,
      )
      expect(
        intents.find(row => row.delivery_kind === 'poster_review_notice' && row.channel === 'email')
          ?.text,
      ).toContain('A person made this decision')
      expect(intents.filter(row => row.delivery_kind === 'claimant_decision_notice')).toHaveLength(
        4,
      )
    },
  )
})
