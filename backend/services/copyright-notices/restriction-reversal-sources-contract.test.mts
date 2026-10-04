import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users/get'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  createTestLiftNotice,
  readTestLiftReversalFacts,
  readTestLiftSourceFlags,
  replayTestLiftConfirmationConsequences,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { liftCopyrightRestrictionWithoutSetter } from './restriction-lifts.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import {
  completeCopyrightMandatoryHumanReview,
  createCopyrightAppeal,
  processCopyrightActionIntent,
  reviewCopyrightAppeal,
} from './index.mts'

const onlySource = (source: 'review' | 'appeal' | 'administrator_lift') => ({
  reversal_authorized: true,
  reversal_by_review: source === 'review',
  reversal_by_appeal: source === 'appeal',
  reversal_by_administrator_lift: source === 'administrator_lift',
})

async function applyRestore(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restore = aggregate?.actionIntents.find(intent => intent.action === 'restore')
  if (!restore) throw new Error('Reversal restore intent missing')
  return processCopyrightActionIntent(restore.id)
}

describe('independent copyright reversal sources', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('leaves every reversal predicate false before any reversal is recorded', async () => {
    const fixture = await createTestCopyrightImageFixture('topic-logo-image')
    const restricted = await createTestCopyrightRestrictionForImage(fixture)
    expect(await readTestLiftSourceFlags(restricted.restrictionId)).toEqual({
      reversal_authorized: false,
      reversal_by_review: false,
      reversal_by_appeal: false,
      reversal_by_administrator_lift: false,
    })
  })

  it('authorizes an administrator lift alone and preserves its owner-notice cause', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('topic-logo-image')
    const { noticeId, restrictions, actionIntents } = await createTestLiftNotice([fixture])
    const withhold = actionIntents.find(intent => intent.action === 'withhold')
    if (!withhold) throw new Error('Withhold intent missing')
    await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
    const administrator = await createTestUserDirect({ administrator: true })
    await liftCopyrightRestrictionWithoutSetter({
      currentUser: administrator,
      noticeId,
      restrictionId: restrictions[0]!.id,
      rationale: 'Provider-owned image restored.',
      liftedAt: new Date(),
    })
    expect(await readTestLiftReversalFacts(restrictions[0]!.id)).toMatchObject(
      onlySource('administrator_lift'),
    )
    await expect(applyRestore(noticeId)).resolves.toBe('applied')
  })

  it('authorizes a reviewed appeal alone and keeps appeal wording', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const restricted = await createTestCopyrightRestrictionForImage(fixture)
    await expect(processCopyrightActionIntent(restricted.withholdIntentId)).resolves.toBe('applied')
    await completeCopyrightMandatoryHumanReview({
      noticeId: restricted.noticeId,
      restrictionId: restricted.restrictionId,
      currentUser: restricted.moderator,
      action: 'confirm',
      rationale: 'Confirm the restriction before the appeal.',
      reviewedAt: new Date(),
    })
    const beforeIncident = (
      await getCopyrightRepeatInfringerAccount(fixture.actorUserId)
    ).incidents.find(incident => incident.copyright_notice_id === restricted.noticeId)
    expect(beforeIncident?.operative).toBe(true)
    const appellant = await getPrivateUserByAny(fixture.actorUserId)
    if (!appellant) throw new Error('Appellant disappeared')
    const appeal = await createCopyrightAppeal(
      appellant,
      restricted.noticeId,
      crypto.randomUUID(),
      {
        reason: 'I created this image.',
        targetIds: [restricted.targetId],
      },
    )
    await reviewCopyrightAppeal({
      submissionId: appeal.submission.id,
      currentUser: restricted.moderator,
      recommendationId: null,
      manualFallbackReason: 'Manual review required.',
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: restricted.restrictionId, action: 'reverse' }],
    })
    expect(await readTestLiftReversalFacts(restricted.restrictionId)).toMatchObject(
      onlySource('appeal'),
    )
    const afterIncident = (
      await getCopyrightRepeatInfringerAccount(fixture.actorUserId)
    ).incidents.find(incident => incident.copyright_notice_id === restricted.noticeId)
    expect(afterIncident?.operative).toBe(false)
    await expect(applyRestore(restricted.noticeId)).resolves.toBe('applied')
    const text = (await readTestCopyrightStatementIntents(restricted.noticeId)).find(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )?.text
    expect(text).toContain('the appeal reversed the decision')
  })

  describe('staydown registration after an administrator lift', () => {
    useStaydownMatching()

    it('removes its confirmed entry at the lift and cannot register it again', async () => {
      const fixture = await createTestCopyrightImageFixture('topic-logo-image')
      const { noticeId, restrictions } = await createTestLiftNotice([fixture])
      expect(await readCopyrightStaydownEntries(noticeId)).toEqual([
        expect.objectContaining({ copyright_restriction_id: restrictions[0]!.id }),
      ])
      const administrator = await createTestUserDirect({ administrator: true })
      await liftCopyrightRestrictionWithoutSetter({
        currentUser: administrator,
        noticeId,
        restrictionId: restrictions[0]!.id,
        rationale: 'Withdraw the provider decision.',
        liftedAt: new Date(),
      })
      expect(await readCopyrightStaydownEntries(noticeId)).toEqual([])
      await replayTestLiftConfirmationConsequences(noticeId)
      expect(await readCopyrightStaydownEntries(noticeId)).toEqual([])
    })
  })

  describe('provisional review reversal', () => {
    useCopyrightIntakeEnvironment()
    useAutomaticProvisionalWithholding()

    it('authorizes human review alone and keeps review wording', async () => {
      installTestMediaDeliveryEdge()
      const poster = await createTestUser()
      const { notice } = await createClearScreenedForm(1, { poster })
      const noticeId = notice.intake.copyright_notice_id
      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      const restriction = aggregate?.restrictions[0]
      const withhold = aggregate?.actionIntents.find(intent => intent.action === 'withhold')
      if (!restriction || !withhold) throw new Error('Provisional restriction missing')
      await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
      const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
      await completeCopyrightMandatoryHumanReview({
        noticeId,
        restrictionId: restriction.id,
        currentUser: moderator,
        action: 'reverse',
        rationale: 'The notice was mistaken.',
        reviewedAt: new Date(),
      })
      expect(await readTestLiftReversalFacts(restriction.id)).toMatchObject(onlySource('review'))
      await expect(applyRestore(noticeId)).resolves.toBe('applied')
      const text = (await readTestCopyrightStatementIntents(noticeId)).find(
        row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
      )?.text
      expect(text).toContain('human review reversed the decision')
    })
  })
})
