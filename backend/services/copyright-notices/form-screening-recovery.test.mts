import { seedCompletedTestCopyrightFormScreening } from '@voucha/test-helpers/copyright-form-screenings'
import { describe, expect, it } from 'vitest'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  createTestCopyrightFormIntakeReview,
  liftTestCopyrightRestriction,
  readTestLatestCopyrightFormScreeningRecommendation,
} from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  searchPendingCopyrightEnforcementAssessmentIds,
  searchRecoverableCopyrightFormReviewIntakeIds,
} from './index.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedCopyrightSubmissionAssessment } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createScreenRecoveryScene,
  seedScreenRecoveryAssessment,
  seedScreenRecoveryRestriction,
  seedScreenRecoveryRejectedEffect,
} from '@voucha/test-helpers/copyright-screen-recovery-fixtures'
import {
  assertScreenEffectRecovery,
  assertRejectedScreenRecovery,
} from '@voucha/test-helpers/copyright-screen-recovery-subjects'
import { readScreenRecoveryState } from '@voucha/test-helpers/copyright-screen-recovery-state'

describe('copyright form-screening recovery', () => {
  useAutomaticProvisionalWithholding()

  it('repairs a saved clear screen through its durable effect without another screening run', async () => {
    expect.hasAssertions()
    const scene = await createScreenRecoveryScene()
    expect((await readScreenRecoveryState(scene)).formEffects).toEqual([
      { kind: 'form-effect', submissionId: scene.notice.intake.copyright_notice_submission_id },
    ])
    await assertScreenEffectRecovery(scene)
  })

  it('does not recover an invalid initial screen', async () => {
    const { intake } = await createSignedInCopyrightForm()
    await seedCompletedTestCopyrightFormScreening({
      intakeId: intake.id,
      inputSha256: Buffer.alloc(32, 99),
      recommendation: 'invalid_or_spam',
      rationale: 'The latest input is invalid.',
      guidance: testCopyrightFormGuidance,
      promptVersion: 'copyright-form-screening-v3',
      model: 'test-model',
    })
    await expect(readTestLatestCopyrightFormScreeningRecommendation(intake.id)).resolves.toBe(
      'invalid_or_spam',
    )
    await expect(
      readTestPendingCopyrightAgentDispatches(intake.copyright_notice_submission_id),
    ).resolves.toEqual([])
  })

  it('repairs an unprocessed target while retaining a lifted target', async () => {
    expect.hasAssertions()
    const scene = await createScreenRecoveryScene(2)
    const assessment = await seedScreenRecoveryAssessment(scene)
    const restriction = await seedScreenRecoveryRestriction(scene, assessment.id)
    await liftTestCopyrightRestriction(restriction.id)
    const before = await readScreenRecoveryState(scene)
    expect(before.formEffects).toEqual([
      { kind: 'form-effect', submissionId: scene.notice.intake.copyright_notice_submission_id },
    ])
    expect(before.effective.state.restrictions).toEqual([
      expect.objectContaining({ id: restriction.id, lifted: expect.any(Date) }),
    ])
    await assertScreenEffectRecovery(scene, { assessmentId: assessment.id, index: 1 })
  })

  it.each([true, false])(
    'recovers a durable rejection after automatic imposition: %s',
    async screenFirst => {
      expect.hasAssertions()
      const scene = await createScreenRecoveryScene()
      if (screenFirst) {
        const assessment = await seedScreenRecoveryAssessment(scene)
        await seedScreenRecoveryRestriction(scene, assessment.id)
      }
      await createTestCopyrightFormIntakeReview({
        intakeId: scene.notice.intake.id,
        moderatorId: scene.moderator.id,
        is_accepted: false,
      })
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchRecoverableCopyrightFormReviewIntakeIds,
          scene.notice.intake.id,
        ),
      ).resolves.toEqual([scene.notice.intake.id])
      await assertRejectedScreenRecovery(scene)
    },
  )

  it.each([true, false])(
    'keeps the committed rejection authoritative across projection and replay, previously screened: %s',
    async screenFirst => {
      const scene = await createScreenRecoveryScene()
      if (screenFirst) {
        const assessment = await seedScreenRecoveryAssessment(scene)
        await seedScreenRecoveryRestriction(scene, assessment.id)
      }
      await createTestCopyrightFormIntakeReview({
        intakeId: scene.notice.intake.id,
        moderatorId: scene.moderator.id,
        is_accepted: false,
      })
      await seedScreenRecoveryRejectedEffect(scene)
      const before = await readScreenRecoveryState(scene)
      expect(before.assessments.at(-1)).toMatchObject({
        reviewer: scene.moderator.id,
        screening: null,
      })
      expect(before.effective.state.assessments.at(-1)).toMatchObject({ compliant: false })
      expect(before.formEffects).toEqual([])
      expect(before.reviewRecovery).toEqual([])
      const restrictions = screenFirst ? [{ review: 'reverse', lifted: null }] : []
      const retained = before.effective.state.restrictions.map(({ review, lifted }) => ({
        review,
        lifted,
      }))
      expect(retained).toEqual(restrictions)
      await assertRejectedScreenRecovery(scene, true)
    },
  )

  it('lists an owned assessment with unrestricted targets until its enforcement commit', async () => {
    expect.hasAssertions()
    const scene = await createScreenRecoveryScene()
    const assessment = await seedScreenRecoveryAssessment(scene)
    await expect(
      readTestOwnedCopyrightSweepIds(searchPendingCopyrightEnforcementAssessmentIds, assessment.id),
    ).resolves.toEqual([assessment.id])
    await assertScreenEffectRecovery(scene, { assessmentId: assessment.id, enforcementOnly: true })
  })

  it('removes a committed fulfilled assessment from the enforcement and form-effect queues', async () => {
    const scene = await createScreenRecoveryScene()
    const assessment = await seedScreenRecoveryAssessment(scene)
    await seedScreenRecoveryRestriction(scene, assessment.id)
    const state = await readScreenRecoveryState(scene)
    expect(state.enforcement).toEqual([])
    expect(state.formEffects).toEqual([])
    expect(state.effective.state.restrictions).toEqual([expect.objectContaining({ lifted: null })])
  })

  it('retains both the historical lifted target and independently committed current target', async () => {
    const scene = await createScreenRecoveryScene(2)
    const assessment = await seedScreenRecoveryAssessment(scene)
    const first = await seedScreenRecoveryRestriction(scene, assessment.id)
    await liftTestCopyrightRestriction(first.id)
    const second = await seedScreenRecoveryRestriction(scene, assessment.id, 1)
    const aggregate = await getCopyrightNoticePrivateAggregate(
      scene.notice.intake.copyright_notice_id,
    )
    expect(aggregate!.restrictions).toEqual([
      expect.objectContaining({ id: first.id, lifted_at: expect.any(Date) }),
      expect.objectContaining({ id: second.id, lifted_at: null }),
    ])
    expect((await readScreenRecoveryState(scene)).formEffects).toEqual([])
  })

  it('does not overwrite a current human rejection with automated screening', async () => {
    expect.hasAssertions()
    const scene = await createScreenRecoveryScene()
    await seedCopyrightSubmissionAssessment({
      submissionId: scene.notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: scene.moderator,
      substantiallyCompliant: false,
    })
    await assertScreenEffectRecovery(scene, { noop: true })
  })
})
