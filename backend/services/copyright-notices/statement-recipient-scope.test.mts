import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { completeCopyrightMandatoryHumanReview } from './human-review.mts'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createMultiOwnerStatementFixture,
  markStatementPosterDeleted,
  reassignStatementTargetToTombstone,
  withStatementPosterLifecycleFence,
} from '@voucha/test-helpers/services/copyright-notices/statement-recipient-fixture'
import {
  createSignedInCopyrightForm,
  createClearScreenedForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  readTestCopyrightStatementIntents,
  replayTestCopyrightStatementNotices,
  createTestCopyrightLiftStatement,
} from '@voucha/test-helpers/services/copyright-notices/statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { getCopyrightParticipantNoticeDetail } from './read-models.mts'

describe('statement recipient scope and lifecycle', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()
  it('never leaks another owner target or a non-public URL into stored poster text', async () => {
    const { notice, targets } = await createMultiOwnerStatementFixture()
    const [publicTarget, privateTarget] = targets
    const intents = await readTestCopyrightStatementIntents(notice.id)
    const publicStatement = intents.find(
      row => row.recipient_user_id === publicTarget.owner.id && row.channel === 'email',
    )!
    const privateStatement = intents.find(
      row => row.recipient_user_id === privateTarget.owner.id && row.channel === 'email',
    )!
    expect(publicStatement.text).toContain(publicTarget.hostedUseUrl)
    expect(publicStatement.text).not.toContain(privateTarget.hostedUseUrl)
    expect(privateStatement.text).not.toContain(publicTarget.hostedUseUrl)
    expect(privateStatement.text).not.toContain(privateTarget.hostedUseUrl)
    for (const target of targets) {
      const detail = await getCopyrightParticipantNoticeDetail(notice.id, target.owner)
      expect(detail?.statements).toHaveLength(1)
      expect(detail?.statements[0].text).toBe(
        intents.find(row => row.recipient_user_id === target.owner.id && row.channel === 'email')
          ?.text,
      )
    }
  })
  it('preserves initial evidence but creates no later obligations for erased or tombstone posters', async () => {
    const poster = await createTestUser()
    const notice = await createSignedInCopyrightForm(1, { poster })
    const noticeId = notice.intake.copyright_notice_id
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      accepted: true,
      rationale: 'Complete notice.',
    })
    const aggregate = (await getCopyrightNoticePrivateAggregate(noticeId))!
    const restriction = aggregate.restrictions[0]!
    const initial = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.recipient_role === 'poster',
    )
    expect(initial).toHaveLength(2)
    await markStatementPosterDeleted(poster.id)
    await replayTestCopyrightStatementNotices(noticeId, restriction.id, 'confirm')
    await reassignStatementTargetToTombstone(aggregate.targets[0].id)
    await createTestCopyrightLiftStatement({
      noticeId,
      targetId: aggregate.targets[0].id,
      restrictionId: restriction.id,
    })
    expect(
      (await readTestCopyrightStatementIntents(noticeId)).filter(
        row => row.recipient_role === 'poster',
      ),
    ).toEqual(initial)
  })
  it('retains claimant email while suppressing new deleted-account in-app delivery', async () => {
    const claimant = await createTestUser()
    const notice = await createSignedInCopyrightForm(1, { claimant })
    await markStatementPosterDeleted(claimant.id)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      accepted: false,
      rationale: 'Incomplete notice.',
    })
    const intents = (
      await readTestCopyrightStatementIntents(notice.intake.copyright_notice_id)
    ).filter(row => row.recipient_role === 'claimant')
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ channel: 'email', recipient_user_id: null })
  })
  it('rolls back a busy same-owner legal transition without waiting and succeeds on retry', async () => {
    const participant = await createTestUser()
    const { notice } = await createClearScreenedForm(1, {
      poster: participant,
      claimant: participant,
    })
    const noticeId = notice.intake.copyright_notice_id
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    const before = (await getCopyrightNoticePrivateAggregate(noticeId))!
    const input = {
      noticeId,
      restrictionId: before.restrictions[0].id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      action: 'confirm' as const,
      rationale: 'Reviewed.',
      reviewedAt: new Date(),
    }
    const intents = await readTestCopyrightStatementIntents(noticeId)
    await withStatementPosterLifecycleFence(participant.id, async () => {
      await expect(completeCopyrightMandatoryHumanReview(input)).rejects.toMatchObject({
        status: 409,
        message: 'Recipient account lifecycle transition is in progress',
      })
      const during = (await getCopyrightNoticePrivateAggregate(noticeId))!
      expect(during.restrictions[0].human_reviewed_at).toBeNull()
      expect(during.lifecycleEvents).toEqual(before.lifecycleEvents)
      expect(await readTestCopyrightStatementIntents(noticeId)).toEqual(intents)
    })
    await expect(completeCopyrightMandatoryHumanReview(input)).resolves.toMatchObject({
      human_review_action: 'confirm',
    })
    expect(
      (await readTestCopyrightStatementIntents(noticeId)).filter(
        row => row.delivery_kind === 'poster_review_notice',
      ),
    ).toHaveLength(2)
  })
})
