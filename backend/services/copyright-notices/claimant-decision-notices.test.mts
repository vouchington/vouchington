import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { listNotifications } from '@services/notifications'
import { deliverCopyrightInAppNotification } from './delivery-transport.mts'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createClearScreenedForm,
  createGuestCopyrightForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  readTestCopyrightStatementIntents,
  replayTestCopyrightClaimantDecision,
} from '@voucha/test-helpers/copyright-statement-notices'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import type { QueryExecutor } from '@data-stores/psql'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { recoverRejectedCopyrightFormReviewEffect } from './form-reviews-recovery.mts'

describe('claimant copyright decision notices', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()
  it('accepts two targets but sends one claimant decision with the receipt address', async () => {
    const notice = await createSignedInCopyrightForm(2)
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      is_accepted: true,
      rationale: 'Complete notice.',
    })
    const intents = await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    expect(intents.filter(row => row.delivery_kind === 'poster_restriction_notice')).toHaveLength(4)
    const decision = intents.filter(row => row.delivery_kind === 'claimant_decision_notice')
    expect(decision).toHaveLength(2)
    expect(decision.find(row => row.channel === 'email')).toMatchObject({
      email: 'claimant@example.test',
      text: expect.stringContaining('/copyright/designated-agent'),
    })
    await replayTestCopyrightClaimantDecision(notice.intake.copyright_notice_id, 'restricted')
    expect(
      (await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)).filter(
        row => row.delivery_kind === 'claimant_decision_notice',
      ),
    ).toHaveLength(2)
  })
  it('sends a guest form decision only to the retained notice email', async () => {
    const notice = await createGuestCopyrightForm()
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: true,
      rationale: 'Complete notice.',
    })
    const decision = (
      await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    ).filter(row => row.delivery_kind === 'claimant_decision_notice')
    expect(decision).toHaveLength(1)
    expect(decision[0]).toMatchObject({
      channel: 'email',
      recipient_user_id: null,
      email: 'claimant@example.test',
    })
    expect(decision[0].text).not.toContain('case page')
    expect(decision[0].text).toContain('/copyright/designated-agent')
    expect(decision[0].text).toContain('judicial redress through a court')
  })
  it('adds one reversed notifier decision when staff reject an automatically restricted notice', async () => {
    const { notice } = await createClearScreenedForm()
    const caseId = notice.intake.copyright_notice_id
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: false,
      rationale: 'Incomplete notice after review.',
    })
    await recoverRejectedCopyrightFormReviewEffect(notice.intake.id)
    await recoverRejectedCopyrightFormReviewEffect(notice.intake.id)
    const decisions = (await readTestCopyrightStatementIntents(caseId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice',
    )
    expect(decisions).toHaveLength(6)
    const emails = decisions.filter(row => row.channel === 'email')
    expect(emails.filter(row => row.text?.includes('We could not accept'))).toHaveLength(1)
    expect(emails.filter(row => row.text?.includes('reversed'))).toHaveLength(1)
  })
  it('sends reversed after a restricted claimant notice even when no restriction remains active', async () => {
    const notice = await createSignedInCopyrightForm()
    const caseId = notice.intake.copyright_notice_id
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: false,
      rationale: 'Incomplete notice after review.',
    })
    expect(await countCopyrightActiveRestrictionsForNotice(caseId)).toBe(0)

    await replayTestCopyrightClaimantDecision(caseId, 'restricted')
    expect(await countCopyrightActiveRestrictionsForNotice(caseId)).toBe(0)
    await replayTestCopyrightClaimantDecision(caseId, 'reversed')

    const decisions = (await readTestCopyrightStatementIntents(caseId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice',
    )
    const reversed = decisions.filter(row => row.text?.includes('reversed'))
    expect(reversed).toHaveLength(2)
    expect(new Set(reversed.map(row => row.channel))).toEqual(new Set(['in_app', 'email']))
  })
  it('rejects a form once and recovery does not duplicate the decision', async () => {
    const notice = await createSignedInCopyrightForm()
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: false,
      rationale: 'Incomplete notice.',
    })
    await recoverRejectedCopyrightFormReviewEffect(notice.intake.id)
    const decision = (
      await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    ).filter(row => row.delivery_kind === 'claimant_decision_notice')
    expect(decision).toHaveLength(2)
    const notification = decision.find(row => row.channel === 'in_app')!
    expect(await deliverCopyrightInAppNotification(notification.id)).toBe(true)
    const notifier = (await listNotifications(notification.recipient_user_id!)).notifications
    expect(Object.values(notifier)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_notice_id: notice.intake.copyright_notice_id,
          target_path: null,
          target_intent: 'notifications_inbox',
          body: expect.stringContaining('/copyright/notices/new'),
        }),
      ]),
    )
    expect(decision.find(row => row.channel === 'email')?.text).toContain('/copyright/notices/new')
    expect(decision.find(row => row.channel === 'email')?.text).toContain(
      'A person made this decision',
    )
  })
  it('recovers an in-flight real rejection without sending a contradictory reversal or duplicate decision', async () => {
    const notice = await createSignedInCopyrightForm()
    const caseId = notice.intake.copyright_notice_id
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const assessed = Promise.withResolvers<void>()
    const resumeRejection = Promise.withResolvers<void>()
    const recoveryStarted = Promise.withResolvers<void>()
    const pending: Promise<unknown>[] = []
    const reset = interceptPostgresTransactionsForTest(
      transaction =>
        new Proxy(transaction, {
          async apply(target, thisArgument, args: Parameters<QueryExecutor>) {
            const [statement, parameters] = args
            const text = typeof statement === 'string' ? statement : statement.text
            const values = typeof statement === 'string' ? (parameters ?? []) : statement.values
            if (
              text.includes('recoverRejectedCopyrightFormReviewEffect:lock') &&
              values.includes(`copyright-form-review:${notice.intake.id}`)
            )
              recoveryStarted.resolve()
            const result = await Reflect.apply(target, thisArgument, args)
            if (
              text.includes('appendCopyrightSubmissionAssessment:currentResult') &&
              values.includes(notice.intake.copyright_notice_submission_id)
            ) {
              assessed.resolve()
              await resumeRejection.promise
            }
            return result
          },
        }),
    )
    try {
      const rejection = reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        is_accepted: false,
        rationale: 'Incomplete notice.',
      })
      pending.push(rejection)
      await Promise.race([
        assessed.promise,
        rejection.then(() => {
          throw new Error('Rejection exited before its assessment was written')
        }),
      ])
      const recovery = recoverRejectedCopyrightFormReviewEffect(notice.intake.id)
      pending.push(recovery)
      await Promise.race([
        recoveryStarted.promise,
        recovery.then(() => {
          throw new Error('Recovery exited before its owned review query')
        }),
      ])
      resumeRejection.resolve()
      await Promise.all([rejection, recovery])
    } finally {
      resumeRejection.resolve()
      reset()
      await Promise.allSettled(pending)
    }
    await recoverRejectedCopyrightFormReviewEffect(notice.intake.id)
    const aggregate = await getCopyrightNoticePrivateAggregate(caseId)
    expect(aggregate?.assessments).toContainEqual(
      expect.objectContaining({
        is_substantially_compliant: false,
        assessed_by_id: moderator.id,
      }),
    )
    const decisions = (await readTestCopyrightStatementIntents(caseId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice',
    )
    expect(decisions).toHaveLength(2)
    expect(new Set(decisions.map(row => row.channel))).toEqual(new Set(['in_app', 'email']))
    expect(decisions.every(row => row.text?.includes('We could not accept'))).toBe(true)
    expect(decisions.some(row => row.text?.includes('reversed'))).toBe(false)
    expect(await countCopyrightActiveRestrictionsForNotice(caseId)).toBe(0)
  })
})
